"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import StatCard from "@/components/admin/StatCard";
import StatusChip from "@/components/admin/StatusChip";
import DataTable, { type DataTableColumn } from "@/components/admin/DataTable";
import { krw, formatDateTime } from "@/lib/format";
import { ORDER_STATUS_LABELS } from "@/lib/admin-labels";
import type { OrderStatus } from "@/lib/types";
import { SalesAreaChart, type DailyPoint } from "./analytics/charts";
import TodoBoard, { type TodoItem } from "./_dashboard/TodoBoard";
import StatusBreakdownList from "./_dashboard/StatusBreakdownList";

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

/** 대시보드 상단 '오늘 처리할 일' 집계 (API 가 함께 내려준다) */
interface TodoCounts {
  /** API 가 계속 내려주지만 화면에는 '오늘 처리할 일' 로 띄우지 않는다
      — 이 상태로 넘어오는 경로가 없어 늘 0이다(아래 todoItems 주석) */
  refundRequested: number;
  paid: number;
  reviewsPending: number;
  inquiriesNew: number;
  emptyDetail: number;
  lowStock: number;
}

interface DashboardData {
  today: Kpi;
  week: Kpi;
  statusCounts: Record<OrderStatus, number>;
  lowStock: LowStockRow[];
  recentOrders: RecentOrderRow[];
  dailySales: DailyPoint[];
  todo?: TodoCounts;
}

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
        {/* label-caps 는 자간을 0.22em 벌린다 — 영문 오버라인용이라 한글에서는
            '최 근  7 일  매 출' 처럼 글자가 흩어져 읽는 속도가 눈에 띄게 느려진다.
            uppercase 도 한글에는 아무 효과가 없다. 관리자 화면은 한국어뿐이므로 쓰지 않는다. */}
        <h2 className="text-[13px] font-semibold text-ink-500">{title}</h2>
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
          className="mt-6 border border-ink-200 bg-cream-50 px-4 py-2.5 text-sm text-ink-700 transition-colors hover:bg-cream-100"
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

  const { today, week, statusCounts, lowStock, recentOrders, dailySales, todo } = data;
  const weekSalesTotal = dailySales.reduce((acc, d) => acc + d.sales, 0);

  /* '오늘 처리할 일' — 급한 순서로 고정한다.
     구형 응답(todo 없음)으로도 화면이 깨지지 않게 statusCounts 로 값을 메운다.

     ⚠ '환불 요청' 칸을 여기서 뺐다.
     주문이 refund_requested 상태로 넘어오는 경로가 이 저장소 어디에도 없다 — 고객 화면에는
     환불 요청 버튼이 없고, 관리자가 손으로 바꿀 수 있는 상태 목록(ADMIN_SETTABLE_STATUSES)
     에도 그 상태는 빠져 있다. 읽고 라벨을 붙이는 코드만 있다. 그러니 이 숫자는 구조적으로
     항상 0이고, '오늘 처리할 일' 맨 앞에서 늘 '없음' 으로 앉아 있으면
     "환불 요청이 들어오면 여기 뜬다" 는 있지도 않은 안전망을 믿게 만든다.
     그래서 지표 자체는 지우지 않고 '상태별 주문 현황' 에 남겨 두되, 왜 늘 0인지와
     환불을 실제로 어떻게 처리하는지를 그 자리에서 말해 준다(아래 카드).

     주소(href)는 **받는 화면이 실제로 읽는 조건**만 싣는다.
     주문 관리만 주소로 조건을 받는다(orders/page.tsx 가 `tab` 을 읽는다).
     리뷰·문의·재고·상품 화면은 아직 주소로 조건을 받지 않는다 — 읽지도 않는 조건을 주소에
     달아 두면 눌러도 전체 목록이 나오면서 '필터가 걸렸다'고 착각하게 되므로, 조건 없이
     화면만 열고 어느 탭을 눌러야 하는지 설명(hint)으로 알려 준다. */
  const todoItems: TodoItem[] = [
    {
      // 상태 이름은 화면 안에서 짓지 않는다 — 주문 관리 화면과 같은 말이어야 찾아갈 수 있다
      label: ORDER_STATUS_LABELS.paid,
      count: todo?.paid ?? statusCounts.paid ?? 0,
      hint: "결제가 끝나 발송을 기다리는 주문 · 주문 관리의 결제완료 탭이 열립니다",
      href: "/admin/orders?tab=paid",
      tone: "action",
    },
    {
      label: "답글 대기 리뷰",
      count: todo?.reviewsPending ?? 0,
      hint: "고객이 남긴 리뷰 중 아직 답글을 달지 않은 것 · 리뷰 관리의 답글 대기 탭에서 볼 수 있습니다",
      href: "/admin/reviews",
      tone: "action",
    },
    {
      label: "새 견적 문의",
      count: todo?.inquiriesNew ?? 0,
      hint: "업소용·OEM 문의 중 아직 연락하지 않은 건 · 문의 화면의 신규 접수 탭에서 볼 수 있습니다",
      href: "/admin/bulk-inquiries",
      tone: "action",
    },
    {
      label: "재고 부족",
      count: todo?.lowStock ?? lowStock.length,
      hint: "재고 부족 기준 아래로 내려간 판매 상품",
      href: "/admin/inventory",
      tone: "warn",
    },
    {
      label: "상세페이지 빈 상품",
      count: todo?.emptyDetail ?? 0,
      hint: "판매 중인데 상세 설명이 하나도 없는 상품 · 상품을 열어 상세페이지 탭에서 채웁니다",
      href: "/admin/products",
      tone: "quiet",
    },
  ];

  return (
    <div className="space-y-6">
      {/* ---------- 오늘 처리할 일 ---------- */}
      <TodoBoard items={todoItems} />

      {/* ---------- KPI ----------
          숫자 밑에 '무엇을 센 숫자인지' 한 줄을 함께 둔다.
          '오늘 매출' 이 결제 완료분만인지 주문 접수분까지인지를 두고 실제로 혼선이 있었다. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="오늘 매출"
          value={`${krw(today.sales)}원`}
          sub={
            <>
              <span className="block">이번 주 {krw(week.sales)}원</span>
              <span className="mt-1 block text-ink-300">결제가 끝난 주문의 결제 금액 합계</span>
            </>
          }
        />
        <StatCard
          label="오늘 주문"
          value={`${today.orders}건`}
          sub={
            <>
              <span className="block">이번 주 {week.orders}건</span>
              <span className="mt-1 block text-ink-300">결제가 끝난 주문 건수</span>
            </>
          }
        />
        <StatCard
          label="주문 한 건당 평균"
          value={`${krw(today.avgOrder)}원`}
          sub={
            <>
              <span className="block">이번 주 평균 {krw(week.avgOrder)}원</span>
              <span className="mt-1 block text-ink-300">매출을 주문 건수로 나눈 값</span>
            </>
          }
        />
        <StatCard
          label="신규 회원"
          value={`${today.newMembers}명`}
          sub={
            <>
              <span className="block">이번 주 {week.newMembers}명</span>
              <span className="mt-1 block text-ink-300">오늘 새로 가입한 회원 수</span>
            </>
          }
        />
      </div>

      {/* ---------- 매출 차트 + 상태 현황 ---------- */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="최근 7일 매출" className="lg:col-span-2">
          <p className="mb-4 text-xl font-semibold text-ink-900 krw">
            {krw(weekSalesTotal)}원
            <span className="ml-2 text-xs font-normal text-ink-400">7일 합계</span>
          </p>
          {/* 전액 0원이면 축이 0~4 로 잡혀 '4원' 처럼 읽힌다 — 차트 대신 안내를 그린다 */}
          <SalesAreaChart
            data={dailySales}
            emptyMessage="최근 7일간 결제된 주문이 없습니다."
            emptyHint="상품이 '판매중' 상태인지, 스토어에서 실제로 구매가 되는지 확인해 보세요."
          />
        </Card>

        <Card title="상태별 주문 현황" action={{ href: "/admin/orders", label: "주문 관리" }}>
          <StatusBreakdownList statusCounts={statusCounts} />
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
            emptyMessage="아직 들어온 주문이 없습니다. 주문이 들어오면 여기에 최근 10건이 표시됩니다."
            onRowClick={(o) => router.push(`/admin/orders/${o.id}`)}
          />
        </Card>

        <Card title="재고 임박 상품" action={{ href: "/admin/inventory", label: "재고 관리" }}>
          {lowStock.length === 0 ? (
            <p className="py-10 text-center text-sm leading-relaxed text-ink-400">
              재고 부족 기준 아래로 내려간 상품이 없습니다.
              <span className="mt-1 block text-xs text-ink-300">
                기준 수량은 상품별로 재고 관리 화면에서 바꿀 수 있습니다.
              </span>
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
