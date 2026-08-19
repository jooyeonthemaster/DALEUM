import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

/**
 * GET /api/admin/analytics?days=7|30|90 — 기간 분석 집계
 *
 * 응답:
 * {
 *   days,
 *   totals: { sales, orders, avgOrder },
 *   prevTotals: { sales, orders, avgOrder },                // 같은 길이의 직전 기간
 *   daily: { date, sales, orders }[],                       // KST 일자별
 *   topProducts: { name, qty, revenue }[],                  // 판매액 기준 Top 10
 *   categorySales: { name, revenue }[],                     // 카테고리별 매출 (내림차순)
 *   funnel: { step, label, count }[],                       // 상품 조회 → … → 구매 완료
 *   vip: { vipSales, vipOrders, regularSales, regularOrders },
 *   hourly: number[24]                                      // KST 시간대별 주문 수
 * }
 */

const PAID_STATUSES = [
  "paid",
  "preparing",
  "shipped",
  "delivered",
  "confirmed",
  "refund_requested",
];

/* 구매까지 가는 단계.
   'page_view'(페이지 조회)를 첫 단계로 두고 있었지만, 앱 어디에서도 그 이벤트를 남기지
   않는다(track("page_view") 호출 0건). 그래서 첫 줄이 영원히 0건인데 그 아래 '상품 조회'는
   148건인 모순된 화면이 나왔고, 첫 단계가 0이라 전체 전환율 문구도 통째로 사라졌다.
   기록되지도 않는 단계를 세는 척하느니 실제로 기록되는 네 단계만 보여 준다.
   (스토어 레이아웃에 페이지 조회 기록을 붙이는 일은 고객 화면 소관이라 여기서 하지 않는다.) */
