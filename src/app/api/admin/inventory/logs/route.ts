import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { isUuid } from "@/lib/orders";

/* ============================================================
   GET /api/admin/inventory/logs — 입출고 이력
   ?page=1 &limit=20 &productId=uuid(선택) &reason=order|cancel|restock|adjust|initial(선택)
   → { logs: [{...log, product_name, variant_name, order?}], total, page, totalPages }
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

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? "20", 10) || 20));
  const productId = sp.get("productId");
  const reason = sp.get("reason");

  let query = service
    .from("inventory_logs")
    .select(
      "id, product_id, variant_id, delta, reason, ref_order_id, memo, created_at, products(name), product_variants(name)",
      { count: "exact" }
    );

  if (productId && isUuid(productId)) query = query.eq("product_id", productId);
  if (reason && REASONS.includes(reason as (typeof REASONS)[number])) {
    query = query.eq("reason", reason);
  }

  const from = (page - 1) * limit;
  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + limit - 1);

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

  const logs = rows.map(({ products, product_variants, ...log }) => ({
    ...log,
    product_name: products?.name ?? "(삭제된 상품)",
    variant_name: product_variants?.name ?? null,
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
