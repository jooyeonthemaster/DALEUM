"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

export interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  className?: string;
}

/** 1 … 4 5 6 … 20 형태의 페이지 목록 생성 */
function buildPages(page: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const anchors = [...new Set([1, total, page - 1, page, page + 1])]
    .filter((n) => n >= 1 && n <= total)
    .sort((a, b) => a - b);

  const out: (number | "ellipsis")[] = [];
  anchors.forEach((n, i) => {
    if (i > 0) {
      const prev = anchors[i - 1];
      if (n - prev === 2) out.push(prev + 1);
      else if (n - prev > 2) out.push("ellipsis");
    }
    out.push(n);
  });
  return out;
}

export default function Pagination({ page, totalPages, onChange, className = "" }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = buildPages(page, totalPages);

  return (
    <nav aria-label="페이지 이동" className={`flex items-center justify-center gap-1 ${className}`}>
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="이전 페이지"
        className="flex h-10 w-10 items-center justify-center text-ink-600 transition-colors hover:bg-cream-100 disabled:pointer-events-none disabled:opacity-30 sm:h-8 sm:w-8"
      >
        <ChevronLeft size={16} strokeWidth={1.5} />
      </button>

      {pages.map((p, i) =>
        p === "ellipsis" ? (
          <span
            key={`e-${i}`}
            className="flex h-10 w-10 items-end justify-center pb-1.5 text-ink-300 sm:h-8 sm:w-8"
          >
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-label={`${p}페이지`}
            aria-current={p === page ? "page" : undefined}
            className={`h-10 w-10 text-sm krw transition-colors sm:h-8 sm:w-8 ${
              p === page
                ? "bg-forest-800 font-semibold text-cream-50"
                : "text-ink-600 hover:bg-cream-100"
            }`}
          >
            {p}
          </button>
        )
      )}

      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="다음 페이지"
        className="flex h-10 w-10 items-center justify-center text-ink-600 transition-colors hover:bg-cream-100 disabled:pointer-events-none disabled:opacity-30 sm:h-8 sm:w-8"
      >
        <ChevronRight size={16} strokeWidth={1.5} />
      </button>
    </nav>
  );
}
