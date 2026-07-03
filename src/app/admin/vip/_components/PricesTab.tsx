"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import DataTable from "@/components/admin/DataTable";
import Modal from "@/components/admin/Modal";
import Pagination from "@/components/admin/Pagination";
import { FieldRow, Input, Select, Toggle } from "@/components/admin/Field";
import { discountRate, formatDate, krw } from "@/lib/format";
import PriceCreateModal from "./PriceCreateModal";
import {
  api,
  BTN_GHOST,
  BTN_PRIMARY,
  customerLabel,
  isoToDateInput,
  kstDayEnd,
  kstDayStart,
  previewRatePrice,
  type GroupRow,
  type PriceRow,
} from "./vipApi";

/* ============================================================
   [상품별 가격] 탭 — vip_product_prices 목록/수정/삭제 + 일괄 등록
   ============================================================ */

const PAGE_SIZE = 20;

interface EditDraft {
  row: PriceRow;
  mode: "price" | "rate";
  value: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
}

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
  if (!row.starts_at && !row.ends_at) return "상시";
  const from = row.starts_at ? formatDate(row.starts_at) : "";
  const to = row.ends_at ? formatDate(row.ends_at) : "";
  return `${from} ~ ${to}`.trim();
}

export default function PricesTab() {
  const [prices, setPrices] = useState<PriceRow[] | null>(null);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<EditDraft | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
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
    api<{ groups: GroupRow[] }>("/api/admin/vip/groups")
      .then((data) => setGroups(data.groups))
      .catch(() => setGroups([]));
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
    }
  }

  function openEdit(row: PriceRow) {
    setEditError(null);
    setEditing({
      row,
      mode: row.custom_price != null ? "price" : "rate",
      value:
        row.custom_price != null
          ? String(row.custom_price)
          : row.discount_rate != null
            ? String(Number(row.discount_rate))
            : "",
      startsAt: isoToDateInput(row.starts_at),
      endsAt: isoToDateInput(row.ends_at),
      active: row.is_active,
    });
  }

  async function saveEdit() {
    if (!editing) return;
    const base = editing.row.products?.price ?? null;
    const n = Number(editing.value);
    if (editing.mode === "price") {
      if (!Number.isInteger(n) || n < 1 || (base != null && n > base)) {
        setEditError(
          base != null
            ? `지정가는 1원 이상, 정가 ${krw(base)}원 이하의 정수여야 합니다.`
            : "지정가는 1원 이상의 정수여야 합니다."
        );
        return;
      }
    } else if (!Number.isFinite(n) || n <= 0 || n > 100) {
      setEditError("할인율은 0보다 크고 100 이하인 숫자여야 합니다.");
      return;
    }
    if (editing.startsAt && editing.endsAt && editing.startsAt > editing.endsAt) {
      setEditError("적용 종료일은 시작일 이후여야 합니다.");
      return;
    }

    setSaving(true);
    setEditError(null);
    try {
      await api(`/api/admin/vip/prices/${editing.row.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...(editing.mode === "price" ? { custom_price: n } : { discount_rate: n }),
          starts_at: kstDayStart(editing.startsAt),
          ends_at: kstDayEnd(editing.endsAt),
          is_active: editing.active,
        }),
      });
      setEditing(null);
      await load();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "수정에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil((prices?.length ?? 0) / PAGE_SIZE));
  const pageRows = useMemo(
    () => (prices ?? []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [prices, page]
  );

  return (
    <div>
      {/* 툴바 */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-500">
          특정 그룹 또는 고객에게만 적용되는 상품별 전용 가격입니다. 개별 지정가가 그룹 가격보다
          우선합니다.
        </p>
        <button type="button" onClick={() => setCreating(true)} className={`shrink-0 ${BTN_PRIMARY}`}>
          가격 등록
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-signal-red">{error}</p>}

      <DataTable<PriceRow>
        columns={[
          {
            key: "target",
            label: "대상",
            width: "180px",
            render: (row) => (
              <div className="min-w-0">
                <p className="label-caps text-forest-700">{row.group_id ? "그룹" : "개별"}</p>
                <p className="truncate text-ink-900">
                  {row.group_id ? (row.vip_groups?.name ?? "삭제된 그룹") : customerLabel(row.profiles)}
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
            label: "정가 → 적용가",
            width: "200px",
            render: (row) => {
              const base = row.products?.price ?? null;
              const applied = appliedPrice(row);
              return (
                <span className="krw">
                  {base != null && <span className="text-ink-400 line-through">{krw(base)}원</span>}
                  <span className="mx-1 text-ink-300">→</span>
                  {applied != null ? (
                    <span className="font-semibold text-forest-700">{krw(applied)}원</span>
                  ) : (
                    <span className="text-ink-300">—</span>
                  )}
                  {base != null && applied != null && (
                    <span className="ml-1 text-xs text-ink-400">
                      ({discountRate(base, applied)}%)
                    </span>
                  )}
                </span>
              );
            },
          },
          {
            key: "period",
            label: "기간",
            width: "180px",
            hideOnMobile: true,
            render: (row) => <span className="krw text-ink-600">{periodLabel(row)}</span>,
          },
          {
            key: "is_active",
            label: "활성",
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
                  onClick={() => openEdit(row)}
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

      {/* 일괄 등록 모달 */}
      <PriceCreateModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false);
          load();
        }}
        groups={groups}
      />

      {/* 수정 모달 */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="전용 가격 수정"
        footer={
          <>
            <button type="button" onClick={() => setEditing(null)} className={BTN_GHOST}>
              취소
            </button>
            <button type="button" onClick={saveEdit} disabled={saving} className={BTN_PRIMARY}>
              {saving ? "저장 중…" : "저장"}
            </button>
          </>
        }
      >
        {editing && (
          <div className="divide-y divide-ink-100">
            <FieldRow label="대상 / 상품">
              <div className="border border-ink-200 bg-cream-100 px-3.5 py-2.5 text-sm">
                <p className="text-ink-900">
                  {editing.row.group_id
                    ? `그룹 · ${editing.row.vip_groups?.name ?? "삭제된 그룹"}`
                    : `개별 · ${customerLabel(editing.row.profiles)}`}
                </p>
                <p className="krw mt-0.5 text-xs text-ink-400">
                  {editing.row.products?.name ?? "삭제된 상품"}
                  {editing.row.products && ` — 정가 ${krw(editing.row.products.price)}원`}
                </p>
              </div>
            </FieldRow>
            <FieldRow label="가격" required>
              <div className="flex gap-2">
                <Select
                  value={editing.mode}
                  onChange={(e) =>
                    setEditing({ ...editing, mode: e.target.value as EditDraft["mode"], value: "" })
                  }
                  className="w-28 shrink-0"
                  aria-label="가격 방식"
                >
                  <option value="price">지정가</option>
                  <option value="rate">할인율</option>
                </Select>
                <div className="relative max-w-40 flex-1">
                  <Input
                    type="number"
                    value={editing.value}
                    onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                    placeholder={editing.mode === "price" ? "지정가" : "할인율"}
                    aria-label={editing.mode === "price" ? "지정가" : "할인율"}
                    className="krw pr-9"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-400">
                    {editing.mode === "price" ? "원" : "%"}
                  </span>
                </div>
              </div>
            </FieldRow>
            <FieldRow label="적용 기간" help="비워두면 상시 적용됩니다.">
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={editing.startsAt}
                  onChange={(e) => setEditing({ ...editing, startsAt: e.target.value })}
                  max={editing.endsAt || undefined}
                  aria-label="적용 시작일"
                  className="max-w-44"
                />
                <span className="text-ink-400">~</span>
                <Input
                  type="date"
                  value={editing.endsAt}
                  onChange={(e) => setEditing({ ...editing, endsAt: e.target.value })}
                  min={editing.startsAt || undefined}
                  aria-label="적용 종료일"
                  className="max-w-44"
                />
              </div>
            </FieldRow>
            <FieldRow label="활성 상태">
              <Toggle
                checked={editing.active}
                onChange={(next) => setEditing({ ...editing, active: next })}
                label={editing.active ? "활성" : "비활성"}
              />
            </FieldRow>
            {editError && <p className="pt-3 text-sm text-signal-red">{editError}</p>}
          </div>
        )}
      </Modal>

      {/* 삭제 확인 */}
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          await api(`/api/admin/vip/prices/${deleting.id}`, { method: "DELETE" });
          await load();
        }}
        title="전용 가격 삭제"
        description={`'${deleting?.products?.name ?? "이 상품"}'의 전용 가격 설정을 삭제합니다. 이후에는 그룹 할인율 또는 정가가 적용됩니다.`}
        confirmLabel="삭제"
        danger
      />
    </div>
  );
}
