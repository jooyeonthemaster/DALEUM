"use client";

/* ============================================================
   대시보드 "오늘 처리할 일"

   왜 만들었나:
   기존 대시보드는 '결제 완료 N건' 배너 하나가 전부였다. 정작 가장 급한 환불 요청,
   며칠씩 방치되던 답글 대기 리뷰, 새로 들어온 견적 문의는 알림이 없어서 대표가
   좌측 메뉴 여섯 개를 하나씩 눌러 확인해야 했다. 그러다 놓치면 환불 지연 민원과
   미응답 견적으로 이어진다.

   그래서 0건이어도 항상 자리를 지키게 했다. 숫자가 사라지면 '확인했다'는 사실
   자체가 화면에서 사라지기 때문이다 — 0건은 회색 '없음'으로 분명히 말한다.
   ============================================================ */

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export type TodoTone = "urgent" | "warn" | "action" | "quiet";

export interface TodoItem {
  /** 무엇을 처리해야 하는지 (업무 용어) */
  label: string;
  count: number;
  /** 무엇을 센 숫자인지 한 줄 설명 — 숫자만 있으면 뜻을 오해한다 */
  hint: string;
  href: string;
  tone: TodoTone;
}

/** 건수가 있을 때의 강조 색 — 급한 것(환불)만 빨강, 나머지는 브랜드 초록 */
const TONE_ON: Record<TodoTone, string> = {
  urgent: "border-signal-red bg-[#fdf3f0]",
  warn: "border-signal-amber bg-[#fbf6ea]",
  action: "border-forest-600 bg-forest-50",
  quiet: "border-ink-300 bg-cream-50",
};

const TONE_NUM: Record<TodoTone, string> = {
  urgent: "text-signal-red",
  warn: "text-signal-amber",
  action: "text-forest-700",
  quiet: "text-ink-800",
};

function TodoTile({ item }: { item: TodoItem }) {
  const has = item.count > 0;
  return (
    <Link
      href={item.href}
      className={`group flex flex-col justify-between gap-3 border p-4 transition-colors ${
        has ? TONE_ON[item.tone] : "border-ink-200 bg-cream-50"
      } hover:border-forest-600`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-medium text-ink-700">{item.label}</span>
        <ArrowUpRight
          size={15}
          strokeWidth={1.5}
          aria-hidden
          className="mt-0.5 shrink-0 text-ink-300 transition-colors group-hover:text-forest-600"
        />
      </div>
      <p className={`krw text-2xl font-semibold ${has ? TONE_NUM[item.tone] : "text-ink-300"}`}>
        {has ? `${item.count.toLocaleString("ko-KR")}건` : "없음"}
      </p>
      <p className="text-[11px] leading-relaxed text-ink-400">{item.hint}</p>
    </Link>
  );
}

export default function TodoBoard({ items }: { items: TodoItem[] }) {
  const total = items.reduce((acc, i) => acc + i.count, 0);

  return (
    <section aria-labelledby="todo-heading" className="border border-ink-200 bg-cream-100 p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="todo-heading" className="headline-serif text-lg text-ink-900">
          오늘 처리할 일
        </h2>
        <p className="text-xs text-ink-500">
          {total > 0
            ? `모두 ${total.toLocaleString("ko-KR")}건이 기다리고 있습니다. 칸을 누르면 해당 화면으로 갑니다.`
            : "지금 처리할 일이 없습니다. 새 주문이나 문의가 들어오면 여기에 표시됩니다."}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <TodoTile key={item.label} item={item} />
        ))}
      </div>
    </section>
  );
}
