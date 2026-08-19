import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth";
import { isUuid, cleanStr } from "@/lib/orders";
import { CACHE_TAGS } from "@/lib/cache";
import {
  INVENTORY_PRODUCT_SELECT,
  adjustStockRpc,
  buildInventoryRows,
  isSellingRow,
  readStock,
  type InventoryUnitRow,
  type RawProduct,
} from "./shared";
import { handleUndo, parseUndoTarget } from "./undo";

/* ============================================================
   GET   /api/admin/inventory — 재고 현황 (상품/옵션 단위 행 + 요약 + 경고)
   POST  /api/admin/inventory — 입고/조정 (adjust_stock RPC)
   PATCH /api/admin/inventory — 품절 임박 기준 변경
   ============================================================ */

export type { InventoryUnitRow } from "./shared";

/** 목록에서 놓치면 안 되는 상품 단위 경고 (옵션 재고는 있는데 고객 화면이 잠긴 상품) */
export interface LockedProductAlert {
  product_id: string;
  name: string;
  option_stock_total: number;
  active_option_count: number;
}

/**
 * GET /api/admin/inventory
 * ?q=검색어(상품명/옵션명/품번) &filter=all|low|out|locked|mismatch &sale=all|selling
 * &page=1 &limit=20
 * → { rows, total, page, totalPages, summary, locked, mismatchCount }
 *
 * 카탈로그 규모(수백 품목 이하)를 전제로 전체를 읽어 서버에서 집계/필터한다.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(sp.get("limit") ?? "20", 10) || 20));
  const q = (sp.get("q") ?? "").trim().toLowerCase();
  const filter = sp.get("filter") ?? "all";
  const sale = sp.get("sale") ?? "all";

  const { data, error } = await service
    .from("products")
    .select(INVENTORY_PRODUCT_SELECT)
    .order("name", { ascending: true })
    .limit(1000);

  if (error) {
    console.error("[admin/inventory] 조회 실패:", error.message);
    return NextResponse.json({ error: "재고 현황을 불러오지 못했습니다." }, { status: 500 });
  }

  const allRows = buildInventoryRows((data ?? []) as unknown as RawProduct[]);

  // 요약 — 품절/임박은 "지금 파는 것"만 센다.
  // 전에는 초안·숨김 상품과 판매 중지한 옵션까지 세는 바람에, 아직 팔지도 않는 상품 때문에
  // 상단 카드가 붉게 "품절 1"을 띄웠고 대표가 그것을 찾으러 다니는 일이 있었다.
  const counted = allRows.filter((r) => r.counts_as_unit);
  const selling = counted.filter(isSellingRow);
  // 여기서 isSellingRow 를 또 걸지 않는 이유: storefront_locked 판정 자체가 '판매중' 일 때만 참이다
  // (shared.ts 참조). 임시저장·숨김·품절 상품은 애초에 잠김으로 잡히지 않는다.
  const lockedRows = allRows.filter((r) => r.scope === "product" && r.storefront_locked);
  const summary = {
    total_units: counted.length,
    low_stock: selling.filter(
      (r) => r.stock > 0 && r.threshold !== null && r.stock <= r.threshold
    ).length,
    sold_out: selling.filter((r) => r.stock <= 0).length,
    locked: lockedRows.length,
  };

  const locked: LockedProductAlert[] = lockedRows.slice(0, 20).map((r) => ({
    product_id: r.product_id,
    name: r.name,
    option_stock_total: r.option_stock_total,
    active_option_count: r.active_option_count,
  }));
  const mismatchCount = new Set(
    allRows.filter((r) => r.status_mismatch !== null).map((r) => r.product_id)
  ).size;

  let rows = allRows;
  if (q) {
    rows = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.option_name ?? "").toLowerCase().includes(q) ||
        (r.sku ?? "").toLowerCase().includes(q)
    );
  }
  if (sale === "selling") rows = rows.filter(isSellingRow);

  if (filter === "low") {
    rows = rows.filter(
      (r) => r.counts_as_unit && r.stock > 0 && r.threshold !== null && r.stock <= r.threshold
    );
  } else if (filter === "out") {
    rows = rows.filter((r) => r.counts_as_unit && r.stock <= 0);
  } else if (filter === "locked") {
    rows = rows.filter((r) => r.storefront_locked);
  } else if (filter === "mismatch") {
    rows = rows.filter((r) => r.status_mismatch !== null);
  }

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const pageRows = rows.slice((page - 1) * limit, page * limit);

  await mergeLastLogs(service, pageRows);

  return NextResponse.json({
    rows: pageRows,
    total,
    page,
    totalPages,
    summary,
    locked,
    mismatchCount,
  });
}

/** 페이지에 보이는 행에만 최근 입출고 1건씩 붙인다 (전체를 조회하면 낭비가 크다) */
async function mergeLastLogs(service: SupabaseClient, pageRows: InventoryUnitRow[]) {
  const productIds = [...new Set(pageRows.map((r) => r.product_id))];
  if (productIds.length === 0) return;

  const { data: logs } = await service
    .from("inventory_logs")
    .select("product_id, variant_id, delta, reason, created_at")
    .in("product_id", productIds)
    .order("created_at", { ascending: false })
    .limit(400);

  const latest = new Map<string, { delta: number; reason: string; created_at: string }>();
  for (const log of (logs ?? []) as {
    product_id: string;
    variant_id: string | null;
    delta: number;
    reason: string;
    created_at: string;
  }[]) {
    const key = `${log.product_id}:${log.variant_id ?? ""}`;
    if (!latest.has(key)) {
      latest.set(key, { delta: log.delta, reason: log.reason, created_at: log.created_at });
    }
  }
  for (const row of pageRows) {
    row.last_log = latest.get(`${row.product_id}:${row.variant_id ?? ""}`) ?? null;
  }
}

