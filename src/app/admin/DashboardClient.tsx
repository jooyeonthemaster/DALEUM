"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import StatCard from "@/components/admin/StatCard";
import StatusChip from "@/components/admin/StatusChip";
import DataTable, { type DataTableColumn } from "@/components/admin/DataTable";
import { krw, formatDateTime } from "@/lib/format";
import type { OrderStatus } from "@/lib/types";
import { SalesAreaChart, type DailyPoint } from "./analytics/charts";

/* ---------- 타입 ---------- */

interface Kpi {
  sales: number;
  orders: number;
  avgOrder: number;
  newMembers: number;
}

interface LowStockRow {
  id: string;
  name: string;
  stock: number;
  low_stock_threshold: number;
}

interface RecentOrderRow {
  id: string;
  order_no: string;
  orderer_name: string;
  total: number;
  status: OrderStatus;
  created_at: string;
}

interface DashboardData {
  today: Kpi;
  week: Kpi;
  statusCounts: Record<OrderStatus, number>;
  lowStock: LowStockRow[];
  recentOrders: RecentOrderRow[];
  dailySales: DailyPoint[];
}

/** 대시보드에 표시할 상태 순서 */
const STATUS_ORDER: OrderStatus[] = [
  "pending",
  "paid",
  "preparing",
  "shipped",
  "delivered",
  "confirmed",
  "refund_requested",
  "cancelled",
  "refunded",
];

/* ---------- 카드 셸 ---------- */

function Card({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: { href: string; label: string };
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`border border-ink-200 bg-cream-50 p-5 ${className}`}>
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="label-caps text-ink-400">{title}</h2>
        {action && (
          <Link
            href={action.href}
            className="shrink-0 text-xs text-ink-500 transition-colors hover:text-forest-700"
          >
            {action.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/* ---------- 페이지 ---------- */

export default function DashboardClient() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/dashboard", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "데이터를 불러오지 못했습니다.");
      setData(body as DashboardData);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 데이터 로드 — setState는 모두 fetch 완료(await) 이후에만 실행된다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  function retry() {
    setLoading(true);
    setError(null);
    void load();
  }

  const columns: DataTableColumn<RecentOrderRow>[] = [
    { key: "order_no", label: "주문번호", width: "150px" },
    { key: "orderer_name", label: "주문자" },
    {
      key: "total",
      label: "결제 금액",
      align: "right",
      render: (o) => <span className="krw">{krw(o.total)}원</span>,
    },
    {
      key: "status",
      label: "상태",
      align: "center",
      width: "110px",
      render: (o) => <StatusChip status={o.status} />,
    },
    {
      key: "created_at",
      label: "주문일시",
      hideOnMobile: true,
      width: "150px",
      render: (o) => formatDateTime(o.created_at),
    },
  ];

  if (error) {
    return (
      <div className="py-24 text-center">
        <p className="headline-serif text-lg text-ink-500">{error}</p>
        <button
          type="button"
          onClick={retry}
          className="mt-6 border border-ink-200 bg-cream-50 px-4 py-2 text-sm text-ink-700 transition-colors hover:bg-cream-100"
        >
          다시 불러오기
        </button>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border border-ink-200 bg-cream-50 p-5">
              <div className="h-3 w-16 animate-pulse bg-cream-100" />
              <div className="mt-4 h-7 w-28 animate-pulse bg-cream-100" />
              <div className="mt-2 h-3 w-20 animate-pulse bg-cream-100" />
            </div>
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="h-72 animate-pulse border border-ink-200 bg-cream-100 lg:col-span-2" />
          <div className="h-72 animate-pulse border border-ink-200 bg-cream-100" />
        </div>
        <div className="h-80 animate-pulse border border-ink-200 bg-cream-100" />
      </div>
    );
  }

  const { today, week, statusCounts, lowStock, recentOrders, dailySales } = data;
  const weekSalesTotal = dailySales.reduce((acc, d) => acc + d.sales, 0);

  return (
    <div className="space-y-6">
      {/* ---------- KPI ---------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="오늘 매출"
          value={`${krw(today.sales)}원`}
          sub={`이번 주 ${krw(week.sales)}원`}
        />
        <StatCard
          label="오늘 주문"
          value={`${today.orders}건`}
          sub={`이번 주 ${week.orders}건`}
        />
        <StatCard
          label="평균 주문액"
          value={`${krw(today.avgOrder)}원`}
          sub={`이번 주 평균 ${krw(week.avgOrder)}원`}
        />
        <StatCard
          label="신규 회원"
          value={`${today.newMembers}명`}
          sub={`이번 주 ${week.newMembers}명`}
        />
      </div>

      {/* ---------- 처리 대기 알림 ---------- */}
      {statusCounts.paid > 0 && (
        <Link
          href="/admin/orders"
          className="flex items-center justify-between gap-4 border border-forest-600 bg-forest-50 px-5 py-4 transition-colors hover:bg-forest-100"
        >
          <p className="text-sm text-forest-800">
            <span className="font-semibold">결제 완료 {statusCounts.paid}건</span> — 상품 준비가
            필요합니다.
          </p>
          <span className="inline-flex shrink-0 items-center gap-1 text-sm text-forest-700">
            주문 관리
            <ArrowRight size={16} strokeWidth={1.5} />
          </span>
        </Link>
      )}

      {/* ---------- 매출 차트 + 상태 현황 ---------- */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="최근 7일 매출" className="lg:col-span-2">
          <p className="mb-4 text-xl font-semibold text-ink-900 krw">
            {krw(weekSalesTotal)}원
            <span className="ml-2 text-xs font-normal text-ink-400">7일 합계</span>
          </p>
          <SalesAreaChart data={dailySales} />
        </Card>

        <Card title="상태별 주문 현황" action={{ href: "/admin/orders", label: "주문 관리" }}>
          <ul className="divide-y divide-ink-100">
            {STATUS_ORDER.map((s) => (
              <li key={s} className="flex items-center justify-between py-2">
                <StatusChip status={s} />
                <span
                  className={`text-sm krw ${
                    s === "paid" && statusCounts[s] > 0
                      ? "font-semibold text-forest-700"
                      : "text-ink-700"
                  }`}
                >
                  {krw(statusCounts[s] ?? 0)}건
                  {s === "paid" && statusCounts[s] > 0 && (
                    <span className="ml-1.5 text-xs font-normal text-forest-600">준비 필요</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* ---------- 최근 주문 + 재고 임박 ---------- */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card
          title="최근 주문 10건"
          action={{ href: "/admin/orders", label: "전체 보기" }}
          className="lg:col-span-2"
        >
          <DataTable<RecentOrderRow>
            columns={columns}
            rows={recentOrders}
            emptyMessage="아직 들어온 주문이 없습니다."
            onRowClick={(o) => router.push(`/admin/orders/${o.id}`)}
          />
        </Card>

        <Card title="재고 임박 상품" action={{ href: "/admin/inventory", label: "재고 관리" }}>
          {lowStock.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-400">
              임계치 이하로 내려간 상품이 없습니다.
            </p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {lowStock.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-700">{p.name}</span>
                  <span
                    className={`shrink-0 text-sm krw ${
                      p.stock <= 0 ? "font-semibold text-signal-red" : "text-signal-amber"
                    }`}
                  >
                    {p.stock <= 0 ? "품절" : `${krw(p.stock)}개 남음`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
