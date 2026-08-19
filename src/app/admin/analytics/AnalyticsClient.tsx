"use client";

/* ============================================================
   분석 화면

   고친 것과 그 이유:
   1) 지표 이름을 업무 용어로 바꾸고 각 숫자 밑에 '무엇을 센 숫자인지'를 적었다.
      '기간 매출' 하나만 크게 떠 있으면 결제 완료분인지 주문 접수분인지 알 수 없었다.
   2) '지난 기간 대비'를 붙였다. 30일 매출 숫자 하나만 보고는 좋은지 나쁜지 판단할 수 없다.
   3) 화면의 숫자를 그대로 엑셀로 내려받게 했다. 월말 보고 때 손으로 받아 적고 있었다.
   4) 개발 용어를 지웠다 — '퍼널'·'행동 이벤트 집계'·'KST'·'Top 10'.
   ============================================================ */

import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import StatCard from "@/components/admin/StatCard";
import { krw } from "@/lib/format";
import {
  DailyComboChart,
  TopProductsChart,
  CategoryDonut,
  type DailyPoint,
  type TopProductRow,
  type CategoryRow,
} from "./charts";
import {
  FunnelSteps,
  VipCompare,
  HourlyHeatStrip,
  type FunnelStep,
  type VipSplit,
} from "./panels";

/* ---------- 타입 ---------- */

interface Totals {
  sales: number;
  orders: number;
  avgOrder: number;
}

