"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import DataTable from "@/components/admin/DataTable";
import Pagination from "@/components/admin/Pagination";
import { Toggle } from "@/components/admin/Field";
import { VIP_BASE_PRICE_LABEL, won } from "@/lib/admin-labels";
import { discountRate, formatDate } from "@/lib/format";
import NextStepCard from "./NextStepCard";
import PriceCreateModal from "./PriceCreateModal";
import PriceEditModal from "./PriceEditModal";
import { isBelowCost } from "./PriceMeta";
import {
  api,
  BTN_PRIMARY,
  customerLabel,
  previewRatePrice,
  type GroupRow,
  type PriceRow,
} from "./vipApi";

/* ============================================================
   [상품별 가격] 탭 — vip_product_prices 목록/수정/삭제 + 일괄 등록

   고친 것: 기준 금액을 '정가'라 부르던 것을 '기본 판매가'로 바로잡고,
   원가 아래로 팔리고 있는 행을 눈에 띄게 표시한다.
   ============================================================ */

export interface PricesTabProps {
  groups: GroupRow[];
  /** 그룹을 아직 읽는 중이면 true — 읽기 전에 '그룹이 없다'고 단정하면 안내가 깜빡인다 */
  groupsLoading: boolean;
  onGoToGroups: () => void;
  onChanged: () => void | Promise<void>;
}

const PAGE_SIZE = 20;

/** 목록 행의 적용가 계산 */
function appliedPrice(row: PriceRow): number | null {
  if (row.custom_price != null) return row.custom_price;
  const base = row.products?.price;
  if (base != null && row.discount_rate != null) {
    return previewRatePrice(base, Number(row.discount_rate));
  }
  return null;
}

/** 적용 기간 표시 */
function periodLabel(row: PriceRow): string {
  if (!row.starts_at && !row.ends_at) return "계속 적용";
  const from = row.starts_at ? formatDate(row.starts_at) : "지금";
  const to = row.ends_at ? formatDate(row.ends_at) : "종료 없음";
  return `${from} ~ ${to}`;
}

