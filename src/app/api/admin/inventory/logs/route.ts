import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth";
import { isUuid } from "@/lib/orders";
import { parseUndoneLogIds, stripMarks, undoScanPattern } from "../marks";

/* ============================================================
   GET /api/admin/inventory/logs — 입출고 이력
   ?page=1 &limit=20
   &q=검색어(선택) — 상품명으로 좁혀 보기
   &productId=uuid(선택)  — 특정 상품만
   &variantId=uuid|none(선택) — 특정 옵션만 / none 이면 옵션 없는(상품 단위) 이력만
   &reason=order|cancel|restock|adjust|initial(선택)
   &from=ISO &to=ISO(선택) — 기간
   → { logs: [{...log, product_name, variant_name, order?}], total, page, totalPages }

   기간은 브라우저에서 계산한 ISO 문자열을 그대로 받는다.
   서버에서 yyyy-mm-dd 를 해석하면 시간대가 UTC 로 잡혀 관리자가 보는 날짜와 하루가 어긋난다.
   ============================================================ */

const REASONS = ["order", "cancel", "restock", "adjust", "initial"] as const;

interface LogRow {
  id: number;
  product_id: string;
  variant_id: string | null;
  delta: number;
  reason: string;
  ref_order_id: string | null;
  memo: string | null;
  created_at: string;
  products: { name: string } | null;
  product_variants: { name: string } | null;
}

/** ISO 로 파싱되는 문자열만 통과 — 잘못된 값은 필터를 걸지 않고 무시한다 */
function isoOrNull(v: string | null): string | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? "20", 10) || 20));
  const productId = sp.get("productId");
  const variantId = sp.get("variantId");
  const reason = sp.get("reason");
  const from = isoOrNull(sp.get("from"));
  const to = isoOrNull(sp.get("to"));
  // 상품명으로 좁혀 보기.
  // 이력 표에는 상품 이름이 저장돼 있지 않고 참조만 있어서, 이름으로 거르려면 상품 쪽을
  // '반드시 있어야 하는 짝'으로 걸어야 한다. 그냥 붙이면 이름이 맞지 않는 줄까지 전부 따라온다.
  const q = (sp.get("q") ?? "").trim().slice(0, 60);

  let query = service
    .from("inventory_logs")
    .select(
      `id, product_id, variant_id, delta, reason, ref_order_id, memo, created_at, products${
        q ? "!inner" : ""
      }(name), product_variants(name)`,
      { count: "exact" }
    );

  if (q) query = query.ilike("products.name", `%${q}%`);

  if (productId && isUuid(productId)) query = query.eq("product_id", productId);
  // 옵션 상품의 "상품 자체 재고" 이력만 보고 싶을 때가 있다 — 고객 화면 잠김을 추적하는 경로다
  if (variantId === "none") query = query.is("variant_id", null);
  else if (variantId && isUuid(variantId)) query = query.eq("variant_id", variantId);
  if (reason && REASONS.includes(reason as (typeof REASONS)[number])) {
    query = query.eq("reason", reason);
  }
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to);

  const offset = (page - 1) * limit;
  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[admin/inventory] 이력 조회 실패:", error.message);
    return NextResponse.json({ error: "입출고 이력을 불러오지 못했습니다." }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as LogRow[];

  // ref_order_id → 주문번호 병합 (inventory_logs에는 FK가 없어 별도 조회)
  const orderIds = [...new Set(rows.map((r) => r.ref_order_id).filter((v): v is string => !!v))];
  const orderMap = new Map<string, string>();
  if (orderIds.length > 0) {
    const { data: orders } = await service
      .from("orders")
      .select("id, order_no")
      .in("id", orderIds);
    for (const o of (orders ?? []) as { id: string; order_no: string }[]) {
      orderMap.set(o.id, o.order_no);
    }
  }

  // 이미 되돌린 이력인지 — 되돌리기로 생긴 줄의 메모에 원본 번호가 표식으로 심겨 있다.
  // 이것이 없으면 화면이 되돌리기 버튼을 계속 보여 주고, 관리자는 눌러 본 뒤에야 거절당한다.
  // 되돌린 줄은 원본과 같은 상품에 달리므로 이 페이지의 상품들로 좁혀서 훑으면 충분하다.
  const undoneIds = await readUndoneIds(
    service,
    [...new Set(rows.map((r) => r.product_id))]
  );

  const logs = rows.map(({ products, product_variants, ...log }) => ({
    ...log,
    // 표식은 사람이 읽을 말이 아니다 — 화면·엑셀로 나가기 전에 여기서 지운다
    memo: stripMarks(log.memo),
    product_name: products?.name ?? "(삭제된 상품)",
    variant_name: product_variants?.name ?? null,
    undone: undoneIds.has(log.id),
    order:
      log.ref_order_id && orderMap.has(log.ref_order_id)
        ? { id: log.ref_order_id, order_no: orderMap.get(log.ref_order_id)! }
        : null,
  }));

  const total = count ?? 0;
  return NextResponse.json({
    logs,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
}

/** 되돌리기로 이미 상쇄된 원본 이력 번호들 */
async function readUndoneIds(
  service: SupabaseClient,
  productIds: string[]
): Promise<Set<number>> {
  if (productIds.length === 0) return new Set();
  const { data, error } = await service
    .from("inventory_logs")
    .select("memo")
    .in("product_id", productIds)
    .ilike("memo", undoScanPattern())
    .limit(500);
  if (error) {
    // 되돌림 표시는 편의일 뿐이고 두 번 되돌리는 것은 서버가 따로 막는다 — 조회가 실패해도 목록은 낸다
    console.error("[admin/inventory] 되돌림 표식 조회 실패:", error.message);
    return new Set();
  }
  return parseUndoneLogIds((data ?? []).map((r) => (r as { memo: string | null }).memo));
}
