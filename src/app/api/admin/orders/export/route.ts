import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { parseOrderFilters, applyOrderFilters, type OrdersQuery } from "../filters";

/**
 * GET /api/admin/orders/export — 택배사 대량 등록용 발송 대상 조회.
 * 현재 검색/기간 필터를 유지한 채 결제완료(paid) + 준비중(preparing) 주문만 반환한다.
 * xlsx 파일 생성은 클라이언트(xlsx 패키지)가 수행한다.
 */

const EXPORT_LIMIT = 1000;

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const filters = parseOrderFilters(req.nextUrl.searchParams);

  let query = service
    .from("orders")
    .select(
      "id, order_no, created_at, status, recipient, order_items(name_snapshot, option_snapshot, qty)"
    ) as unknown as OrdersQuery;
  query = query.in("status", ["paid", "preparing"]);
  query = applyOrderFilters(query, filters);

  const { data, error } = await query
    .order("created_at", { ascending: true })
    .limit(EXPORT_LIMIT);

  if (error) {
    console.error("[admin/orders/export] 조회 실패:", error.message);
    return NextResponse.json({ error: "발송 대상 주문을 불러오지 못했습니다." }, { status: 500 });
  }

  return NextResponse.json({ rows: data ?? [], limit: EXPORT_LIMIT });
}
