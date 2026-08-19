"use client";

/* ============================================================
   상세·영양 탭을 나누는 접이식 구역.

   왜 필요한가:
   이 탭 하나에 상세페이지·브랜드 스토리·영양·스펙이 전부 세로로 쌓여 있었다.
   영양 12줄 + 스펙 22줄짜리 상품에서는 화면이 스크롤 다섯 번 길이가 되고,
   지금 무엇을 고치는 중인지 알 수 없다.
   그래서 구역마다 접을 수 있게 하고, 접혀 있어도 '무엇이 몇 개 들었는지'와
   '이 내용이 고객 화면 어디에 실리는지'는 항상 보이게 했다.
   ============================================================ */

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export interface EditorSectionProps {
  title: string;
  /** 이 구역이 고객 화면 어디에 실리는지 한 줄로 */
  description: string;
  /** 접혀 있을 때도 보이는 요약 (예: 이미지 5장) */
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

export default function EditorSection({
  title,
  description,
  summary,
  defaultOpen = true,
  children,
}: EditorSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="border-b border-ink-100 py-5 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group flex w-full items-start gap-2.5 text-left"
      >
        <ChevronDown
          size={16}
          strokeWidth={1.5}
          aria-hidden
          className={`mt-0.5 shrink-0 text-ink-400 transition-transform duration-200 group-hover:text-forest-700 ${
            open ? "" : "-rotate-90"
          }`}
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2.5">
            <span className="text-[15px] font-semibold text-ink-900">{title}</span>
            {summary && <span className="text-xs text-ink-400">{summary}</span>}
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-ink-500">{description}</span>
        </span>
      </button>

      {open && <div className="mt-4">{children}</div>}
    </section>
  );
}
