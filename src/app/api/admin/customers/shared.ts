import type { SupabaseClient } from "@supabase/supabase-js";

/* ============================================================
   고객 목록 조회 — 목록 화면과 명단 내보내기가 같은 결과를 보게 하는 공용 조회

   왜 메모리에서 집계·정렬하는가:
   누적구매액·주문수는 profiles 컬럼이 아니라 orders 를 합산해 나오는 값이다.
   예전 코드는 "현재 페이지 20명" 에 대해서만 합산했기 때문에, 그 값으로 정렬하거나
   "누적 30만원 이상" 같은 조건을 걸 수가 없었다(다음 페이지에 더 큰 손님이 있을 수 있다).
   그래서 조건에 맞는 고객 전체와 결제 완료 이후 주문 전체를 한 번 읽어 합산한 뒤
   정렬·필터·쪽나눔을 여기서 한다. 이 스토어 규모(고객 수천 명 수준)에서 감당되는 방식이고,
   한도를 넘으면 truncated 로 알려 화면이 "일부만 집계했다"고 말할 수 있게 한다.

   ⚠ 고친 것: 예전에는 `.limit(5000)` / `.limit(20000)` 만 걸고 truncated 판정도 같은
   5000/20000 으로 했다. 그런데 Supabase(PostgREST)는 요청이 몇 만을 부르든 한 번에
   **1,000행까지만** 돌려준다. 그래서 실제로는 고객 1,000명·주문 1,000건에서 조용히 잘렸는데
   `profiles.length >= 5000` 은 영원히 거짓이라 "일부만 집계했습니다" 경고가 뜰 수가 없었다.
   즉 고객이 1,000명을 넘는 순간, 화면은 아무 말 없이 틀린 누적구매액을 보여 준다.
   analytics/route.ts·dashboard/route.ts 가 이미 쓰는 range 페이지네이션과 같은 방식으로
   1,000행씩 이어 읽고, 한도(MAX_*)까지 채웠을 때만 truncated 를 세운다.
   ============================================================ */

/** 구매 실적으로 집계하는 주문 상태 (취소/환불/미결제 제외) */
export const PURCHASE_STATUSES = ["paid", "preparing", "shipped", "delivered", "confirmed"];

/** 한 번에 집계할 수 있는 최대 고객 수 / 주문 수 (이 위로는 truncated 로 알린다) */
const MAX_PROFILES = 5000;
const MAX_ORDERS = 20000;

/** Supabase 한 번 응답의 실제 상한. 이보다 큰 수를 불러도 여기서 잘린다 */
const PAGE_SIZE = 1000;

/**
 * 1,000행씩 이어 읽어 max 까지 모은다.
 * 마지막 페이지가 덜 찼으면 그게 전부라는 뜻이고(truncated=false),
 * max 까지 꽉 채웠으면 뒤에 더 있을 수 있다는 뜻이다(truncated=true).
 * 뒤가 실제로 비어 있어 헛경고가 나가는 경우가 있지만, 반대로 잘린 줄 모르고
 * 틀린 합계를 보여 주는 쪽이 훨씬 나쁘다 — 그래서 의도적으로 이쪽으로 기울인다.
 */
async function collectPages<T>(
  page: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
  max: number
): Promise<{ rows: T[]; truncated: boolean; error: null } | { rows: null; truncated: false; error: string }> {
  const out: T[] = [];
  for (let from = 0; from < max; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE, max) - 1;
    const { data, error } = await page(from, to);
    if (error) return { rows: null, truncated: false, error: error.message };
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < to - from + 1) return { rows: out, truncated: false, error: null };
  }
  return { rows: out, truncated: true, error: null };
}

export type CustomerSort = "recent" | "oldest" | "name" | "spend" | "orders";

export interface CustomerQuery {
  q: string;
  sort: CustomerSort;
  /** VIP 그룹에 속한 고객만 */
  vipOnly: boolean;
  /** 마케팅 수신 동의한 고객만 */
  marketingOnly: boolean;
  /** 누적구매액 하한 (원). 0이면 조건 없음 */
  minSpent: number;
}

export interface CustomerAggregate {
  id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  created_at: string;
  marketing_opt_in: boolean;
  order_count: number;
  total_spent: number;
  vip_group: string | null;
}

const SORTS: CustomerSort[] = ["recent", "oldest", "name", "spend", "orders"];

export function parseCustomerQuery(sp: URLSearchParams): CustomerQuery {
  const rawSort = sp.get("sort") ?? "recent";
  return {
    q: (sp.get("q") ?? "").replace(/[,()]/g, "").trim().slice(0, 50),
    sort: (SORTS as string[]).includes(rawSort) ? (rawSort as CustomerSort) : "recent",
    vipOnly: sp.get("vip") === "1",
    marketingOnly: sp.get("marketing") === "1",
    minSpent: Math.max(0, Number.parseInt(sp.get("min_spent") ?? "0", 10) || 0),
  };
}

interface ProfileRow {
  id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  created_at: string;
  marketing_opt_in: boolean | null;
}

/** 실적 합산에 필요한 최소 컬럼만 읽는다 — 주문은 고객보다 훨씬 많다 */
interface OrderStatRow {
  user_id: string | null;
  total: number;
}

/** vip_groups 는 조인 결과라 단건으로도 배열로도 올 수 있다 — 둘 다 받는다 */
interface VipMemberRow {
  user_id: string;
  vip_groups: { name: string } | { name: string }[] | null;
}

