"use client";

/* ============================================================
   건수 안내 + 정렬 + 페이지당 개수.

   건수 문구를 조건에 따라 바꾸는 이유: 예전에는 필터를 걸어도 늘 "전체 N개 상품"
   이라고 적혀 있었다. 카테고리를 좁히면 같은 자리에 "전체 3개 상품"이 떠서,
   비개발자는 상품이 사라졌다고 오해하거나 그 숫자를 카탈로그 총량으로 보고했다.
   ============================================================ */

import { Select } from "@/components/admin/Field";
import { krw } from "@/lib/format";
import { SORT_KEYS, SORT_LABELS, type SortDir, type SortKey } from "./list-types";

const PAGE_SIZE_OPTIONS = [20, 50, 100];

export interface ListMetaBarProps {
  total: number;
  rangeStart: number;
  rangeEnd: number;
  hasFilter: boolean;
  /** 이 페이지를 전부 선택했는데 뒤에 더 남아 있을 때 안내를 띄운다 */
  pageFullySelected: boolean;
  pageRowCount: number;
  sort: SortKey;
  dir: SortDir;
  onSortChange: (sort: SortKey, dir: SortDir) => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
}

export default function ListMetaBar({
  total,
  rangeStart,
  rangeEnd,
  hasFilter,
  pageFullySelected,
  pageRowCount,
  sort,
  dir,
  onSortChange,
  pageSize,
  onPageSizeChange,
}: ListMetaBarProps) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs leading-relaxed text-ink-400">
        {hasFilter ? "조건에 맞는 상품 " : "전체 "}
        <span className="krw font-medium text-ink-600">{krw(total)}</span>개
        {total > 0 && (
          <span className="krw ml-1">
            · {krw(rangeStart)}–{krw(rangeEnd)}번째 표시 중
          </span>
        )}
        {pageFullySelected && total > pageRowCount && (
          <span className="ml-2 text-ink-500">
            이 페이지 {pageRowCount}개를 모두 골랐습니다. 더 많이 한 번에 다루려면 오른쪽에서
            100개씩 보기로 바꿔 주세요.
          </span>
        )}
      </p>

      <div className="flex items-center gap-2">
        <Select
          aria-label="정렬 기준"
          value={`${sort}:${dir}`}
          onChange={(e) => {
            const [nextSort, nextDir] = e.target.value.split(":") as [SortKey, SortDir];
            onSortChange(nextSort, nextDir);
          }}
          className="w-44 [&_select]:py-1.5 [&_select]:text-xs"
        >
          {SORT_KEYS.flatMap((key) =>
            (["asc", "desc"] as SortDir[]).map((d) => (
              <option key={`${key}:${d}`} value={`${key}:${d}`}>
                {SORT_LABELS[key]} {d === "asc" ? "오름차순" : "내림차순"}
              </option>
            ))
          )}
        </Select>
        <Select
          aria-label="한 페이지에 보여줄 개수"
          value={String(pageSize)}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="w-32 [&_select]:py-1.5 [&_select]:text-xs"
        >
          {PAGE_SIZE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}개씩 보기
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
