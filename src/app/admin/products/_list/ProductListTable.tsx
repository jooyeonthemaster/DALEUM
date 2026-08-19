"use client";

/* ============================================================
   상품 목록 표.

   공용 DataTable 을 쓰지 않고 따로 만든 이유:
   이 화면에는 행 선택(체크박스)·정렬 가능한 머리글·행마다 붙는 경고 배지·행 단위
   실패 안내가 모두 필요한데, 공용 DataTable 에는 그 개념이 없다. 공용 프리미티브는
   다른 관리자 화면 여러 곳이 함께 쓰고 있어 이번에 손대지 않기로 했다.

   행 전체를 클릭 영역으로 쓰지 않는다 — 상태 드롭다운 옆 여백만 잘못 눌러도 페이지가
   튀어 보고 있던 조건을 잃는 사고가 있었다. 대신 사진과 상품명을 링크로 만들어
   키보드로도 갈 수 있게 했다.
   ============================================================ */

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { formatDate } from "@/lib/format";
import type { ProductStatus } from "@/lib/types";
import { PriceCell, ProductCell, StatusCell, StockCell } from "./ProductListCells";
import type { ProductListRow, SortDir, SortKey } from "./list-types";

export interface ProductListTableProps {
  rows: ProductListRow[];
  loading: boolean;
  selectedIds: Set<string>;
  busyIds: Set<string>;
  /** 행 단위 상태 변경 실패 메시지 (상품 id → 사람이 읽는 이유) */
  rowErrors: Record<string, string>;
  sort: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  onToggle: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  onStatusChange: (row: ProductListRow, next: ProductStatus) => void;
  emptyMessage: React.ReactNode;
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronsUpDown size={12} strokeWidth={1.5} className="text-ink-300" />;
  return dir === "asc" ? (
    <ArrowUp size={12} strokeWidth={2} />
  ) : (
    <ArrowDown size={12} strokeWidth={2} />
  );
}

