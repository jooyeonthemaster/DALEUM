import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { isUuid, cleanStr } from "@/lib/orders";

/* ============================================================
   GET  /api/admin/inventory — 재고 현황 (상품/옵션 단위 행 + 요약)
   POST /api/admin/inventory — 입고/조정 (adjust_stock RPC)
   ============================================================ */

export interface InventoryUnitRow {
  product_id: string;
  variant_id: string | null;
  name: string;
  option_name: string | null;
  sku: string | null;
  stock: number;
  threshold: number;
  status: string;
  /** 옵션 비활성 여부 (옵션 없는 상품은 항상 true) */
  is_active: boolean;
  thumbnail: string | null;
  last_log: { delta: number; reason: string; created_at: string } | null;
}

interface ProductRow {
  id: string;
  name: string;
  sku: string | null;
  stock: number;
  low_stock_threshold: number;
  status: string;
  product_images: { url: string; sort_order: number; is_primary: boolean }[] | null;
  product_variants:
    | { id: string; name: string; stock: number; sku: string | null; is_active: boolean; sort_order: number }[]
    | null;
}

function thumbnailOf(p: ProductRow): string | null {
  const imgs = [...(p.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  return imgs.find((i) => i.is_primary)?.url ?? imgs[0]?.url ?? null;
}

/**
 * GET /api/admin/inventory
 * ?q=검색어(상품명/옵션명/SKU) &filter=all|low|out &page=1 &limit=20
 * → { rows, total, page, totalPages, summary: { total_skus, low_stock, sold_out } }
 *
 * 카탈로그 규모(수백 SKU 이하)를 전제로 전체를 읽어 서버에서 집계/필터한다.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? "20", 10) || 20));
  const q = (sp.get("q") ?? "").trim().toLowerCase();
  const filter = sp.get("filter") ?? "all";

  const { data, error } = await service
    .from("products")
    .select(
      "id, name, sku, stock, low_stock_threshold, status, product_images(url, sort_order, is_primary), product_variants(id, name, stock, sku, is_active, sort_order)"
    )
    .order("name", { ascending: true })
    .limit(1000);

  if (error) {
    console.error("[admin/inventory] 조회 실패:", error.message);
    return NextResponse.json({ error: "재고 현황을 불러오지 못했습니다." }, { status: 500 });
  }

  // 상품/옵션 단위 행으로 전개
  const allRows: InventoryUnitRow[] = [];
  for (const p of (data ?? []) as unknown as ProductRow[]) {
    const thumbnail = thumbnailOf(p);
    const variants = [...(p.product_variants ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    if (variants.length > 0) {
      for (const v of variants) {
        allRows.push({
          product_id: p.id,
          variant_id: v.id,
          name: p.name,
          option_name: v.name,
          sku: v.sku ?? p.sku,
          stock: v.stock,
          threshold: p.low_stock_threshold,
          status: p.status,
          is_active: v.is_active,
          thumbnail,
          last_log: null,
        });
      }
    } else {
      allRows.push({
        product_id: p.id,
        variant_id: null,
        name: p.name,
        option_name: null,
        sku: p.sku,
        stock: p.stock,
        threshold: p.low_stock_threshold,
        status: p.status,
        is_active: true,
        thumbnail,
        last_log: null,
      });
    }
  }

  // 요약 (필터/검색과 무관한 전체 기준)
  const summary = {
    total_skus: allRows.length,
    low_stock: allRows.filter((r) => r.stock > 0 && r.stock <= r.threshold).length,
    sold_out: allRows.filter((r) => r.stock <= 0).length,
  };

  let rows = allRows;
  if (q) {
    rows = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.option_name ?? "").toLowerCase().includes(q) ||
        (r.sku ?? "").toLowerCase().includes(q)
    );
  }
  if (filter === "low") rows = rows.filter((r) => r.stock > 0 && r.stock <= r.threshold);
  else if (filter === "out") rows = rows.filter((r) => r.stock <= 0);

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const pageRows = rows.slice((page - 1) * limit, page * limit);

  // 페이지 내 행의 최근 입출고 1건씩 병합
  const productIds = [...new Set(pageRows.map((r) => r.product_id))];
  if (productIds.length > 0) {
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

  return NextResponse.json({ rows: pageRows, total, page, totalPages, summary });
}

/**
 * POST /api/admin/inventory — 입고/조정
 * body: { productId, variantId?, delta(±정수), reason: "restock"|"adjust", memo? }
 * adjust_stock RPC가 재고 증감과 inventory_logs 기록을 원자 처리한다.
 * → { ok: true, stock: 변경 후 재고 }
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const { productId, variantId, delta, reason } = body;
  if (!isUuid(productId)) {
    return NextResponse.json({ error: "상품 정보가 올바르지 않습니다." }, { status: 400 });
  }
  if (variantId != null && variantId !== "" && !isUuid(variantId)) {
    return NextResponse.json({ error: "옵션 정보가 올바르지 않습니다." }, { status: 400 });
  }
  if (typeof delta !== "number" || !Number.isInteger(delta) || delta === 0) {
    return NextResponse.json({ error: "증감 수량은 0이 아닌 정수여야 합니다." }, { status: 400 });
  }
  if (Math.abs(delta) > 100_000) {
    return NextResponse.json({ error: "한 번에 조정할 수 있는 수량은 100,000개 이하입니다." }, { status: 400 });
  }
  if (reason !== "restock" && reason !== "adjust") {
    return NextResponse.json({ error: "사유는 입고 또는 조정만 선택할 수 있습니다." }, { status: 400 });
  }
  const memo = cleanStr(body.memo, 200);
  const variant = isUuid(variantId) ? variantId : null;

  const { error } = await service.rpc("adjust_stock", {
    p_product_id: productId,
    p_variant_id: variant,
    p_delta: delta,
    p_reason: reason,
    p_ref_order_id: null,
    p_memo: memo,
  });

  if (error) {
    if (error.message.includes("insufficient stock")) {
      return NextResponse.json(
        { error: "차감 후 재고가 0보다 작아질 수 없습니다. 현재고를 확인해 주세요." },
        { status: 409 }
      );
    }
    if (error.message.includes("not found")) {
      return NextResponse.json({ error: "상품 또는 옵션을 찾을 수 없습니다." }, { status: 404 });
    }
    console.error("[admin/inventory] 재고 조정 실패:", error.message);
    return NextResponse.json({ error: "재고 조정에 실패했습니다." }, { status: 500 });
  }

  // 변경 후 재고 조회
  let stock: number | null = null;
  if (variant) {
    const { data } = await service
      .from("product_variants")
      .select("stock")
      .eq("id", variant)
      .maybeSingle();
    stock = (data?.stock as number | undefined) ?? null;
  } else {
    const { data } = await service
      .from("products")
      .select("stock")
      .eq("id", productId)
      .maybeSingle();
    stock = (data?.stock as number | undefined) ?? null;
  }

  return NextResponse.json({ ok: true, stock });
}
