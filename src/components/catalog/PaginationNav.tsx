import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

export interface PaginationNavProps {
  page: number;
  totalPages: number;
  /** 예: "/products", "/search" */
  basePath: string;
  /** page 외에 유지할 쿼리 (값이 없으면 생략됨) */
  query?: Record<string, string | undefined>;
  className?: string;
}

function hrefOf(basePath: string, query: Record<string, string | undefined>, page: number): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/** 1 … 4 5 6 … 20 윈도우 */
function pageWindow(page: number, total: number): (number | "gap")[] {
  const wanted = new Set<number>();
  for (const p of [1, total, page - 1, page, page + 1]) {
    if (p >= 1 && p <= total) wanted.add(p);
  }
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) out.push("gap");
    out.push(p);
    prev = p;
  }
  return out;
}

/** 우아한 숫자 페이지네이션 — 서버 컴포넌트 (링크 기반) */
export default function PaginationNav({
  page,
  totalPages,
  basePath,
  query = {},
  className = "",
}: PaginationNavProps) {
  if (totalPages <= 1) return null;

  const items = pageWindow(page, totalPages);
  const arrowClass =
    "flex h-11 w-11 items-center justify-center text-ink-600 transition-colors hover:text-ink-900";
  const arrowDisabled =
    "flex h-11 w-11 items-center justify-center text-ink-200";

  return (
    <nav
      aria-label="페이지"
      className={`flex items-center justify-center gap-1 ${className}`}
    >
      {page > 1 ? (
        <Link href={hrefOf(basePath, query, page - 1)} aria-label="이전 페이지" className={arrowClass}>
          <ArrowLeft size={16} strokeWidth={1.5} />
        </Link>
      ) : (
        <span aria-hidden className={arrowDisabled}>
          <ArrowLeft size={16} strokeWidth={1.5} />
        </span>
      )}

      <ul className="mx-2 flex items-center gap-1">
        {items.map((item, i) =>
          item === "gap" ? (
            <li key={`gap-${i}`} aria-hidden className="px-1 text-ink-300">
              &hellip;
            </li>
          ) : (
            <li key={item}>
              {item === page ? (
                <span
                  aria-current="page"
                  className="krw flex h-11 w-11 items-center justify-center border-b border-ink-900 text-sm font-medium text-ink-900"
                >
                  {item}
                </span>
              ) : (
                <Link
                  href={hrefOf(basePath, query, item)}
                  className="krw flex h-11 w-11 items-center justify-center text-sm text-ink-400 transition-colors hover:text-ink-900"
                >
                  {item}
                </Link>
              )}
            </li>
          )
        )}
      </ul>

      {page < totalPages ? (
        <Link href={hrefOf(basePath, query, page + 1)} aria-label="다음 페이지" className={arrowClass}>
          <ArrowRight size={16} strokeWidth={1.5} />
        </Link>
      ) : (
        <span aria-hidden className={arrowDisabled}>
          <ArrowRight size={16} strokeWidth={1.5} />
        </span>
      )}
    </nav>
  );
}
