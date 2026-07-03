"use client";

import type { ReactNode } from "react";

export interface DataTableColumn<T> {
  /** row의 프로퍼티 키 (render 없을 때 row[key]를 문자열로 출력) */
  key: string;
  label: string;
  /** ex) "120px" | "18%" — colgroup에 적용 */
  width?: string;
  align?: "left" | "center" | "right";
  render?: (row: T) => ReactNode;
  /** 모바일 카드에서 숨김 (부가 정보 컬럼용) */
  hideOnMobile?: boolean;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  /** 행 key 생성 (기본: row.id → index 폴백) */
  rowKey?: (row: T, index: number) => string | number;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  emptyMessage?: string;
  /** 하단 슬롯 — 보통 <Pagination /> */
  pagination?: ReactNode;
  className?: string;
}

const ALIGN = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
} as const;

function defaultRowKey<T>(row: T, index: number): string | number {
  const id = (row as { id?: string | number }).id;
  return id ?? index;
}

function cellValue<T>(row: T, col: DataTableColumn<T>): ReactNode {
  if (col.render) return col.render(row);
  const v = (row as Record<string, unknown>)[col.key];
  if (v === null || v === undefined || v === "") {
    return <span className="text-ink-300">—</span>;
  }
  return String(v);
}

/**
 * 제네릭 데이터 테이블 — 데스크톱은 테이블, 모바일(<md)은 카드 리스트로 렌더.
 * 모바일 카드는 첫 번째 컬럼을 제목으로, 나머지를 라벨/값 쌍으로 표시한다.
 */
export default function DataTable<T>({
  columns,
  rows,
  rowKey = defaultRowKey,
  onRowClick,
  loading = false,
  emptyMessage = "표시할 항목이 없습니다.",
  pagination,
  className = "",
}: DataTableProps<T>) {
  const mobileColumns = columns.filter((c) => !c.hideOnMobile);
  const clickable = Boolean(onRowClick);

  return (
    <div className={className}>
      {/* ---------- 데스크톱 테이블 ---------- */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse">
          {columns.some((c) => c.width) && (
            <colgroup>
              {columns.map((c) => (
                <col key={c.key} style={c.width ? { width: c.width } : undefined} />
              ))}
            </colgroup>
          )}
          <thead>
            <tr className="hairline-b">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={`label-caps whitespace-nowrap px-4 py-3 text-ink-400 ${ALIGN[c.align ?? "left"]}`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={`skeleton-${i}`} className="border-b border-ink-100">
                    {columns.map((c) => (
                      <td key={c.key} className="px-4 py-4">
                        <div className="h-4 w-3/4 animate-pulse bg-cream-100" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row, i) => (
                  <tr
                    key={rowKey(row, i)}
                    onClick={clickable ? () => onRowClick?.(row) : undefined}
                    className={`border-b border-ink-100 transition-colors ${
                      clickable ? "cursor-pointer hover:bg-cream-100" : ""
                    }`}
                  >
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={`px-4 py-3.5 text-sm text-ink-900 ${ALIGN[c.align ?? "left"]}`}
                      >
                        {cellValue(row, c)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>

        {!loading && rows.length === 0 && (
          <div className="py-20 text-center hairline-b">
            <p className="headline-serif text-lg text-ink-500">{emptyMessage}</p>
          </div>
        )}
      </div>

      {/* ---------- 모바일 카드 리스트 ---------- */}
      <div className="md:hidden">
        {loading ? (
          <ul className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={`skeleton-m-${i}`} className="border border-ink-200 p-4">
                <div className="h-4 w-1/2 animate-pulse bg-cream-100" />
                <div className="mt-3 h-3 w-3/4 animate-pulse bg-cream-100" />
                <div className="mt-2 h-3 w-2/3 animate-pulse bg-cream-100" />
              </li>
            ))}
          </ul>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center hairline-t hairline-b">
            <p className="headline-serif text-lg text-ink-500">{emptyMessage}</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map((row, i) => {
              const [first, ...rest] = mobileColumns;
              return (
                <li
                  key={rowKey(row, i)}
                  onClick={clickable ? () => onRowClick?.(row) : undefined}
                  className={`border border-ink-200 bg-cream-50 p-4 transition-colors ${
                    clickable ? "cursor-pointer active:bg-cream-100" : ""
                  }`}
                >
                  {first && (
                    <div className="text-sm font-semibold text-ink-900">
                      {cellValue(row, first)}
                    </div>
                  )}
                  {rest.length > 0 && (
                    <dl className="mt-3 space-y-1.5">
                      {rest.map((c) => (
                        <div key={c.key} className="flex items-baseline justify-between gap-4">
                          <dt className="shrink-0 text-xs text-ink-400">{c.label}</dt>
                          <dd className="min-w-0 text-right text-sm text-ink-700 [overflow-wrap:anywhere]">
                            {cellValue(row, c)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {pagination && <div className="mt-6">{pagination}</div>}
    </div>
  );
}
