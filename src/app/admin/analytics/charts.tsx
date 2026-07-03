"use client";

/* ============================================================
   관리자 차트 — recharts 기반 (대시보드/분석 공용)
   색: forest 스케일만, VIP 시리즈에 한해 brass-500 하나.
   검증된 팔레트(콘트라스트·CVD 분리 통과):
   - 단일 시리즈: forest-600 #35684b
   - 콤보(막대+선): #35684b + #0f1f17 (ΔE 29.9)
   - 순서 램프: #689e7e → #47825f → #35684b → #244333 → #0f1f17
   ============================================================ */

import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { krw } from "@/lib/format";

/* ---------- 팔레트 (globals.css 토큰과 동일 값) ---------- */

export const CHART = {
  forest600: "#35684b",
  forest950: "#0f1f17",
  brass500: "#a8894e",
  /** 순서(ordinal) 램프 — 밝음→어두움 */
  ramp: ["#689e7e", "#47825f", "#35684b", "#244333", "#0f1f17"],
  /** 도넛용 — 큰 조각부터 어두움→밝음 */
  donut: ["#244333", "#35684b", "#47825f", "#689e7e", "#97c0a6", "#c2dbc9"],
  grid: "#e9ebe5", // ink-100
  axisLine: "#d5d9d0", // ink-200
  tick: "#8d9485", // ink-400
  surface: "#fbfaf6", // cream-50
} as const;

/* ---------- 포맷터 ---------- */

/** 축 눈금용 축약 원화 — 1200000 → 120만 */
export function compactWon(n: number): string {
  if (n >= 100_000_000) {
    const v = n / 100_000_000;
    return `${v % 1 === 0 ? v : v.toFixed(1)}억`;
  }
  if (n >= 10_000) return `${Math.round(n / 10_000)}만`;
  return krw(n);
}

