"use client";

import { useCallback, useEffect, useState } from "react";
import StatCard from "@/components/admin/StatCard";
import { krw } from "@/lib/format";
import {
  CHART,
  DailyComboChart,
  TopProductsChart,
  CategoryDonut,
  type DailyPoint,
  type TopProductRow,
  type CategoryRow,
} from "./charts";

/* ---------- 타입 ---------- */

interface FunnelStep {
  step: string;
  label: string;
  count: number;
}

interface VipSplit {
  vipSales: number;
  vipOrders: number;
  regularSales: number;
  regularOrders: number;
}

interface AnalyticsData {
  days: number;
  totals: { sales: number; orders: number; avgOrder: number };
  daily: DailyPoint[];
  topProducts: TopProductRow[];
  categorySales: CategoryRow[];
  funnel: FunnelStep[];
  vip: VipSplit;
  hourly: number[];
}

const RANGES = [7, 30, 90] as const;

/* ---------- 카드 셸 ---------- */

function Card({
  title,
  sub,
  children,
  className = "",
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`border border-ink-200 bg-cream-50 p-5 ${className}`}>
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 className="label-caps text-ink-400">{title}</h2>
        {sub && <p className="shrink-0 text-xs text-ink-400">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

/* ---------- 퍼널 ---------- */

function FunnelSteps({ funnel }: { funnel: FunnelStep[] }) {
  const max = Math.max(...funnel.map((f) => f.count), 1);
  const first = funnel[0]?.count ?? 0;
  const last = funnel[funnel.length - 1]?.count ?? 0;
  const overall = first > 0 ? ((last / first) * 100).toFixed(2) : null;

  return (
    <div>
      <ul className="space-y-3">
        {funnel.map((f, i) => {
          const prev = i > 0 ? funnel[i - 1].count : null;
          const conv = prev !== null && prev > 0 ? ((f.count / prev) * 100).toFixed(1) : null;
          return (
            <li key={f.step}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                <span className="text-ink-700">{f.label}</span>
                <span className="text-ink-500 krw">
                  {krw(f.count)}건
                  {conv !== null && <span className="ml-2 text-ink-400">이전 대비 {conv}%</span>}
                </span>
              </div>
              <div className="h-4 w-full bg-cream-100">
                <div
                  className="h-full transition-[width] duration-500 ease-hall"
                  style={{
                    width: `${Math.max((f.count / max) * 100, f.count > 0 ? 1.5 : 0)}%`,
                    backgroundColor: CHART.ramp[i % CHART.ramp.length],
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      {overall !== null && (
        <p className="mt-4 border-t border-ink-100 pt-3 text-xs text-ink-500">
          전체 전환율(페이지 조회 → 구매)&ensp;
          <span className="font-semibold text-forest-700 krw">{overall}%</span>
        </p>
      )}
    </div>
  );
}

/* ---------- VIP vs 일반 ---------- */

function VipCompare({ vip }: { vip: VipSplit }) {
  const rows = [
    {
      label: "VIP",
      sales: vip.vipSales,
      orders: vip.vipOrders,
      color: CHART.brass500,
    },
    {
      label: "일반",
      sales: vip.regularSales,
      orders: vip.regularOrders,
      color: CHART.forest600,
    },
  ];
  const total = vip.vipSales + vip.regularSales;
  const max = Math.max(vip.vipSales, vip.regularSales, 1);

  if (total === 0 && vip.vipOrders + vip.regularOrders === 0) {
    return (
      <p className="py-12 text-center text-sm text-ink-400">기간 내 결제된 주문이 없습니다.</p>
    );
  }

  return (
    <div className="space-y-5">
      {rows.map((r) => {
        const share = total > 0 ? ((r.sales / total) * 100).toFixed(1) : "0.0";
        const avg = r.orders > 0 ? Math.round(r.sales / r.orders) : 0;
        return (
          <div key={r.label}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-sm text-ink-700">
                <span aria-hidden className="h-2.5 w-2.5" style={{ backgroundColor: r.color }} />
                {r.label}
              </span>
              <span className="text-sm text-ink-900 krw">
                {krw(r.sales)}원
                <span className="ml-2 text-xs text-ink-400">{share}%</span>
              </span>
            </div>
            <div className="h-5 w-full bg-cream-100">
              <div
                className="h-full transition-[width] duration-500 ease-hall"
                style={{
                  width: `${Math.max((r.sales / max) * 100, r.sales > 0 ? 1.5 : 0)}%`,
                  backgroundColor: r.color,
                }}
              />
            </div>
            <p className="mt-1 text-xs text-ink-400 krw">
              주문 {krw(r.orders)}건 · 객단가 {krw(avg)}원
            </p>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- 시간대별 주문 히트 스트립 ---------- */

const HEAT_RAMP = ["#e0ede3", "#c2dbc9", "#97c0a6", "#47825f", "#35684b"];

function heatColor(value: number, max: number): string {
  if (value <= 0 || max <= 0) return "#f6f4ec";
  const idx = Math.min(Math.floor((value / max) * HEAT_RAMP.length), HEAT_RAMP.length - 1);
  return HEAT_RAMP[idx];
}

function HourlyHeatStrip({ hourly }: { hourly: number[] }) {
  const max = Math.max(...hourly, 0);
  const peakHour = max > 0 ? hourly.indexOf(max) : null;

  return (
    <div>
      <div className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-0.5">
        {hourly.map((count, hour) => (
          <div
            key={hour}
            role="img"
            aria-label={`${hour}시 주문 ${count}건`}
            title={`${hour}시 — ${count}건`}
            className="h-10 border border-ink-100"
            style={{ backgroundColor: heatColor(count, max) }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-ink-400 krw">
        <span>0시</span>
        <span>6시</span>
        <span>12시</span>
        <span>18시</span>
        <span>23시</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-500">
          {peakHour !== null ? (
            <>
              주문이 가장 많은 시간대&ensp;
              <span className="font-semibold text-forest-700 krw">
                {peakHour}시 ({hourly[peakHour]}건)
              </span>
            </>
          ) : (
            "기간 내 주문이 없습니다."
          )}
        </p>
        <div className="flex items-center gap-1.5 text-[10px] text-ink-400">
          적음
          {HEAT_RAMP.map((c) => (
            <span key={c} aria-hidden className="h-2.5 w-2.5" style={{ backgroundColor: c }} />
          ))}
          많음
        </div>
      </div>
    </div>
  );
}

/* ---------- 페이지 ---------- */

export default function AnalyticsClient() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (d: number) => {
    try {
      const res = await fetch(`/api/admin/analytics?days=${d}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "분석 데이터를 불러오지 못했습니다.");
      setData(body as AnalyticsData);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "분석 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 데이터 로드 — setState는 모두 fetch 완료(await) 이후에만 실행된다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(days);
  }, [days, load]);

  function changeDays(d: (typeof RANGES)[number]) {
    if (d === days) return;
    setLoading(true);
    setError(null);
    setDays(d);
  }

  function retry() {
    setLoading(true);
    setError(null);
    void load(days);
  }

  return (
    <div className="space-y-6">
      {/* 기간 선택 */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-ink-500">최근 {days}일 기준</p>
        <div className="inline-flex border border-ink-200">
          {RANGES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => changeDays(d)}
              aria-pressed={days === d}
              className={`px-4 py-2.5 text-sm transition-colors ${
                days === d
                  ? "bg-forest-700 font-semibold text-cream-50"
                  : "bg-cream-50 text-ink-600 hover:bg-cream-100"
              }`}
            >
              {d}일
            </button>
          ))}
        </div>
      </div>

      {error ? (
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
      ) : loading || !data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="border border-ink-200 bg-cream-50 p-5">
                <div className="h-3 w-16 animate-pulse bg-cream-100" />
                <div className="mt-4 h-7 w-28 animate-pulse bg-cream-100" />
              </div>
            ))}
          </div>
          <div className="h-96 animate-pulse border border-ink-200 bg-cream-100" />
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="h-80 animate-pulse border border-ink-200 bg-cream-100" />
            <div className="h-80 animate-pulse border border-ink-200 bg-cream-100" />
          </div>
        </div>
      ) : (
        <>
          {/* KPI */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard label="기간 매출" value={`${krw(data.totals.sales)}원`} />
            <StatCard label="주문 수" value={`${krw(data.totals.orders)}건`} />
            <StatCard label="평균 주문액" value={`${krw(data.totals.avgOrder)}원`} />
          </div>

          {/* 일별 매출 + 주문수 */}
          <Card title="일별 매출 · 주문수" sub="결제 완료 기준">
            <DailyComboChart data={data.daily} />
          </Card>

          {/* Top10 + 카테고리 */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="인기 상품 Top 10" sub="판매액 기준">
              {data.topProducts.length === 0 ? (
                <p className="py-12 text-center text-sm text-ink-400">
                  기간 내 판매 데이터가 없습니다.
                </p>
              ) : (
                <TopProductsChart data={data.topProducts} />
              )}
            </Card>
            <Card title="카테고리별 매출">
              <CategoryDonut data={data.categorySales} />
            </Card>
          </div>

          {/* 퍼널 + VIP 비교 */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="구매 퍼널" sub="행동 이벤트 집계">
              <FunnelSteps funnel={data.funnel} />
            </Card>
            <Card title="VIP · 일반 매출 비교">
              <VipCompare vip={data.vip} />
            </Card>
          </div>

          {/* 시간대 히트 스트립 */}
          <Card title="시간대별 주문" sub="KST 기준">
            <HourlyHeatStrip hourly={data.hourly} />
          </Card>
        </>
      )}
    </div>
  );
}
