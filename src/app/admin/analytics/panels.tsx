"use client";

/* ============================================================
   분석 화면 패널 — 구매 단계 / VIP 비교 / 시간대별 주문

   AnalyticsClient 에서 떼어냈다. 화면 하나에 집계 로직과 세 종류의 그리기 코드가
   모여 있어 파일이 길어졌고, 문구를 고칠 때마다 어디를 봐야 하는지 헷갈렸다.

   문구 원칙: 개발 용어를 화면에 내보내지 않는다.
   '퍼널'·'행동 이벤트'·'KST'·'Total' 은 대표·마케터가 읽는 말이 아니다.
   특히 '이전 대비 1.4%' 는 '지난달보다 1.4% 늘었다'로 오해하기 딱 좋았다 —
   실제 뜻은 '앞 단계에서 1.4%가 넘어왔다'로, 정반대의 판단을 부른다.
   ============================================================ */

import { krw } from "@/lib/format";
import { CHART } from "./charts";

/* ---------- 구매까지 가는 단계 ---------- */

export interface FunnelStep {
  step: string;
  label: string;
  count: number;
}

/** 각 단계가 무엇을 센 숫자인지 — 숫자만 있으면 뜻을 물어볼 사람이 없다 */
const STEP_HINTS: Record<string, string> = {
  product_view: "상품 상세 화면을 연 횟수",
  add_to_cart: "장바구니 담기를 누른 횟수",
  begin_checkout: "결제 화면까지 넘어간 횟수",
  purchase: "결제를 끝내고 주문이 만들어진 횟수",
};

export function FunnelSteps({ funnel }: { funnel: FunnelStep[] }) {
  const max = Math.max(...funnel.map((f) => f.count), 1);
  const first = funnel[0]?.count ?? 0;
  const last = funnel[funnel.length - 1]?.count ?? 0;

  // 첫 단계가 0이면 아래 단계의 비율은 전부 의미가 없다. 0%와 빈 막대를
  // 숫자처럼 읽히게 두지 말고 '아직 없다'고 분명히 말한다.
  if (first === 0) {
    return (
      <div className="border border-dashed border-ink-200 bg-cream-100 px-4 py-14 text-center">
        <p className="text-sm text-ink-500">아직 집계된 고객 행동 기록이 없습니다.</p>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-400">
          고객이 스토어에서 상품을 열어 보기 시작하면 이 자리에 단계별 인원이 쌓입니다.
        </p>
      </div>
    );
  }

  return (
    <div>
      <ul className="space-y-3.5">
        {funnel.map((f, i) => {
          const prev = i > 0 ? funnel[i - 1].count : null;
          const conv = prev !== null && prev > 0 ? ((f.count / prev) * 100).toFixed(1) : null;
          return (
            <li key={f.step}>
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs">
                <span className="text-ink-700">{f.label}</span>
                <span className="krw text-ink-500">
                  {krw(f.count)}건
                  {conv !== null && (
                    <span className="ml-2 text-ink-400">앞 단계에서 {conv}% 넘어옴</span>
                  )}
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
              <p className="mt-1 text-[11px] text-ink-400">{STEP_HINTS[f.step] ?? ""}</p>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 border-t border-ink-100 pt-3 text-xs leading-relaxed text-ink-500">
        상품을 열어 본 뒤 구매까지 이어진 비율&ensp;
        <span className="krw font-semibold text-forest-700">
          {((last / first) * 100).toFixed(2)}%
        </span>
      </p>
    </div>
  );
}

/* ---------- VIP · 일반 매출 비교 ---------- */

export interface VipSplit {
  vipSales: number;
  vipOrders: number;
  regularSales: number;
  regularOrders: number;
}

export function VipCompare({ vip }: { vip: VipSplit }) {
  const rows = [
    { label: "VIP 고객", sales: vip.vipSales, orders: vip.vipOrders, color: CHART.brass500 },
    {
      label: "일반 고객",
      sales: vip.regularSales,
      orders: vip.regularOrders,
      color: CHART.forest600,
    },
  ];
  const total = vip.vipSales + vip.regularSales;
  const max = Math.max(vip.vipSales, vip.regularSales, 1);

  if (total === 0 && vip.vipOrders + vip.regularOrders === 0) {
    return (
      <div className="border border-dashed border-ink-200 bg-cream-100 px-4 py-14 text-center">
        <p className="text-sm text-ink-500">이 기간에 결제된 주문이 없습니다.</p>
        <p className="mt-1.5 text-xs text-ink-400">
          주문이 들어오면 VIP 전용가로 산 금액과 일반 판매 금액을 나눠서 보여 줍니다.
        </p>
      </div>
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
              <span className="krw text-sm text-ink-900">
                {krw(r.sales)}원<span className="ml-2 text-xs text-ink-400">{share}%</span>
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
            <p className="krw mt-1 text-xs text-ink-400">
              주문 {krw(r.orders)}건 · 한 건당 평균 {krw(avg)}원
            </p>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- 시간대별 주문 ---------- */

const HEAT_RAMP = ["#e0ede3", "#c2dbc9", "#97c0a6", "#47825f", "#35684b"];

function heatColor(value: number, max: number): string {
  if (value <= 0 || max <= 0) return "#f6f4ec";
  const idx = Math.min(Math.floor((value / max) * HEAT_RAMP.length), HEAT_RAMP.length - 1);
  return HEAT_RAMP[idx];
}

export function HourlyHeatStrip({ hourly }: { hourly: number[] }) {
  const max = Math.max(...hourly, 0);
  const peakHour = max > 0 ? hourly.indexOf(max) : null;

  return (
    <div>
      {/* 모바일에서 24칸이 한 줄에 들어가면 칸 하나가 손톱만 해진다 — 가로로 넘겨 보게 한다 */}
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div className="grid min-w-[420px] grid-cols-[repeat(24,minmax(0,1fr))] gap-0.5">
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
        <div className="krw mt-1.5 flex min-w-[420px] justify-between text-[10px] text-ink-400">
          <span>0시</span>
          <span>6시</span>
          <span>12시</span>
          <span>18시</span>
          <span>23시</span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-500">
          {peakHour !== null ? (
            <>
              주문이 가장 많은 시간대&ensp;
              <span className="krw font-semibold text-forest-700">
                {peakHour}시 ({hourly[peakHour]}건)
              </span>
            </>
          ) : (
            "이 기간에 들어온 주문이 없습니다."
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
