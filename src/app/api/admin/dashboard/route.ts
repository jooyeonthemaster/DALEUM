import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth";
import type { OrderStatus } from "@/lib/types";

/**
 * GET /api/admin/dashboard — 관리자 대시보드 집계
 *
 * 응답:
 * {
 *   today:  { sales, orders, avgOrder, newMembers },
 *   week:   { sales, orders, avgOrder, newMembers },   // 최근 7일 (오늘 포함)
 *   statusCounts: Record<OrderStatus, number>,
 *   lowStock: { id, name, stock, low_stock_threshold }[],
 *   recentOrders: { id, order_no, orderer_name, total, status, created_at }[],
 *   dailySales: { date, sales, orders }[],              // 최근 7일, KST 일자별
 *   todo: { refundRequested, paid, reviewsPending, inquiriesNew, emptyDetail, lowStock }
 * }
 *
 * todo 를 따로 내리는 이유:
 * 대시보드가 "오늘 무엇을 해야 하는지" 를 한 줄로 말해 주려면, 처리 대기 건수가
 * 좌측 메뉴 여섯 곳에 흩어져 있으면 안 된다. 대표가 아침에 화면 하나만 보고
 * 환불 요청·리뷰 답글·견적 문의가 밀렸는지 알 수 있어야 해서 여기서 함께 센다.
 * (기존에는 statusCounts.paid 하나만 배너로 떴고 나머지는 알림 자체가 없었다.)
 *
 * 매출 = 결제가 완료된 상태(paid 이상)의 total 합.
 * refund_requested는 아직 환불 전(돈이 들어와 있는 상태)이므로 포함한다.
 */

const PAID_STATUSES = [
  "paid",
  "preparing",
  "shipped",
  "delivered",
  "confirmed",
  "refund_requested",
] as const;

