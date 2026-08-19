import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  TAB_STATUSES,
  parseOrderFilters,
  applyOrderFilters,
  type OrdersQuery,
} from "../filters";

/**
 * GET /api/admin/orders/export — 택배사 대량 등록용 발송 대상 조회.
 * 쿼리: tab(목록 화면과 같은 탭 키), q, from, to
 *
 * 예전에는 화면의 탭과 상관없이 항상 결제완료+준비중만 뽑았다. '배송중' 탭을 보면서
 * 내려받으면 화면과 전혀 다른 주문이 담긴 파일이 떨어져 "엑셀이 이상하다" 는 말만 남았다.
 * 또 1,000건에서 말없이 잘려 성수기에는 초과분 고객이 통째로 발송 누락됐다.
 * → 대상 상태를 명시적으로 받고, 조건에 걸린 **전체 건수** 를 함께 돌려줘 화면이 잘림을 알린다.
 *
 * xlsx 파일 생성은 클라이언트(xlsx 패키지)가 수행한다.
 */

const EXPORT_LIMIT = 1000;
/** 탭을 지정하지 않았을 때의 기본 대상 — 지금까지의 동작을 그대로 유지한다 */
const DEFAULT_STATUSES = ["paid", "preparing"];

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const sp = req.nextUrl.searchParams;
  const filters = parseOrderFilters(sp);
  const tabParam = sp.get("tab") ?? "";
  const statuses =
    tabParam && TAB_STATUSES[tabParam] !== undefined ? TAB_STATUSES[tabParam] : DEFAULT_STATUSES;

  const select =
    "id, order_no, created_at, status, recipient, order_items(name_snapshot, option_snapshot, qty)";

  let query = service.from("orders").select(select, { count: "exact" }) as unknown as OrdersQuery;
  // statuses 가 null 이면 '전체' 탭이다 — 상태 조건을 걸지 않는다
  if (statuses) query = query.in("status", statuses);
  query = applyOrderFilters(query, filters);

  const { data, count, error } = await query
    .order("created_at", { ascending: true })
    .limit(EXPORT_LIMIT);

  if (error) {
    console.error("[admin/orders/export] 조회 실패:", error.message);
    return NextResponse.json({ error: "발송 대상 주문을 불러오지 못했습니다." }, { status: 500 });
  }

  const rows = data ?? [];
  return NextResponse.json({
    rows,
    limit: EXPORT_LIMIT,
    /** 조건에 걸린 전체 건수 — rows.length 보다 크면 잘린 것이다 */
    total: count ?? rows.length,
    truncated: (count ?? rows.length) > rows.length,
  });
}
