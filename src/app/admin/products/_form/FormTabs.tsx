"use client";

/* ============================================================
   상품 폼 전용 탭 — 개수 옆에 '문제 있음' 을 함께 보여 준다.

   공용 Tabs(components/admin/Tabs.tsx)는 개수 숫자만 그릴 수 있다. 그래서 저장이 막혀도
   어느 탭에 문제가 있는지 화면에 아무 표시가 없었다. 옵션명 하나를 빠뜨리면 기본 정보 탭에서
   빨간 문구 한 줄만 보고 네 탭을 하나씩 열어 봐야 했다.

   공용 프리미티브는 이번 작업에서 건드리지 않기로 했으므로, 상품 폼이 쓰는 탭만 여기 따로 둔다.
   ============================================================ */

import type { FormTabKey } from "./validate";

export interface FormTabItem {
  key: FormTabKey;
  label: string;
  count?: number;
  /** 이 탭에서 저장을 막고 있는 문제 개수 */
  errors?: number;
}

export interface FormTabsProps {
  tabs: FormTabItem[];
  active: FormTabKey;
  onChange: (key: FormTabKey) => void;
  className?: string;
}

export default function FormTabs({ tabs, active, onChange, className = "" }: FormTabsProps) {
  return (
    <div
      role="tablist"
      className={`flex gap-6 overflow-x-auto border-b border-ink-200 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        const errors = tab.errors ?? 0;
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
            {errors > 0 && (
              <span
                className="krw ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-signal-red px-1 text-[10px] font-semibold text-cream-50"
                // 색만으로 알리면 색을 구분하기 어려운 사람에게는 아무 정보도 아니다 — 글로도 말해 준다.
                aria-label={`고쳐야 할 곳 ${errors}군데`}
              >
                {errors}
              </span>
            )}
            {isActive && (
              <span aria-hidden className="absolute inset-x-0 -bottom-px h-0.5 bg-forest-700" />
            )}
          </button>
        );
      })}
    </div>
  );
}
