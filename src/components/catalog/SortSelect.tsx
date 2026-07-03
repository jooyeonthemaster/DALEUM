"use client";

import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";

export type SortKey = "latest" | "price_asc" | "price_desc" | "popular";

export const SORT_LABELS: Record<SortKey, string> = {
  latest: "최신순",
  popular: "인기순",
  price_asc: "낮은 가격순",
  price_desc: "높은 가격순",
};

const SORT_ORDER: SortKey[] = ["latest", "popular", "price_asc", "price_desc"];

export function parseSortKey(value: unknown): SortKey {
  return typeof value === "string" && SORT_ORDER.includes(value as SortKey)
    ? (value as SortKey)
    : "latest";
}

export interface SortSelectProps {
  sort: SortKey;
  /** 현재 카테고리 slug — 정렬 변경 시 유지 */
  category?: string | null;
  /** 기본 /products */
  basePath?: string;
  className?: string;
}

/** 정렬 셀렉트 — URL 쿼리로 정렬 상태를 관리한다 */
export default function SortSelect({
  sort,
  category = null,
  basePath = "/products",
  className = "",
}: SortSelectProps) {
  const router = useRouter();

  function handleChange(next: string) {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (next !== "latest") params.set("sort", next);
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  return (
    <span className={`relative inline-flex items-center ${className}`}>
      <select
        value={sort}
        onChange={(e) => handleChange(e.target.value)}
        aria-label="정렬 기준"
        className="cursor-pointer appearance-none bg-transparent pr-5 text-[13px] text-ink-700 outline-none transition-colors hover:text-ink-900"
      >
        {SORT_ORDER.map((key) => (
          <option key={key} value={key}>
            {SORT_LABELS[key]}
          </option>
        ))}
      </select>
      <ChevronDown
        size={14}
        strokeWidth={1.5}
        className="pointer-events-none absolute right-0 text-ink-400"
      />
    </span>
  );
}