/**
 * POST /api/admin/inventory — 입고/조정
 * body:
 *   { productId, variantId?, delta(0 아닌 정수), reason: "restock"|"adjust", memo? }
 *   { productId, variantId?, mode: "count", count(0 이상 정수), expectedStock?, memo? }  ← 창고 실사 결과
 *   { undoOfLogId, memo? }                                              ← 입출고 이력 되돌리기
 *
 * 실사 모드를 둔 이유: 창고에서 세어 온 숫자가 87개일 때 관리자가 현재고 300을 보고
 * -213 을 손으로 계산해 넣어야 했다. 뺄셈 한 번마다 사고가 나는 구조라 목표 수량을 직접 받는다.
 *
 * 실사에 expectedStock 을 함께 받는 이유: 실사는 '세어 온 수량으로 덮어쓰기' 라서, 세는 동안
 * 주문이 나갔다면 그 판매까지 없던 일이 되어 초과판매가 된다. 옵션 재고 저장이 이미 같은 방식으로
 * 막고 있어(products/[id]/route.ts) 여기도 화면이 보던 수량을 함께 받아 다르면 손대지 않는다.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  // 되돌리기는 '어느 이력' 만 받는다 — 수량은 서버가 원본 이력에서 직접 읽어 뒤집는다.
  // 같은 이력을 두 번 되돌려 두 번 빠지던 것도 거기서 막는다.
  const undoOfLogId = parseUndoTarget(body.undoOfLogId);
  if (undoOfLogId !== null) {
    const res = await handleUndo(service, undoOfLogId, body.memo);
    if (res.ok) revalidateTag(CACHE_TAGS.products, { expire: 0 });
    return res;
  }

  const { productId, variantId, mode } = body;
  if (!isUuid(productId)) {
    return NextResponse.json({ error: "상품 정보가 올바르지 않습니다." }, { status: 400 });
  }
  if (variantId != null && variantId !== "" && !isUuid(variantId)) {
    return NextResponse.json({ error: "옵션 정보가 올바르지 않습니다." }, { status: 400 });
  }
  const variant = isUuid(variantId) ? variantId : null;
  const memo = cleanStr(body.memo, 200);

  const before = await readStock(service, productId, variant);
  if (before === null) {
    return NextResponse.json({ error: "상품 또는 옵션을 찾을 수 없습니다." }, { status: 404 });
  }

  let delta: number;
  let reason: "restock" | "adjust";

  if (mode === "count") {
    const count = body.count;
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
      return NextResponse.json(
        { error: "실제 세어 본 재고는 0 이상의 정수로 입력해 주세요." },
        { status: 400 }
      );
    }
    if (count > 1000000) {
      return NextResponse.json(
        { error: "한 품목의 재고는 1,000,000개를 넘을 수 없습니다." },
        { status: 400 }
      );
    }
    // 화면이 보고 있던 현재고와 지금 값이 다르면 그 사이에 재고가 움직인 것이다.
    // 그대로 덮어쓰면 그동안 나간 주문까지 되살아나므로 손대지 않고 되돌린다.
    const expected = body.expectedStock;
    if (typeof expected === "number" && Number.isInteger(expected) && expected !== before) {
      const moved = expected - before;
      return NextResponse.json(
        {
          error:
            moved > 0
              ? `세는 사이에 ${moved}개가 나가 지금 재고는 ${before}개입니다. 그 판매를 지우지 않으려고 반영하지 않았습니다. 화면을 새로 고친 뒤 다시 확인해 주세요.`
              : `세는 사이에 재고가 ${expected}개에서 ${before}개로 바뀌어 반영하지 않았습니다. 화면을 새로 고친 뒤 다시 확인해 주세요.`,
        },
        { status: 409 }
      );
    }

    delta = count - before;
    reason = "adjust";
    if (delta === 0) {
      // 창고 수량이 장부와 같으면 이력을 남기지 않는다 (의미 없는 0 이력이 쌓이면 이력이 못 쓰게 된다)
      return NextResponse.json({ ok: true, stock: before, before, delta: 0, unchanged: true });
    }
  } else {
    const raw = body.delta;
    if (typeof raw !== "number" || !Number.isInteger(raw) || raw === 0) {
      return NextResponse.json({ error: "증감 수량은 0이 아닌 정수여야 합니다." }, { status: 400 });
    }
    if (Math.abs(raw) > 100000) {
      return NextResponse.json(
        { error: "한 번에 조정할 수 있는 수량은 100,000개 이하입니다." },
        { status: 400 }
      );
    }
    if (body.reason !== "restock" && body.reason !== "adjust") {
      return NextResponse.json(
        { error: "사유는 입고 또는 조정만 선택할 수 있습니다." },
        { status: 400 }
      );
    }
    delta = raw;
    reason = body.reason;
  }

  const applied = await adjustStockRpc(service, {
    productId,
    variantId: variant,
    delta,
    reason,
    memo,
  });
  if (!applied.ok) {
    const status =
      applied.kind === "insufficient" ? 409 : applied.kind === "notfound" ? 404 : 500;
    return NextResponse.json({ error: applied.message }, { status });
  }

  // 재고가 바뀌었으므로 카탈로그 캐시를 무효화한다.
  // 품절 → 판매중 복귀가 일어나는 유일한 경로라 여기가 빠지면 입고해도 TTL 만료까지 품절로 보인다.
  // { expire: 0 } = 즉시 만료. 권장값 "max"(stale-while-revalidate)를 쓰면 입고 직후 한 번은
  // 낡은 품절 표시가 그대로 나가므로, 관리자가 입고 후 바로 확인하는 이 화면에는 맞지 않는다.
  revalidateTag(CACHE_TAGS.products, { expire: 0 });

  const stock = await readStock(service, productId, variant);
  return NextResponse.json({ ok: true, stock, before, delta });
}

/**
 * PATCH /api/admin/inventory — 품절 임박 기준 변경
 * body: { productId, threshold(0 이상 정수) }
 * 임박 기준 컬럼은 products 에만 있어 옵션별로 다르게 줄 수 없다. 화면에서도 그렇게 안내한다.
 */
export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const { productId, threshold } = body;
  if (!isUuid(productId)) {
    return NextResponse.json({ error: "상품 정보가 올바르지 않습니다." }, { status: 400 });
  }
  if (typeof threshold !== "number" || !Number.isInteger(threshold) || threshold < 0) {
    return NextResponse.json(
      { error: "품절 임박 기준은 0 이상의 정수로 입력해 주세요." },
      { status: 400 }
    );
  }
  if (threshold > 100000) {
    return NextResponse.json(
      { error: "품절 임박 기준은 100,000개 이하로 입력해 주세요." },
      { status: 400 }
    );
  }

  const { error } = await service
    .from("products")
    .update({ low_stock_threshold: threshold })
    .eq("id", productId);

  if (error) {
    console.error("[admin/inventory] 임박 기준 변경 실패:", error.message);
    return NextResponse.json({ error: "품절 임박 기준을 저장하지 못했습니다." }, { status: 500 });
  }

  // 임박 기준은 관리자 화면에서만 쓰는 값이라 고객 카탈로그 캐시를 비울 이유가 없다.
  return NextResponse.json({ ok: true, threshold });
}
