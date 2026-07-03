"use client";

export interface TabItem {
  key: string;
  label: string;
  count?: number;
}

export interface TabsProps {
  tabs: TabItem[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}

/** 언더라인 탭 — 활성 탭 아래 forest 인디케이터 */
export default function Tabs({ tabs, active, onChange, className = "" }: TabsProps) {
  return (
    <div
      role="tablist"
      className={`flex gap-6 overflow-x-auto border-b border-ink-200 ${className}`}
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
            className={`relative shrink-0 pb-3 pt-1 text-sm transition-colors ${
              isActive ? "font-semibold text-ink-900" : "text-ink-400 hover:text-ink-700"
            }`}
          >
            {tab.label}
            {typeof tab.count === "number" && (
              <span
                className={`ml-1.5 text-xs krw ${isActive ? "text-forest-700" : "text-ink-300"}`}
              >
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
  );
}
