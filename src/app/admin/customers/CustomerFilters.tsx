"use client";

/* ============================================================
   고객 목록 조건 막대 — 검색 / 정렬 / VIP·마케팅 / 누적구매액 하한 / 명단 내보내기

   왜 하한을 숫자 입력이 아니라 고르기로 했나:
   "30만원 이상 고객" 을 뽑는 일이 실제 목적인데, 숫자 칸을 주면 300000 을 쳐야 하고
   0 하나 빠뜨리면 조용히 엉뚱한 명단이 나온다. 자주 쓰는 구간을 미리 적어 둔다.
   ============================================================ */

import { Select } from "@/components/admin/Field";
import SearchInput from "@/components/admin/SearchInput";
import { won } from "@/lib/admin-labels";
import type { CustomerListQuery } from "./customer-query";

export const SORT_OPTIONS = [
  { value: "recent", label: "최근 가입순" },
  { value: "oldest", label: "오래된 가입순" },
  { value: "name", label: "이름순" },
  { value: "spend", label: "누적구매액 많은순" },
  { value: "orders", label: "주문 많은순" },
];

/** 자주 쓰는 누적구매액 구간 */
export const SPENT_STEPS = [0, 100_000, 300_000, 500_000, 1_000_000];

export interface CustomerFiltersProps {
  query: CustomerListQuery;
  onChange: (next: Partial<CustomerListQuery>) => void;
  searchInput: string;
  onSearchInput: (value: string) => void;
  onSearchSubmit: () => void;
  onExport: () => void;
  exporting: boolean;
  totalLabel: string;
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`whitespace-nowrap border px-3 py-2 text-[13px] transition-colors ${
        active
          ? "border-forest-700 bg-forest-100 text-forest-800"
          : "border-ink-200 bg-cream-50 text-ink-600 hover:border-ink-400"
      }`}
    >
      {children}
    </button>
  );
}

export default function CustomerFilters({
  query,
  onChange,
  searchInput,
  onSearchInput,
  onSearchSubmit,
  onExport,
  exporting,
  totalLabel,
}: CustomerFiltersProps) {
  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          value={searchInput}
          onChange={onSearchInput}
          onSubmit={onSearchSubmit}
          placeholder="이름 / 이메일 / 연락처 검색"
          className="sm:max-w-80"
        />
        <div className="flex items-center gap-3">
          <Select
            value={query.sort}
            onChange={(e) => onChange({ sort: e.target.value })}
            className="w-44"
            aria-label="정렬 기준"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <button
            type="button"
            onClick={onExport}
            disabled={exporting}
            className="whitespace-nowrap border border-ink-200 px-4 py-2.5 text-sm text-ink-700 transition-colors hover:border-ink-400 disabled:text-ink-300"
          >
            {exporting ? "만드는 중…" : "명단 내려받기"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Chip active={query.vipOnly} onClick={() => onChange({ vipOnly: !query.vipOnly })}>
          VIP 고객만
        </Chip>
        <Chip
          active={query.marketingOnly}
          onClick={() => onChange({ marketingOnly: !query.marketingOnly })}
        >
          마케팅 수신 동의만
        </Chip>
        <Select
          value={String(query.minSpent)}
          onChange={(e) => onChange({ minSpent: Number(e.target.value) })}
          className="w-48"
          aria-label="누적구매액 조건"
        >
          {SPENT_STEPS.map((v) => (
            <option key={v} value={v}>
              {v === 0 ? "누적구매액 조건 없음" : `${won(v)} 이상 구매`}
            </option>
          ))}
        </Select>
        <span className="krw ml-auto whitespace-nowrap text-sm text-ink-400">{totalLabel}</span>
      </div>
    </div>
  );
}