const FUNNEL_STEPS = [
  { step: "product_view", label: "상품 조회" },
  { step: "add_to_cart", label: "장바구니 담기" },
  { step: "begin_checkout", label: "결제 시작" },
  { step: "purchase", label: "구매 완료" },
] as const;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function kstDateStr(iso: string): string {
  return new Date(new Date(iso).getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function kstHour(iso: string): number {
  return new Date(new Date(iso).getTime() + KST_OFFSET_MS).getUTCHours();
}

function kstDayStartUtc(daysAgo: number): string {
  const kstNow = new Date(Date.now() + KST_OFFSET_MS);
  const dayStartKst = Date.UTC(
    kstNow.getUTCFullYear(),
    kstNow.getUTCMonth(),
    kstNow.getUTCDate() - daysAgo
  );
  return new Date(dayStartKst - KST_OFFSET_MS).toISOString();
}

interface OrderRow {
  total: number;
  discount_total: number;
  coupon_discount: number;
  vip_campaign_id: string | null;
  vip_code: string | null;
  created_at: string;
}

interface ItemRow {
  product_id: string | null;
  name_snapshot: string;
  qty: number;
  unit_price: number;
  products: { categories: { name: string } | null } | null;
}

/** Supabase 1,000행 상한을 넘는 집계를 위한 페이지네이션 조회 */
async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>
): Promise<T[]> {
  const SIZE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += SIZE) {
    const { data, error } = await build(from, from + SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    if (rows.length === 0) break;
    out.push(...rows);
    if (rows.length < SIZE) break;
  }
  return out;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const daysParam = Number(req.nextUrl.searchParams.get("days") ?? 30);
  const days = [7, 30, 90].includes(daysParam) ? daysParam : 30;
  const start = kstDayStartUtc(days - 1);
  // 같은 길이의 바로 앞 기간 — 30일을 보고 있으면 그 앞 30일. '지난 기간보다 나은가' 를
  // 판단할 기준이 없으면 매출 숫자 하나만 보고는 좋은지 나쁜지 알 수 없다.
  const prevStart = kstDayStartUtc(days * 2 - 1);

  try {
    const [orders, prevOrders, items, ...funnelRes] = await Promise.all([
      fetchAll<OrderRow>((from, to) =>
        service
          .from("orders")
          .select("total, discount_total, coupon_discount, vip_campaign_id, vip_code, created_at")
          .gte("created_at", start)
          .in("status", PAID_STATUSES)
          .order("created_at", { ascending: true })
          .range(from, to)
      ),
      fetchAll<{ total: number }>((from, to) =>
        service
          .from("orders")
          .select("total")
          .gte("created_at", prevStart)
          .lt("created_at", start)
          .in("status", PAID_STATUSES)
          .order("created_at", { ascending: true })
          .range(from, to)
      ),
      fetchAll<ItemRow>((from, to) =>
        service
          .from("order_items")
          .select(
            "product_id, name_snapshot, qty, unit_price, products(categories(name)), orders!inner(status, created_at)"
          )
          .gte("orders.created_at", start)
          .in("orders.status", PAID_STATUSES)
          .order("created_at", { ascending: true })
          .range(from, to)
      ),
      ...FUNNEL_STEPS.map(({ step }) =>
        service
          .from("analytics_events")
          .select("id", { count: "exact", head: true })
          .eq("event", step)
          .gte("created_at", start)
      ),
    ]);

    // ---------- 일별 매출/주문 (빈 날짜 0 채움) ----------
    const daily = new Map<string, { sales: number; orders: number }>();
    for (let i = days - 1; i >= 0; i--) {
      daily.set(kstDateStr(kstDayStartUtc(i)), { sales: 0, orders: 0 });
    }
    const hourly = Array.from({ length: 24 }, () => 0);
    let vipSales = 0;
    let vipOrders = 0;
    let regularSales = 0;
    let regularOrders = 0;

    for (const o of orders) {
      const d = daily.get(kstDateStr(o.created_at));
      if (d) {
        d.sales += o.total ?? 0;
        d.orders += 1;
      }
      hourly[kstHour(o.created_at)] += 1;

      // VIP 판별: 캠페인/코드 경유 또는 VIP 가격 할인(쿠폰 제외)이 적용된 주문
      const vipDiscount = (o.discount_total ?? 0) - (o.coupon_discount ?? 0);
      const isVip = Boolean(o.vip_campaign_id) || Boolean(o.vip_code) || vipDiscount > 0;
      if (isVip) {
        vipSales += o.total ?? 0;
        vipOrders += 1;
      } else {
        regularSales += o.total ?? 0;
        regularOrders += 1;
      }
    }

    const totalSales = vipSales + regularSales;
    const totalOrders = orders.length;

    // 직전 기간 합계 — 화면에서 '지난 N일 대비' 를 계산하는 데 쓴다
    const prevSales = prevOrders.reduce((acc, o) => acc + (o.total ?? 0), 0);
    const prevOrderCount = prevOrders.length;

    // ---------- 인기 상품 Top 10 (판매액 기준) ----------
    const byProduct = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const it of items) {
      const key = it.product_id ?? `snapshot:${it.name_snapshot}`;
      const cur = byProduct.get(key) ?? { name: it.name_snapshot, qty: 0, revenue: 0 };
      cur.qty += it.qty ?? 0;
      cur.revenue += (it.unit_price ?? 0) * (it.qty ?? 0);
      byProduct.set(key, cur);
    }
    const topProducts = [...byProduct.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // ---------- 카테고리별 매출 ----------
    const byCategory = new Map<string, number>();
    for (const it of items) {
      const name = it.products?.categories?.name ?? "기타";
      byCategory.set(name, (byCategory.get(name) ?? 0) + (it.unit_price ?? 0) * (it.qty ?? 0));
    }
    const categorySales = [...byCategory.entries()]
      .map(([name, revenue]) => ({ name, revenue }))
      .sort((a, b) => b.revenue - a.revenue);

    // ---------- 퍼널 ----------
    const funnel = FUNNEL_STEPS.map(({ step, label }, i) => ({
      step,
      label,
      count: funnelRes[i]?.count ?? 0,
    }));

    return NextResponse.json({
      days,
      totals: {
        sales: totalSales,
        orders: totalOrders,
        avgOrder: totalOrders > 0 ? Math.round(totalSales / totalOrders) : 0,
      },
      prevTotals: {
        sales: prevSales,
        orders: prevOrderCount,
        avgOrder: prevOrderCount > 0 ? Math.round(prevSales / prevOrderCount) : 0,
      },
      daily: [...daily.entries()].map(([date, v]) => ({ date, ...v })),
      topProducts,
      categorySales,
      funnel,
      vip: { vipSales, vipOrders, regularSales, regularOrders },
      hourly,
    });
  } catch (e) {
    console.error("[admin/analytics]", e);
    return NextResponse.json({ error: "분석 데이터를 불러오지 못했습니다." }, { status: 500 });
  }
}
