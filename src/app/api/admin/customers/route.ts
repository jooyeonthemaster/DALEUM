import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { fetchCustomers, parseCustomerQuery } from "./shared";

/**
 * GET /api/admin/customers — 고객 목록 (주문수/누적구매액/VIP 집계 포함)
 *
 * 쿼리: q(이름/이메일/연락처) · sort(recent|oldest|name|spend|orders) ·
 *      vip=1(VIP 그룹 고객만) · marketing=1(마케팅 수신 동의만) · min_spent(누적구매액 하한) ·
 *      page · pageSize
 *
 * 집계·정렬 규칙은 shared.ts 참고 — 명단 내보내기(export)와 같은 결과를 써야 한다.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const sp = req.nextUrl.searchParams;
  const query = parseCustomerQuery(sp);
  const page = Math.max(1, Number.parseInt(sp.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(sp.get("pageSize") ?? "20", 10) || 20));

  const result = await fetchCustomers(service, query);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 500 });

  const total = result.rows.length;
  const fromIdx = (page - 1) * pageSize;

  return NextResponse.json({
    customers: result.rows.slice(fromIdx, fromIdx + pageSize),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    truncated: result.truncated,
  });
}
