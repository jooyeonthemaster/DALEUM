import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 관리자 주문 목록/엑셀 내보내기 공용 필터 헬퍼.
 * (route.ts는 추가 export가 금지되므로 별도 파일로 분리)
 */

/** 탭 키 → 주문 상태 매핑 (null = 전체) */
export const TAB_STATUSES: Record<string, string[] | null> = {
  all: null,
  // 결제 대기가 어느 탭에도 없어서, 대시보드가 "결제 대기 8건" 이라고 알려 줘도
  // 주문 관리에서 그 8건만 골라 볼 방법이 없었다. 탭 합계도 전체와 어긋났다.
  pending: ["pending"],
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
  // 괄호는 PostgREST or 필터 문법을 깨뜨리므로 제거한다.
  // 콤마도 문법 구분자지만 주소에는 흔해서("고양시 일산동구, 101동") 통째로 지우면
  // 저장된 값과 영영 어긋난다 — 콤마로 잘라 가장 긴 조각만 검색어로 쓴다.
  const raw = (searchParams.get("q") ?? "").replace(/[()%*\\]/g, "");
  const segment = raw
    .split(",")
    .map((s) => s.trim())
    .sort((a, b) => b.length - a.length)[0];
  const rawQ = (segment ?? "").trim();
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  return {
    q: rawQ ? rawQ.slice(0, 50) : null,
    fromIso: DATE_RE.test(from) ? `${from}T00:00:00+09:00` : null,
    toIso: DATE_RE.test(to) ? `${to}T23:59:59.999+09:00` : null,
  };
}

/**
 * 연락처 후보 만들기.
 *
 * 저장은 고객이 입력한 원문 그대로다(하이픈 포함/미포함이 섞여 있다). 그런데 검색은
 * 질의만 숫자로 바꿔 `%01012345678%` 로 찾았기 때문에, `010-1234-5678` 로 주문한 고객은
 * 그 번호를 통째로 붙여넣어도 절대 찾히지 않았다. 저장 형식을 바꾸는 것은 결제 화면
 * (고객 화면) 소관이라 여기서는 **질의 쪽에 하이픈 있는 형태와 없는 형태를 모두** 넣는다.
 */
function phonePatterns(digits: string): string[] {
  const out = [digits];
  if (digits.length === 11) out.push(digits.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3"));
  else if (digits.length === 10) out.push(digits.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3"));
  else if (digits.length === 8) out.push(digits.replace(/(\d{4})(\d{4})/, "$1-$2"));
  return [...new Set(out)];
}

/**
 * 주문번호 / 주문자·받는분 이름 / 연락처 / 배송지 주소 검색 표현식.
 *
 * 받는분과 주소가 빠져 있어서 선물·업소 납품 주문의 CS 응대가 아예 불가능했다.
 * ("제 이름으로 온 택배가 안 왔어요" · 택배사가 알려 준 반송 주소로 역추적)
 */
export function orderSearchExpr(q: string): string {
  const parts = [
    `order_no.ilike.%${q}%`,
    `orderer->>name.ilike.%${q}%`,
    `recipient->>name.ilike.%${q}%`,
    `recipient->>address1.ilike.%${q}%`,
    `recipient->>address2.ilike.%${q}%`,
  ];
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 4) {
    for (const pattern of phonePatterns(digits)) {
      parts.push(`orderer->>phone.ilike.%${pattern}%`);
      parts.push(`recipient->>phone.ilike.%${pattern}%`);
    }
  }
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
