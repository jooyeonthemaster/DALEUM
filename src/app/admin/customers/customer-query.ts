/* ============================================================
   고객 목록 조건 — 화면 상태와 API 쿼리 문자열을 한 곳에서 맞춘다.

   목록과 '명단 내려받기' 가 서로 다른 조건을 보내면, 화면에 보이는 82명과
   파일로 받은 명단이 다른 사람 목록이 된다. 그래서 조건을 만드는 곳을 하나로 둔다.
   ============================================================ */

export interface CustomerListQuery {
  search: string;
  sort: string;
  vipOnly: boolean;
  marketingOnly: boolean;
  /** 누적구매액 하한(원). 0이면 조건 없음 */
  minSpent: number;
}

export const DEFAULT_CUSTOMER_QUERY: CustomerListQuery = {
  search: "",
  sort: "recent",
  vipOnly: false,
  marketingOnly: false,
  minSpent: 0,
};

export function customerQueryParams(query: CustomerListQuery): URLSearchParams {
  const params = new URLSearchParams({ sort: query.sort });
  if (query.search) params.set("q", query.search);
  if (query.vipOnly) params.set("vip", "1");
  if (query.marketingOnly) params.set("marketing", "1");
  if (query.minSpent > 0) params.set("min_spent", String(query.minSpent));
  return params;
}

/** 조건이 하나라도 걸려 있는지 — 빈 목록 문구를 고를 때 쓴다 */
export function hasCustomerFilter(query: CustomerListQuery): boolean {
  return Boolean(query.search || query.vipOnly || query.marketingOnly || query.minSpent > 0);
}