export default function PricesTab({ groups, groupsLoading, onGoToGroups, onChanged }: PricesTabProps) {
  const [prices, setPrices] = useState<PriceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<PriceRow | null>(null);
  const [deleting, setDeleting] = useState<PriceRow | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ prices: PriceRow[] }>("/api/admin/vip/prices");
      setPrices(data.prices);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "전용 가격 목록을 불러오지 못했습니다.");
      setPrices([]);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function toggleActive(row: PriceRow, next: boolean) {
    setPrices((prev) =>
      prev ? prev.map((p) => (p.id === row.id ? { ...p, is_active: next } : p)) : prev
    );
    try {
      await api(`/api/admin/vip/prices/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: next }),
      });
    } catch {
      setPrices((prev) =>
        prev ? prev.map((p) => (p.id === row.id ? { ...p, is_active: !next } : p)) : prev
      );
      setError("적용 여부를 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  const hasGroup = groups.length > 0;
  // 그룹을 아직 읽는 중일 때는 아무 단정도 하지 않는다(안내가 깜빡이는 것을 막는다)
  const showEmptyState =
    !groupsLoading && (!hasGroup || (prices !== null && prices.length === 0));

  const totalPages = Math.max(1, Math.ceil((prices?.length ?? 0) / PAGE_SIZE));
  const pageRows = useMemo(
    () => (prices ?? []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [prices, page]
  );

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-relaxed text-ink-500">
          특정 그룹이나 고객에게만 적용되는 상품 하나하나의 가격입니다. 여기서 정한 값이 그룹 전체
          할인율보다 우선합니다.
        </p>
        <button
          type="button"
          onClick={() => setCreating(true)}
          disabled={!hasGroup}
          title={hasGroup ? undefined : "먼저 VIP 그룹을 만들어야 합니다"}
          className={`shrink-0 ${BTN_PRIMARY}`}
        >
          가격 등록
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-signal-red">{error}</p>}

      {showEmptyState ? (
        <NextStepCard
          title={hasGroup ? "아직 등록된 전용 가격이 없습니다." : "먼저 VIP 그룹을 만들어야 합니다."}
          description={
            hasGroup
              ? "그룹 전체 할인율만으로 충분하다면 비워 두어도 됩니다. 특정 상품만 더 깎아 주고 싶을 때 등록하세요."
              : "전용 가격은 그룹이나 개별 고객에게 붙습니다. 그룹을 먼저 만들면 여기서 상품별 가격을 정할 수 있습니다."
          }
          actionLabel={hasGroup ? "가격 등록" : "그룹 만들러 가기"}
          onAction={hasGroup ? () => setCreating(true) : onGoToGroups}
        />
      ) : (
        <DataTable<PriceRow>
          columns={[
            {
              key: "target",
              label: "대상",
              width: "180px",
              render: (row) => (
                <div className="min-w-0">
                  <p className="text-xs text-forest-700">{row.group_id ? "그룹" : "고객 한 명"}</p>
                  <p className="truncate text-ink-900">
                    {row.group_id
                      ? (row.vip_groups?.name ?? "삭제된 그룹")
                      : customerLabel(row.profiles)}
                  </p>
                </div>
              ),
            },
            {
              key: "product",
              label: "상품",
              render: (row) => (
                <span className="line-clamp-1 text-ink-900">
                  {row.products?.name ?? "삭제된 상품"}
                </span>
              ),
            },
            {
              key: "price",
              label: `${VIP_BASE_PRICE_LABEL} → 적용가`,
              width: "230px",
              render: (row) => {
                const base = row.products?.price ?? null;
                const applied = appliedPrice(row);
                const below = isBelowCost(applied, row.products?.cost_price ?? null);
                return (
                  <span className="krw">
                    {base != null && <span className="text-ink-400 line-through">{won(base)}</span>}
                    <span className="mx-1 text-ink-300">→</span>
                    {applied != null ? (
                      <span className={below ? "font-semibold text-signal-red" : "font-semibold text-forest-700"}>
                        {won(applied)}
                      </span>
                    ) : (
                      <span className="text-ink-300">—</span>
                    )}
                    {base != null && applied != null && (
                      <span className="ml-1 text-xs text-ink-400">
                        ({discountRate(base, applied)}%)
                      </span>
                    )}
                    {below && (
                      <span className="ml-1 block text-xs text-signal-red">원가보다 낮습니다</span>
                    )}
                  </span>
                );
              },
            },
            {
              key: "period",
              label: "기간",
              width: "190px",
              hideOnMobile: true,
              render: (row) => <span className="krw text-ink-600">{periodLabel(row)}</span>,
            },
            {
              key: "is_active",
              label: "적용",
              width: "90px",
              align: "center",
              render: (row) => (
                <Toggle checked={row.is_active} onChange={(next) => toggleActive(row, next)} />
              ),
            },
            {
              key: "actions",
              label: "관리",
              width: "120px",
              align: "right",
              render: (row) => (
                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setEditing(row)}
                    className="text-sm text-ink-600 transition-colors hover:text-forest-700"
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(row)}
                    className="text-sm text-ink-600 transition-colors hover:text-signal-red"
                  >
                    삭제
                  </button>
                </div>
              ),
            },
          ]}
          rows={pageRows}
          loading={prices === null}
          emptyMessage="아직 등록된 전용 가격이 없습니다."
          pagination={<Pagination page={page} totalPages={totalPages} onChange={setPage} />}
        />
      )}

      <PriceCreateModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={async () => {
          setCreating(false);
          await load();
          await onChanged();
        }}
        groups={groups}
      />

      <PriceEditModal
        row={editing}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          await load();
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          await api(`/api/admin/vip/prices/${deleting.id}`, { method: "DELETE" });
          await load();
          await onChanged();
        }}
        title="전용 가격 삭제"
        description={`'${deleting?.products?.name ?? "이 상품"}'의 전용 가격을 지웁니다. 이후에는 그룹 전체 할인율이나 기본 판매가가 적용됩니다.`}
        confirmLabel="삭제"
        danger
      />
    </div>
  );
}