/**
 * 조건에 맞는 고객 전체를 집계값과 함께 돌려준다 (정렬까지 끝난 상태).
 * 실패하면 reason 에 화면에 그대로 보여도 되는 한국어 문구를 담는다.
 */
export async function fetchCustomers(
  service: SupabaseClient,
  query: CustomerQuery
): Promise<
  | { ok: true; rows: CustomerAggregate[]; truncated: boolean }
  | { ok: false; reason: string }
> {
  // 쪽마다 같은 질의를 다시 만들어야 해서 빌더로 뺀다.
  // range 로 이어 읽으려면 정렬이 결정적이어야 한다 — 정렬이 흔들리면 같은 사람이 두 쪽에
  // 나오거나 아예 빠진다. 그래서 가입일 뒤 id 로 한 번 더 묶어 순서를 못박는다.
  // (가입 최신순으로 읽으므로, 한도에 걸려 잘리더라도 최근 고객이 먼저 남는다)
  const buildProfileQuery = () => {
    let q = service
      .from("profiles")
      .select("id, email, name, phone, created_at, marketing_opt_in")
      .eq("role", "customer")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true });

    if (query.q) {
      const parts = [
        `name.ilike.%${query.q}%`,
        `email.ilike.%${query.q}%`,
        `phone.ilike.%${query.q}%`,
      ];
      const digits = query.q.replace(/\D/g, "");
      if (digits.length >= 4 && digits !== query.q) parts.push(`phone.ilike.%${digits}%`);
      q = q.or(parts.join(","));
    }
    return q;
  };

  const [profileRes, orderRes, vipRes] = await Promise.all([
    collectPages<ProfileRow>(async (from, to) => {
      const r = await buildProfileQuery().range(from, to);
      return { data: r.data as ProfileRow[] | null, error: r.error };
    }, MAX_PROFILES),
    collectPages<OrderStatRow>(async (from, to) => {
      const r = await service
        .from("orders")
        .select("user_id, total")
        .in("status", PURCHASE_STATUSES)
        .order("id", { ascending: true })
        .range(from, to);
      return { data: r.data as OrderStatRow[] | null, error: r.error };
    }, MAX_ORDERS),
    // VIP 명단도 같은 함정이었다 — limit 조차 없어서 1,001번째 VIP 부터는 조용히 사라졌다.
    // 뱃지가 안 보이는 것으로 끝나지 않고 'VIP만 보기' 조건에서 통째로 빠진다.
    // VIP 는 고객의 부분집합이므로 한도도 고객 한도를 그대로 쓴다.
    collectPages<VipMemberRow>(async (from, to) => {
      const r = await service
        .from("vip_members")
        .select("user_id, vip_groups(name)")
        .order("user_id", { ascending: true })
        .range(from, to);
      return { data: r.data as VipMemberRow[] | null, error: r.error };
    }, MAX_PROFILES),
  ]);

  if (profileRes.error !== null) {
    console.error("[admin/customers] 목록 조회 실패:", profileRes.error);
    return { ok: false, reason: "고객 목록을 불러오지 못했습니다." };
  }
  if (orderRes.error !== null) {
    console.error("[admin/customers] 주문 집계 실패:", orderRes.error);
    return { ok: false, reason: "주문 실적을 집계하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
  if (vipRes.error !== null) {
    // VIP 표시가 빠져도 목록 자체는 쓸모가 있다 — 기록만 남기고 계속 진행한다
    console.error("[admin/customers] VIP 조회 실패:", vipRes.error);
  }

  const stats = new Map<string, { count: number; spent: number }>();
  for (const o of orderRes.rows) {
    if (!o.user_id) continue; // 비회원 주문은 고객 실적에 붙일 곳이 없다
    const prev = stats.get(o.user_id) ?? { count: 0, spent: 0 };
    prev.count += 1;
    prev.spent += o.total;
    stats.set(o.user_id, prev);
  }

  const vipGroups = new Map<string, string>();
  for (const m of vipRes.rows ?? []) {
    const g = Array.isArray(m.vip_groups) ? m.vip_groups[0] : m.vip_groups;
    if (g?.name) vipGroups.set(m.user_id, g.name);
  }

  const profiles = profileRes.rows;
  let rows: CustomerAggregate[] = profiles.map((p) => ({
    id: p.id,
    email: p.email,
    name: p.name,
    phone: p.phone,
    created_at: p.created_at,
    marketing_opt_in: Boolean(p.marketing_opt_in),
    order_count: stats.get(p.id)?.count ?? 0,
    total_spent: stats.get(p.id)?.spent ?? 0,
    vip_group: vipGroups.get(p.id) ?? null,
  }));

  if (query.vipOnly) rows = rows.filter((r) => r.vip_group !== null);
  if (query.marketingOnly) rows = rows.filter((r) => r.marketing_opt_in);
  if (query.minSpent > 0) rows = rows.filter((r) => r.total_spent >= query.minSpent);

  rows.sort((a, b) => {
    switch (query.sort) {
      case "oldest":
        return a.created_at.localeCompare(b.created_at);
      case "name":
        return (a.name ?? "").localeCompare(b.name ?? "", "ko");
      case "spend":
        return b.total_spent - a.total_spent || b.order_count - a.order_count;
      case "orders":
        return b.order_count - a.order_count || b.total_spent - a.total_spent;
      default:
        return b.created_at.localeCompare(a.created_at);
    }
  });

  return {
    ok: true,
    rows,
    // 고객·주문·VIP 어느 쪽이든 한도에서 끊겼으면 화면에 보이는 값이 실제와 다르다는 뜻이다
    truncated: profileRes.truncated || orderRes.truncated || vipRes.truncated,
  };
}
