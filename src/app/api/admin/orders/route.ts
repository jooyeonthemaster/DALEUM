import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth";
import {
  TAB_STATUSES,
  parseOrderFilters,
  applyOrderFilters,
  type OrderListFilters,
  type OrdersQuery,
} from "./filters";

/**
 * GET /api/admin/orders — 관리자 주문 목록.
 * 쿼리: tab(all|paid|preparing|shipped|delivered|cancelled), q(주문번호/이름/연락처),
 *       from/to(yyyy-mm-dd, KST), page, pageSize
 * 응답: { orders, total, page, pageSize, totalPages, counts }
 * counts는 현재 검색/기간 필터를 유지한 채 탭별 건수를 집계한다.
 */

async function countTab(
  service: SupabaseClient,
  statuses: string[] | null,
  filters: OrderListFilters
): Promise<number> {
  let query = service
    .from("orders")
    .select("id", { count: "exact", head: true }) as unknown as OrdersQuery;
  if (statuses) query = query.in("status", statuses);
  query = applyOrderFilters(query, filters);
  const { count } = await query;
  return count ?? 0;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const sp = req.nextUrl.searchParams;
  const tabParam = sp.get("tab") ?? "all";
  const tab = TAB_STATUSES[tabParam] !== undefined ? tabParam : "all";
  const filters = parseOrderFilters(sp);
  const page = Math.max(1, Number.parseInt(sp.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(sp.get("pageSize") ?? "20", 10) || 20));

  // ---------- 목록 ----------
  let query = service
    .from("orders")
    .select(
      "id, order_no, created_at, status, total, orderer, order_items(name_snapshot, qty), shipments(id)",
      { count: "exact" }
    ) as unknown as OrdersQuery;
  const statuses = TAB_STATUSES[tab];
  if (statuses) query = query.in("status", statuses);
  query = applyOrderFilters(query, filters);

  const fromIdx = (page - 1) * pageSize;
  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(fromIdx, fromIdx + pageSize - 1);

  if (error) {
    console.error("[admin/orders] 목록 조회 실패:", error.message);
    return NextResponse.json({ error: "주문 목록을 불러오지 못했습니다." }, { status: 500 });
  }

  // ---------- 탭별 카운트 (검색/기간 필터 유지) ----------
  const tabKeys = Object.keys(TAB_STATUSES);
  const countValues = await Promise.all(
    tabKeys.map((key) => countTab(service, TAB_STATUSES[key], filters))
  );
  const counts = Object.fromEntries(tabKeys.map((key, i) => [key, countValues[i]]));

  const total = count ?? 0;
  return NextResponse.json({
    orders: data ?? [],
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    counts,
  });
}
