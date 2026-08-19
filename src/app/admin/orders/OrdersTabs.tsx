"use client";

import { useCallback, useRef, useState } from "react";

/* ============================================================
   주문 상태 탭 — 옆으로 더 있다는 것을 보이게 한 판

   왜 공용 Tabs 를 그대로 쓰지 않는가:
   공용 탭은 가로 스크롤은 되지만 스크롤바를 완전히 감춘다. 그래서 390px 화면에서는
   '취소·환불' 탭이 오른쪽 끝에서 잘린 채 아무 힌트도 없이 사라졌다. 외근 중 휴대폰으로
   "취소된 주문 확인해 줘" 를 받으면 그 기능이 아예 없는 줄 알게 된다.
   공용 프리미티브는 이번 파도에서 손대지 않기로 했으므로, 주문 화면용으로 여기에 둔다.
   (Tabs 프리미티브 차원의 수정은 감독에게 보고했다 — 다른 화면에서도 같은 일이 난다)
   ============================================================ */

export interface OrdersTabItem {
  key: string;
  label: string;
  count?: number;
}

interface Props {
  tabs: OrdersTabItem[];
  active: string;
  onChange: (key: string) => void;
}

export default function OrdersTabs({ tabs, active, onChange }: Props) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const [more, setMore] = useState(false);

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    // 1px 여유 — 소수점 폭에서 끝까지 갔는데도 페이드가 남는 것을 막는다
    setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  // ref 콜백에서 관찰을 시작한다 (렌더 중 DOM 을 읽지 않기 위해)
  const attach = useCallback(
    (el: HTMLDivElement | null) => {
      scroller.current = el;
      if (!el) return;
      const observer = new ResizeObserver(measure);
      observer.observe(el);
      measure();
      return () => observer.disconnect();
    },
    [measure]
  );

  return (
    <div className="relative mb-5">
      <div
        ref={attach}
        onScroll={measure}
        role="tablist"
        className="flex gap-6 overflow-x-auto border-b border-ink-200 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab) => {
          const isActive = tab.key === active;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab.key)}
              className={`relative shrink-0 pb-3 pt-2 text-sm transition-colors ${
                isActive ? "font-semibold text-ink-900" : "text-ink-400 hover:text-ink-700"
              }`}
            >
              {tab.label}
              {typeof tab.count === "number" && (
                <span className={`krw ml-1.5 text-xs ${isActive ? "text-forest-700" : "text-ink-300"}`}>
                  {tab.count}
                </span>
              )}
              {isActive && (
                <span aria-hidden className="absolute inset-x-0 -bottom-px h-0.5 bg-forest-700" />
              )}
            </button>
          );
        })}
      </div>

      {/* 오른쪽에 더 있다는 신호 — 끝까지 밀면 사라진다 */}
      {more && (
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-px right-0 top-0 w-12 bg-gradient-to-l from-cream-100 to-transparent"
          />
          <span className="pointer-events-none absolute -top-1 right-0 text-[11px] text-ink-400">
            옆으로 넘겨 보세요 →
          </span>
        </>
      )}
    </div>
  );
}