interface AnalyticsData {
  days: number;
  totals: Totals;
  /** 같은 길이의 직전 기간 — 구버전 응답에는 없을 수 있다 */
  prevTotals?: Totals;
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
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        {/* label-caps(자간 0.22em·대문자)는 영문 오버라인용이다. 한글에 걸면
            '구 매 퍼 널' 처럼 흩어져 읽기 어렵고 대문자 변환은 아무 효과가 없다. */}
        <h2 className="text-[13px] font-semibold text-ink-500">{title}</h2>
        {sub && <p className="text-xs text-ink-400">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

/* ---------- 증감 문구 ---------- */

/**
 * 직전 같은 길이 기간과 비교한 한 줄.
 * 지난 기간이 0이면 비율이 무한대가 되므로 퍼센트 대신 사실만 적는다 —
 * '+∞%' 같은 표시는 성과처럼 읽히지만 아무것도 알려주지 않는다.
 */
function DeltaLine({
  current,
  previous,
  days,
  unit,
}: {
  current: number;
  previous: number | undefined;
  days: number;
  unit: string;
}) {
  const base = `지난 ${days}일`;
  if (previous === undefined) return <span className="block">{base} 기록 없음</span>;
  if (previous === 0 && current === 0) {
    return (
      <span className="block text-ink-300">
        {base}도 0{unit}
      </span>
    );
  }
  if (previous === 0) {
    return <span className="block text-forest-600">{base}에는 없던 실적입니다</span>;
  }
  const rate = ((current - previous) / previous) * 100;
  const up = rate >= 0;
  return (
    <span className={`block ${up ? "text-forest-600" : "text-signal-red"}`}>
      {base} {krw(previous)}
      {unit} 대비 {up ? "▲" : "▼"} {Math.abs(rate).toFixed(1)}%
    </span>
  );
}

/* ---------- 페이지 ---------- */

export default function AnalyticsClient() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async (d: number) => {
    try {
      const res = await fetch(`/api/admin/analytics?days=${d}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "분석 자료를 불러오지 못했습니다.");
      setData(body as AnalyticsData);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "분석 자료를 불러오지 못했습니다.");
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

  /** 화면에 보이는 숫자를 그대로 시트 3장으로 내려받는다 (주문 화면의 엑셀 저장과 같은 방식) */
  async function downloadExcel() {
    if (!data || exporting) return;
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();

      const dailySheet = XLSX.utils.aoa_to_sheet([
        ["날짜", "매출(원)", "주문 수(건)"],
        ...data.daily.map((d) => [d.date.replace(/-/g, "."), d.sales, d.orders]),
      ]);
      dailySheet["!cols"] = [{ wch: 12 }, { wch: 14 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, dailySheet, "날짜별 매출");

      const topSheet = XLSX.utils.aoa_to_sheet([
        ["상품명", "판매 수량(개)", "판매액(원)"],
        ...data.topProducts.map((p) => [p.name, p.qty, p.revenue]),
      ]);
      topSheet["!cols"] = [{ wch: 34 }, { wch: 14 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, topSheet, "많이 팔린 상품");

      const catSheet = XLSX.utils.aoa_to_sheet([
        ["카테고리", "매출(원)"],
        ...data.categorySales.map((c) => [c.name, c.revenue]),
      ]);
      catSheet["!cols"] = [{ wch: 24 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, catSheet, "카테고리별 매출");

      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      XLSX.writeFile(wb, `다름-매출분석-최근${days}일-${stamp}.xlsx`);
    } catch (e) {
      // 원인은 서버 로그로만 남기고 화면에는 사람 말로 알린다
      console.error("[admin/analytics] 엑셀 저장 실패:", e);
      setError("엑셀 파일을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setExporting(false);
    }
  }

  const noSales = data !== null && data.totals.orders === 0;

  return (
    <div className="space-y-6">
      {/* 기간 선택 + 내보내기 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-500">오늘까지 최근 {days}일 동안의 기록입니다.</p>
        <div className="flex flex-wrap items-center gap-3">
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
          <button
            type="button"
            onClick={downloadExcel}
            disabled={!data || exporting}
            className="inline-flex items-center gap-1.5 border border-ink-200 bg-cream-50 px-4 py-2.5 text-sm text-ink-700 transition-colors hover:bg-cream-100 disabled:opacity-50"
          >
            <Download size={15} strokeWidth={1.5} aria-hidden />
            {exporting ? "만드는 중…" : "엑셀로 저장"}
          </button>
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
          {/* 핵심 지표 3개 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard
              label="기간 매출"
              value={`${krw(data.totals.sales)}원`}
              sub={
                <>
                  <DeltaLine
                    current={data.totals.sales}
                    previous={data.prevTotals?.sales}
                    days={days}
                    unit="원"
                  />
                  <span className="mt-1 block text-ink-300">
                    결제가 끝난 주문의 결제 금액 합계
                  </span>
                </>
              }
            />
            <StatCard
              label="주문 수"
              value={`${krw(data.totals.orders)}건`}
              sub={
                <>
                  <DeltaLine
                    current={data.totals.orders}
                    previous={data.prevTotals?.orders}
                    days={days}
                    unit="건"
                  />
                  <span className="mt-1 block text-ink-300">결제가 끝난 주문 건수</span>
                </>
              }
            />
            <StatCard
              label="주문 한 건당 평균"
              value={`${krw(data.totals.avgOrder)}원`}
              sub={
                <>
                  <DeltaLine
                    current={data.totals.avgOrder}
                    previous={data.prevTotals?.avgOrder}
                    days={days}
                    unit="원"
                  />
                  <span className="mt-1 block text-ink-300">매출을 주문 건수로 나눈 값</span>
                </>
              }
            />
          </div>

          {/* 날짜별 매출·주문 수 */}
          <Card title="날짜별 매출 · 주문 수" sub="결제가 끝난 주문만 셉니다">
            <DailyComboChart
              data={data.daily}
              emptyMessage={`최근 ${days}일 동안 결제된 주문이 없습니다.`}
              emptyHint="상품이 '판매중' 상태인지, 스토어에서 실제로 주문이 되는지 먼저 확인해 보세요."
            />
          </Card>

          {/* 많이 팔린 상품 + 카테고리 */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="많이 팔린 상품 10" sub="판매 금액이 큰 순서">
              {data.topProducts.length === 0 ? (
                <div className="border border-dashed border-ink-200 bg-cream-100 px-4 py-14 text-center">
                  <p className="text-sm text-ink-500">이 기간에 팔린 상품이 없습니다.</p>
                  <p className="mt-1.5 text-xs text-ink-400">
                    주문이 쌓이면 판매 금액이 큰 상품부터 10개를 보여 줍니다.
                  </p>
                </div>
              ) : (
                <TopProductsChart data={data.topProducts} />
              )}
            </Card>
            <Card title="카테고리별 매출" sub="판매 금액 기준 비중">
              <CategoryDonut data={data.categorySales} />
            </Card>
          </div>

          {/* 구매까지 가는 단계 + VIP 비교 */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card
              title="구매까지 가는 단계"
              sub="고객이 남긴 행동 기록 기준 (주문 자료와 따로 셉니다)"
            >
              <FunnelSteps funnel={data.funnel} />
            </Card>
            <Card title="VIP · 일반 매출 비교" sub="VIP 전용가로 산 주문을 따로 셉니다">
              <VipCompare vip={data.vip} />
            </Card>
          </div>

          {/* 시간대별 주문 */}
          <Card title="시간대별 주문" sub="한국 시간 기준">
            <HourlyHeatStrip hourly={data.hourly} />
          </Card>

          {noSales && (
            <p className="border border-ink-200 bg-cream-100 px-5 py-4 text-xs leading-relaxed text-ink-500">
              이 기간에는 결제된 주문이 없어 매출 관련 숫자가 모두 0입니다. 기간을 90일로 넓혀
              보거나, 상품 관리에서 상품 상태가 &lsquo;판매중&rsquo;인지 확인해 보세요.
            </p>
          )}
        </>
      )}
    </div>
  );
}
