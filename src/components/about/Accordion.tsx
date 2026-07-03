"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export interface AccordionItem {
  id: string;
  /** 좌측 label-caps 뱃지 — 예: "고정", "배송", "보관" */
  overline?: string;
  title: string;
  /** 우측 보조 정보 — 날짜 등 (모바일에서는 패널 안에 표시) */
  meta?: string;
  content: ReactNode;
}

export interface AccordionProps {
  items: AccordionItem[];
  /** 처음부터 열어둘 항목 id */
  defaultOpenId?: string | null;
  className?: string;
}

/**
 * 헤어라인 아코디언 — 한 번에 하나만 열리며, 높이는 부드럽게 전환된다.
 * grid-template-rows 트릭으로 콘텐츠 높이에 상관없이 자연스럽게 열리고 닫힌다.
 */
export default function Accordion({
  items,
  defaultOpenId = null,
  className = "",
}: AccordionProps) {
  const [openId, setOpenId] = useState<string | null>(defaultOpenId);
  const hasOverline = items.some((item) => item.overline);

  return (
    <ul className={`hairline-t ${className}`}>
      {items.map((item) => {
        const open = openId === item.id;
        return (
          <li key={item.id} className="hairline-b">
            <button
              type="button"
              onClick={() => setOpenId(open ? null : item.id)}
              aria-expanded={open}
              aria-controls={`accordion-panel-${item.id}`}
              className="group flex w-full items-baseline gap-4 py-6 text-left md:gap-6 md:py-7"
            >
              {hasOverline && (
                <span className="label-caps w-12 shrink-0 text-forest-600 md:w-16">
                  {item.overline ?? ""}
                </span>
              )}
              <span
                className={`flex-1 text-[15px] leading-relaxed transition-colors duration-300 md:text-base ${
                  open
                    ? "text-forest-700"
                    : "text-ink-900 group-hover:text-forest-700"
                }`}
              >
                {item.title}
              </span>
              {item.meta && (
                <span className="krw hidden shrink-0 text-xs text-ink-400 sm:block">
                  {item.meta}
                </span>
              )}
              <ChevronDown
                size={18}
                strokeWidth={1.5}
                aria-hidden
                className={`shrink-0 self-center text-ink-400 transition-transform duration-500 ease-hall ${
                  open ? "rotate-180" : ""
                }`}
              />
            </button>

            <div
              id={`accordion-panel-${item.id}`}
              role="region"
              className={`grid transition-[grid-template-rows] duration-500 ease-hall ${
                open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="overflow-hidden">
                <div
                  className={`max-w-3xl pb-8 text-sm leading-loose text-ink-600 ${
                    hasOverline ? "md:pl-[5.5rem]" : ""
                  }`}
                >
                  {item.meta && (
                    <p className="krw mb-3 text-xs text-ink-400 sm:hidden">
                      {item.meta}
                    </p>
                  )}
                  {item.content}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