export default function ProductListTable({
  rows,
  loading,
  selectedIds,
  busyIds,
  rowErrors,
  sort,
  dir,
  onSort,
  onToggle,
  onToggleAll,
  onStatusChange,
  emptyMessage,
}: ProductListTableProps) {
  const selectedOnPage = rows.filter((r) => selectedIds.has(r.id)).length;
  const allChecked = rows.length > 0 && selectedOnPage === rows.length;
  const someChecked = selectedOnPage > 0 && !allChecked;

  const headButton = (key: SortKey, label: string, align: "left" | "right" = "left") => (
    <button
      type="button"
      onClick={() => onSort(key)}
      className={`inline-flex items-center gap-1 text-ink-400 transition-colors hover:text-ink-900 ${
        align === "right" ? "flex-row-reverse" : ""
      }`}
    >
      {label}
      <SortIcon active={sort === key} dir={dir} />
    </button>
  );

  const sortState = (key: SortKey) =>
    sort === key ? (dir === "asc" ? "ascending" : "descending") : "none";

  return (
    <div>
      {/* ---------- 데스크톱 표 ---------- */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse">
          <colgroup>
            <col style={{ width: "44px" }} />
            <col />
            <col style={{ width: "118px" }} />
            <col style={{ width: "180px" }} />
            <col style={{ width: "108px" }} />
            <col style={{ width: "150px" }} />
            <col style={{ width: "104px" }} />
          </colgroup>
          <thead>
            <tr className="hairline-b">
              <th scope="col" className="px-3 py-3">
                <input
                  type="checkbox"
                  aria-label="이 페이지의 상품 모두 선택"
                  checked={allChecked}
                  ref={(el) => {
                    // 일부만 선택된 상태를 네모칸에 보여 주려면 DOM 속성을 직접 켜야 한다
                    if (el) el.indeterminate = someChecked;
                  }}
                  onChange={(e) => onToggleAll(e.target.checked)}
                  className="h-4 w-4 accent-forest-700"
                />
              </th>
              <th
                scope="col"
                aria-sort={sortState("name")}
                className="label-caps px-4 py-3 text-left"
              >
                {headButton("name", "상품")}
              </th>
              <th scope="col" className="label-caps px-4 py-3 text-left text-ink-400">
                카테고리
              </th>
              <th
                scope="col"
                aria-sort={sortState("price")}
                className="label-caps px-4 py-3 text-right"
              >
                {headButton("price", "가격", "right")}
              </th>
              {/* 재고는 정렬을 걸지 않는다 — 이 칸은 옵션이 있으면 옵션 재고 합계를
                  그리는데 서버 정렬은 상품 행의 재고만 볼 수 있어 둘이 어긋났다.
                  자세한 사정은 list-types.ts SORT_LABELS 주석에 적어 두었다. */}
              <th
                scope="col"
                title="옵션이 있는 상품은 옵션 재고를 모두 더해 보여 줍니다"
                className="label-caps px-4 py-3 text-right text-ink-400"
              >
                재고
              </th>
              <th scope="col" className="label-caps px-4 py-3 text-center text-ink-400">
                상태
              </th>
              <th
                scope="col"
                aria-sort={sortState("created_at")}
                className="label-caps px-4 py-3 text-left"
              >
                {headButton("created_at", "등록일")}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={`skeleton-${i}`} className="border-b border-ink-100">
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="px-4 py-4">
                        <div className="h-4 w-3/4 animate-pulse bg-cream-100" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row) => (
                  <tr
                    key={row.id}
                    className={`border-b border-ink-100 transition-colors ${
                      selectedIds.has(row.id) ? "bg-forest-50" : "hover:bg-cream-100"
                    }`}
                  >
                    <td className="px-3 py-3.5 align-top">
                      <input
                        type="checkbox"
                        aria-label={`${row.name} 선택`}
                        checked={selectedIds.has(row.id)}
                        onChange={() => onToggle(row.id)}
                        className="mt-1 h-4 w-4 accent-forest-700"
                      />
                    </td>
                    <td className="px-4 py-3.5 text-sm">
                      <ProductCell row={row} />
                    </td>
                    <td className="px-4 py-3.5 text-sm text-ink-900">
                      {row.categories?.name ?? <span className="text-ink-300">미분류</span>}
                    </td>
                    <td className="px-4 py-3.5 text-right text-sm">
                      <PriceCell row={row} />
                    </td>
                    <td className="px-4 py-3.5 text-right text-sm">
                      <StockCell row={row} />
                    </td>
                    <td className="px-4 py-3.5 text-center text-sm">
                      <StatusCell
                        row={row}
                        busy={busyIds.has(row.id)}
                        error={rowErrors[row.id]}
                        onStatusChange={onStatusChange}
                      />
                    </td>
                    <td className="px-4 py-3.5 text-sm leading-tight text-ink-600">
                      {formatDate(row.created_at)}
                      <span className="mt-0.5 block text-[11px] text-ink-400">
                        진열 {row.sort_order}
                      </span>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>

        {!loading && rows.length === 0 && (
          <div className="py-20 text-center hairline-b">{emptyMessage}</div>
        )}
      </div>

      {/* ---------- 모바일 카드 ----------
          카테고리·등록일·진열 순서를 숨기지 않는다. 예전에는 이 셋이 통째로 빠져
          휴대폰에서는 "이 상품 무슨 분류였지"를 확인할 수 없었다. */}
      <div className="md:hidden">
        {loading ? (
          <ul className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={`skeleton-m-${i}`} className="border border-ink-200 p-4">
                <div className="h-4 w-1/2 animate-pulse bg-cream-100" />
                <div className="mt-3 h-3 w-3/4 animate-pulse bg-cream-100" />
              </li>
            ))}
          </ul>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center hairline-t hairline-b">{emptyMessage}</div>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <li
                key={row.id}
                className={`border p-4 ${
                  selectedIds.has(row.id)
                    ? "border-forest-600/50 bg-forest-50"
                    : "border-ink-200 bg-cream-50"
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    aria-label={`${row.name} 선택`}
                    checked={selectedIds.has(row.id)}
                    onChange={() => onToggle(row.id)}
                    className="mt-1 h-4 w-4 shrink-0 accent-forest-700"
                  />
                  <div className="min-w-0 flex-1">
                    <ProductCell row={row} />
                    <p className="mt-2 text-xs text-ink-400">
                      {row.categories?.name ?? "미분류"} · {formatDate(row.created_at)} · 진열{" "}
                      {row.sort_order}
                    </p>
                    <div className="mt-2 flex items-end justify-between gap-3">
                      <PriceCell row={row} />
                      <div className="text-right text-sm">
                        <StockCell row={row} />
                      </div>
                    </div>
                    <div className="mt-3">
                      <StatusCell
                        row={row}
                        busy={busyIds.has(row.id)}
                        error={rowErrors[row.id]}
                        onStatusChange={onStatusChange}
                      />
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