/** yyyy-mm-dd → 6.27 */
export function shortDate(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)}.${Number(d)}`;
}

const TICK = { fontSize: 11, fill: CHART.tick } as const;

/* ---------- 공용 툴팁 ---------- */

function ChartTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="border border-ink-200 bg-cream-50 px-3 py-2">
      {label !== undefined && label !== null && (
        <p className="text-[11px] text-ink-400">{String(label)}</p>
      )}
      {payload.map((p, i) => (
        <p key={`${String(p.dataKey)}-${i}`} className="mt-0.5 text-xs text-ink-900 krw">
          <span
            aria-hidden
            className="mr-1.5 inline-block h-2 w-2 align-baseline"
            style={{ backgroundColor: p.color ?? CHART.forest600 }}
          />
          {p.name}&ensp;
          <span className="font-semibold">
            {typeof p.value === "number" ? krw(p.value) : String(p.value)}
            {p.unit}
          </span>
        </p>
      ))}
    </div>
  );
}

/* ---------- 범례 ---------- */

function LegendRow({ items }: { items: { label: string; color: string; line?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5 text-xs text-ink-500">
          <span
            aria-hidden
            className={it.line ? "h-0.5 w-4" : "h-2.5 w-2.5"}
            style={{ backgroundColor: it.color }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/* ============================================================
   1. 매출 영역 차트 (대시보드 최근 7일)
   ============================================================ */

export interface DailyPoint {
  date: string;
  sales: number;
  orders: number;
}

export function SalesAreaChart({ data }: { data: DailyPoint[] }) {
  const rows = data.map((d) => ({ ...d, label: shortDate(d.date) }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis
          dataKey="label"
          tick={TICK}
          tickLine={false}
          axisLine={{ stroke: CHART.axisLine }}
          tickMargin={8}
        />
        <YAxis
          tick={TICK}
          tickLine={false}
          axisLine={false}
          tickFormatter={compactWon}
          width={46}
        />
        <Tooltip content={ChartTooltip} cursor={{ stroke: CHART.axisLine }} />
        <Area
          type="monotone"
          dataKey="sales"
          name="매출"
          unit="원"
          stroke={CHART.forest600}
          strokeWidth={2}
          fill={CHART.forest600}
          fillOpacity={0.1}
          dot={false}
          activeDot={{ r: 4, stroke: CHART.surface, strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ============================================================
   2. 일별 매출 + 주문수 콤보 차트 (분석)
   ============================================================ */

export function DailyComboChart({ data }: { data: DailyPoint[] }) {
  const rows = data.map((d) => ({ ...d, label: shortDate(d.date) }));
  return (
    <div>
      <LegendRow
        items={[
          { label: "매출", color: CHART.forest600 },
          { label: "주문수", color: CHART.forest950, line: true },
        ]}
      />
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={rows} margin={{ top: 16, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis
            dataKey="label"
            tick={TICK}
            tickLine={false}
            axisLine={{ stroke: CHART.axisLine }}
            tickMargin={8}
            minTickGap={28}
          />
          <YAxis
            yAxisId="sales"
            tick={TICK}
            tickLine={false}
            axisLine={false}
            tickFormatter={compactWon}
            width={46}
          />
          <YAxis
            yAxisId="orders"
            orientation="right"
            tick={TICK}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={30}
          />
          <Tooltip content={ChartTooltip} cursor={{ fill: "rgba(53, 104, 75, 0.06)" }} />
          <Bar
            yAxisId="sales"
            dataKey="sales"
            name="매출"
            unit="원"
            fill={CHART.forest600}
            maxBarSize={24}
            radius={[3, 3, 0, 0]}
          />
          <Line
            yAxisId="orders"
            type="monotone"
            dataKey="orders"
            name="주문수"
            unit="건"
            stroke={CHART.forest950}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: CHART.surface, strokeWidth: 2 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ============================================================
   3. 인기 상품 Top 10 — 가로 막대 (분석)
   ============================================================ */

export interface TopProductRow {
  name: string;
  qty: number;
  revenue: number;
}

export function TopProductsChart({ data }: { data: TopProductRow[] }) {
  const rows = data.map((d) => ({
    ...d,
    short: d.name.length > 14 ? `${d.name.slice(0, 13)}…` : d.name,
  }));
  const height = Math.max(rows.length * 36 + 16, 120);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart
        layout="vertical"
        data={rows}
        margin={{ top: 0, right: 52, bottom: 0, left: 0 }}
      >
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="short"
          tick={{ ...TICK, fill: "#4c5347" }}
          tickLine={false}
          axisLine={{ stroke: CHART.axisLine }}
          width={110}
        />
        <Tooltip content={ChartTooltip} cursor={{ fill: "rgba(53, 104, 75, 0.06)" }} />
        <Bar
          dataKey="revenue"
          name="판매액"
          unit="원"
          fill={CHART.forest600}
          maxBarSize={18}
          radius={[0, 3, 3, 0]}
          background={{ fill: "#f6f4ec" }}
        >
          <LabelList
            dataKey="revenue"
            position="right"
            formatter={(v: React.ReactNode) => compactWon(Number(v))}
            style={{ fontSize: 10, fill: "#6a7263" }}
          />
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/* ============================================================
   4. 카테고리별 매출 도넛 (분석)
   ============================================================ */

export interface CategoryRow {
  name: string;
  revenue: number;
}

export function CategoryDonut({ data }: { data: CategoryRow[] }) {
  // 상위 5개 + 나머지는 "기타"로 접기
  const top = data.slice(0, 5);
  const restSum = data.slice(5).reduce((acc, d) => acc + d.revenue, 0);
  const slices = restSum > 0 ? [...top, { name: "기타", revenue: restSum }] : top;
  const total = slices.reduce((acc, d) => acc + d.revenue, 0);

  if (total === 0) {
    return (
      <p className="py-12 text-center text-sm text-ink-400">기간 내 판매 데이터가 없습니다.</p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row">
      <div className="relative h-52 w-52 shrink-0">
        <PieChart width={208} height={208}>
          <Pie
            data={slices}
            dataKey="revenue"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={64}
            outerRadius={92}
            startAngle={90}
            endAngle={-270}
            stroke={CHART.surface}
            strokeWidth={2}
            isAnimationActive={false}
          >
            {slices.map((s, i) => (
              <Cell key={s.name} fill={CHART.donut[i % CHART.donut.length]} />
            ))}
          </Pie>
          <Tooltip content={ChartTooltip} />
        </PieChart>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="label-caps text-ink-400">Total</span>
          <span className="mt-1 text-sm font-semibold text-ink-900 krw">{compactWon(total)}원</span>
        </div>
      </div>

      <ul className="w-full min-w-0 flex-1 space-y-2.5">
        {slices.map((s, i) => (
          <li key={s.name} className="flex items-center gap-2.5 text-sm">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0"
              style={{ backgroundColor: CHART.donut[i % CHART.donut.length] }}
            />
            <span className="min-w-0 flex-1 truncate text-ink-700">{s.name}</span>
            <span className="shrink-0 text-ink-900 krw">{krw(s.revenue)}원</span>
            <span className="w-11 shrink-0 text-right text-xs text-ink-400 krw">
              {((s.revenue / total) * 100).toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
