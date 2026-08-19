"use client";

import Link from "next/link";
import { ORDER_TABS, describeRange, type DateRangeValue } from "./orders-list";

/* ============================================================
   주문이 없을 때 — "조건에 맞는 주문이 없습니다" 한 줄로는 아무것도 알 수 없다

   처음 관리자 페이지를 연 대표는 있지도 않은 필터를 지우려 하고, 반대로 기간 필터 때문에
   0건인데도 "주문이 정말 없구나" 라고 오판했다. 어느 쪽이든 다음에 뭘 해야 하는지
   화면이 알려 주지 않았다. 그래서 빈 상태를 세 갈래로 나눈다.
   ============================================================ */

interface Props {
  tab: string;
  search: string;
  range: DateRangeValue;
  /** 탭별 건수 — 다른 탭에 무엇이 기다리는지 지목하기 위해 */
  counts: Record<string, number>;
  onReset: () => void;
  onTab: (key: string) => void;
}

export default function OrdersEmpty({ tab, search, range, counts, onReset, onTab }: Props) {
  const hasFilter = Boolean(search || range.from || range.to);
  const conditions: string[] = [];
  if (search) conditions.push(`검색 "${search}"`);
  if (range.from || range.to) conditions.push(describeRange(range));

  // 조건이 걸려 있는가 — 조건 때문에 비었을 수 있다고 먼저 말해 준다
  if (hasFilter) {
    return (
      <Frame title="이 조건에 맞는 주문이 없습니다.">
        <p className="mt-3 text-sm text-ink-500">지금 걸린 조건: {conditions.join(" · ")}</p>
        <p className="mt-1.5 text-xs text-ink-400">
          연락처는 하이픈이 있어도 없어도 찾을 수 있습니다. 받는 분 이름이나 주소로도 찾아보세요.
        </p>
        <button
          type="button"
          onClick={onReset}
          className="mt-5 border border-ink-200 bg-cream-50 px-5 py-2.5 text-sm text-ink-700 transition-colors hover:bg-cream-100"
        >
          필터 초기화
        </button>
      </Frame>
    );
  }

  // 조건이 없는데 이 탭만 비었다 — 다른 탭에 기다리는 일을 지목한다
  const waiting = ORDER_TABS.filter(
    (t) => t.key !== tab && t.key !== "all" && (counts[t.key] ?? 0) > 0
  );
  if (tab !== "all" && waiting.length > 0) {
    const here = ORDER_TABS.find((t) => t.key === tab);
    const next = waiting[0];
    return (
      <Frame title={`${here?.short ?? "주문"}이 없습니다.`}>
        <p className="mt-3 text-sm text-ink-500">
          대신 {next.short} {counts[next.key]}건이 기다리고 있어요.
        </p>
        <button
          type="button"
          onClick={() => onTab(next.key)}
          className="mt-5 border border-ink-200 bg-cream-50 px-5 py-2.5 text-sm text-ink-700 transition-colors hover:bg-cream-100"
        >
          {next.label} 보기
        </button>
      </Frame>
    );
  }

  // 정말 한 건도 없다
  return (
    <Frame title="아직 들어온 주문이 없습니다.">
      <p className="mt-3 text-sm text-ink-500">
        스토어에 주문이 들어오면 여기에 자동으로 쌓입니다.
      </p>
      <Link
        href="/"
        target="_blank"
        className="mt-5 inline-block border border-ink-200 bg-cream-50 px-5 py-2.5 text-sm text-ink-700 transition-colors hover:bg-cream-100"
      >
        스토어 보기
      </Link>
    </Frame>
  );
}

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-ink-200 bg-cream-50 px-6 py-20 text-center">
      <p className="headline-serif text-lg text-ink-700">{title}</p>
      {children}
    </div>
  );
}