const ALL_STATUSES: OrderStatus[] = [
  "pending",
  "paid",
  "preparing",
  "shipped",
  "delivered",
  "confirmed",
  "cancelled",
  "refund_requested",
  "refunded",
];

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** UTC ISO → KST 기준 yyyy-mm-dd */
function kstDateStr(iso: string): string {
  return new Date(new Date(iso).getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** KST 기준 daysAgo일 전 자정(00:00)의 UTC ISO */
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
  status: string;
  created_at: string;
}

interface ProductRow {
  id: string;
  name: string;
  stock: number;
  low_stock_threshold: number;
}

/** 최근 7일 매출 주문 — 1,000행 상한을 피해 페이지네이션 조회 */
async function fetchWeekOrders(service: SupabaseClient, weekStart: string): Promise<OrderRow[]> {
  const SIZE = 1000;
  const out: OrderRow[] = [];
  for (let from = 0; ; from += SIZE) {
    const { data, error } = await service
      .from("orders")
      .select("total, status, created_at")
      .gte("created_at", weekStart)
      .in("status", [...PAID_STATUSES])
      .order("created_at", { ascending: true })
      .range(from, from + SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as OrderRow[];
    out.push(...rows);
    if (rows.length < SIZE) break;
  }
  return out;
}

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const todayStart = kstDayStartUtc(0);
  const weekStart = kstDayStartUtc(6);

  try {
    const [
      weekOrders,
      newTodayRes,
      newWeekRes,
      lowStockRes,
      recentRes,
      reviewsPendingRes,
      inquiriesNewRes,
      detailNullRes,
      detailBlankRes,
      ...statusRes
    ] = await Promise.all([
        // 최근 7일 매출 주문 (KPI + 일별 차트 공용)
        fetchWeekOrders(service, weekStart),
        service
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .gte("created_at", todayStart),
        service
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .gte("created_at", weekStart),
        // 재고 임박 — 컬럼 간 비교는 PostgREST 미지원이므로 소량 조회 후 필터
        service
          .from("products")
          .select("id, name, stock, low_stock_threshold")
          .in("status", ["active", "sold_out"])
          .order("stock", { ascending: true })
          .limit(300),
        service
          .from("orders")
          .select("id, order_no, orderer, total, status, created_at")
          .order("created_at", { ascending: false })
          .limit(10),
        // 답글을 기다리는 리뷰 — 숨긴 리뷰는 답글이 필요 없으므로 제외한다
        service
          .from("reviews")
          .select("id", { count: "exact", head: true })
          .is("admin_reply", null)
          .eq("is_hidden", false),
        // 아직 손대지 않은 업소용·OEM 견적 문의
        service
          .from("bulk_inquiries")
          .select("id", { count: "exact", head: true })
          .eq("status", "new"),
        // 상세페이지가 비어 있는 판매 상품 — null 과 빈 문자열은 PostgREST 에서
        // 한 필터로 묶을 수 없어(or 구문은 값에 콤마가 섞이면 깨진다) 두 번 센다.
        service
          .from("products")
          .select("id", { count: "exact", head: true })
          .in("status", ["active", "sold_out"])
          .is("description", null),
        service
          .from("products")
          .select("id", { count: "exact", head: true })
          .in("status", ["active", "sold_out"])
          .eq("description", ""),
        ...ALL_STATUSES.map((s) =>
          service.from("orders").select("id", { count: "exact", head: true }).eq("status", s)
        ),
      ]);

    const todayOrders = weekOrders.filter((o) => o.created_at >= todayStart);

    const sum = (rows: OrderRow[]) => rows.reduce((acc, o) => acc + (o.total ?? 0), 0);
    const kpi = (rows: OrderRow[], newMembers: number) => {
      const sales = sum(rows);
      const orders = rows.length;
      return {
        sales,
        orders,
        avgOrder: orders > 0 ? Math.round(sales / orders) : 0,
        newMembers,
      };
    };

    // 상태별 주문 수
    const statusCounts = Object.fromEntries(
      ALL_STATUSES.map((s, i) => [s, statusRes[i]?.count ?? 0])
    ) as Record<OrderStatus, number>;

    // 재고 임박 (임계치 이하) — 카드에는 8개만 보여 주지만 '할 일' 숫자는 전체 건수여야 한다
    const lowStockAll = ((lowStockRes.data ?? []) as ProductRow[]).filter(
      (p) => p.stock <= p.low_stock_threshold
    );
    const lowStock = lowStockAll.slice(0, 8);

    // 최근 7일 일별 매출 (빈 날짜 0으로 채움)
    const daily = new Map<string, { sales: number; orders: number }>();
    for (let i = 6; i >= 0; i--) {
      daily.set(kstDateStr(kstDayStartUtc(i)), { sales: 0, orders: 0 });
    }
    for (const o of weekOrders) {
      const key = kstDateStr(o.created_at);
      const cur = daily.get(key);
      if (cur) {
        cur.sales += o.total ?? 0;
        cur.orders += 1;
      }
    }
    const dailySales = [...daily.entries()].map(([date, v]) => ({ date, ...v }));

    const recentOrders = (recentRes.data ?? []).map((o) => ({
      id: o.id as string,
      order_no: o.order_no as string,
      orderer_name: (o.orderer as { name?: string } | null)?.name ?? "-",
      total: o.total as number,
      status: o.status as OrderStatus,
      created_at: o.created_at as string,
    }));

    return NextResponse.json({
      today: kpi(todayOrders, newTodayRes.count ?? 0),
      week: kpi(weekOrders, newWeekRes.count ?? 0),
      statusCounts,
      lowStock,
      recentOrders,
      dailySales,
      todo: {
        refundRequested: statusCounts.refund_requested ?? 0,
        paid: statusCounts.paid ?? 0,
        reviewsPending: reviewsPendingRes.count ?? 0,
        inquiriesNew: inquiriesNewRes.count ?? 0,
        emptyDetail: (detailNullRes.count ?? 0) + (detailBlankRes.count ?? 0),
        lowStock: lowStockAll.length,
      },
    });
  } catch (e) {
    console.error("[admin/dashboard]", e);
    return NextResponse.json(
      { error: "대시보드 데이터를 불러오지 못했습니다." },
      { status: 500 }
    );
  }
}
