import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 관리자 주문 목록/엑셀 내보내기 공용 필터 헬퍼.
 * (route.ts는 추가 export가 금지되므로 별도 파일로 분리)
 */

/** 탭 키 → 주문 상태 매핑 (null = 전체) */
export const TAB_STATUSES: Record<string, string[] | null> = {
  all: null,
  paid: ["paid"],
  preparing: ["preparing"],
  shipped: ["shipped"],
  delivered: ["delivered", "confirmed"],
  cancelled: ["cancelled", "refund_requested", "refunded"],
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface OrderListFilters {
  q: string | null;
  fromIso: string | null;
  toIso: string | null;
}

export function parseOrderFilters(searchParams: URLSearchParams): OrderListFilters {
  // 콤마/괄호는 PostgREST or 필터 문법을 깨뜨리므로 제거
  const rawQ = (searchParams.get("q") ?? "").replace(/[,()]/g, "").trim();
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  return {
    q: rawQ ? rawQ.slice(0, 50) : null,
    fromIso: DATE_RE.test(from) ? `${from}T00:00:00+09:00` : null,
    toIso: DATE_RE.test(to) ? `${to}T23:59:59.999+09:00` : null,
  };
}

/** 주문번호 / 주문자 이름 / 연락처(숫자만) 검색 표현식 */
export function orderSearchExpr(q: string): string {
  const parts = [`order_no.ilike.%${q}%`, `orderer->>name.ilike.%${q}%`];
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 4) parts.push(`orderer->>phone.ilike.%${digits}%`);
  return parts.join(",");
}

export type OrdersQuery = ReturnType<ReturnType<SupabaseClient["from"]>["select"]>;

export function applyOrderFilters(query: OrdersQuery, f: OrderListFilters): OrdersQuery {
  let q = query;
  if (f.fromIso) q = q.gte("created_at", f.fromIso);
  if (f.toIso) q = q.lte("created_at", f.toIso);
  if (f.q) q = q.or(orderSearchExpr(f.q));
  return q;
}
