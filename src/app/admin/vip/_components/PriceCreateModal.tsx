"use client";

import { useState } from "react";
import { X } from "lucide-react";
import Modal from "@/components/admin/Modal";
import { FieldRow, Input, Select, Toggle } from "@/components/admin/Field";
import { discountRate, krw } from "@/lib/format";
import CustomerSearch from "./CustomerSearch";
import ProductSearch from "./ProductSearch";
import {
  api,
  BTN_GHOST,
  BTN_PRIMARY,
  kstDayEnd,
  kstDayStart,
  previewRatePrice,
  type CustomerHit,
  type GroupRow,
  type ProductHit,
} from "./vipApi";

/* ============================================================
   상품별 VIP 가격 — 일괄 등록 모달
   대상(그룹/개별 고객) 선택 → 상품 검색 멀티 선택 →
   상품별 지정가/할인율 개별 조정 테이블 → 기간/활성
   ============================================================ */

interface DraftRow {
  product: ProductHit;
  mode: "price" | "rate";
  value: string;
}

export interface PriceCreateModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  groups: GroupRow[];
}

export default function PriceCreateModal({ open, onClose, onSaved, groups }: PriceCreateModalProps) {
  const [targetType, setTargetType] = useState<"group" | "user">("group");
  const [groupId, setGroupId] = useState("");
  const [customer, setCustomer] = useState<CustomerHit | null>(null);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function reset() {
    setTargetType("group");
    setGroupId("");
    setCustomer(null);
    setRows([]);
    setStartsAt("");
    setEndsAt("");
    setActive(true);
    setError(null);
  }

  function close() {
    reset();
    onClose();
  }

  function updateRow(index: number, patch: Partial<DraftRow>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  /** 행별 적용가 미리보기 — 형식이 맞지 않으면 null */
  function appliedPreview(row: DraftRow): number | null {
    const n = Number(row.value);
    if (row.value.trim() === "" || !Number.isFinite(n)) return null;
    if (row.mode === "price") {
      return Number.isInteger(n) && n >= 1 && n <= row.product.price ? n : null;
    }
    return n > 0 && n <= 100 ? previewRatePrice(row.product.price, n) : null;
  }

  async function save() {
    if (targetType === "group" && !groupId) {
      setError("적용할 그룹을 선택해 주세요.");
      return;
    }
    if (targetType === "user" && !customer) {
      setError("적용할 고객을 검색해 선택해 주세요.");
      return;
    }
    if (rows.length === 0) {
      setError("가격을 지정할 상품을 1개 이상 추가해 주세요.");
      return;
    }
    for (const row of rows) {
      if (appliedPreview(row) === null) {
        setError(
          row.mode === "price"
            ? `'${row.product.name}'의 지정가를 확인해 주세요. (1원 이상, 정가 ${krw(row.product.price)}원 이하의 정수)`
            : `'${row.product.name}'의 할인율을 확인해 주세요. (0 초과 100 이하)`
        );
        return;
      }
    }
    if (startsAt && endsAt && startsAt > endsAt) {
      setError("적용 종료일은 시작일 이후여야 합니다.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await api("/api/admin/vip/prices", {
        method: "POST",
        body: JSON.stringify({
          group_id: targetType === "group" ? groupId : null,
          user_id: targetType === "user" ? customer!.id : null,
          starts_at: kstDayStart(startsAt),
          ends_at: kstDayEnd(endsAt),
          is_active: active,
          items: rows.map((row) => ({
            product_id: row.product.id,
            custom_price: row.mode === "price" ? Number(row.value) : null,
            discount_rate: row.mode === "rate" ? Number(row.value) : null,
          })),
        }),
      });
      reset();
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "전용 가격 등록에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="상품별 전용 가격 등록"
      size="lg"
      footer={
        <>
          <button type="button" onClick={close} className={BTN_GHOST}>
            취소
          </button>
          <button type="button" onClick={save} disabled={saving} className={BTN_PRIMARY}>
            {saving ? "등록 중…" : rows.length > 0 ? `${rows.length}개 상품 등록` : "등록"}
          </button>
        </>
      }
    >
      <div className="divide-y divide-ink-100">
        {/* 대상 선택 */}
        <FieldRow label="적용 대상" required>
          <div className="flex gap-4 pb-3">
            {(
              [
                { key: "group", label: "그룹" },
                { key: "user", label: "개별 고객" },
              ] as const
            ).map((option) => (
              <label key={option.key} className="flex cursor-pointer items-center gap-1.5 text-sm text-ink-700">
                <input
                  type="radio"
                  name="price-target"
                  checked={targetType === option.key}
                  onChange={() => setTargetType(option.key)}
                  className="accent-forest-700"
                />
                {option.label}
              </label>
            ))}
          </div>
          {targetType === "group" ? (
            <Select value={groupId} onChange={(e) => setGroupId(e.target.value)} aria-label="적용 그룹">
              <option value="">그룹 선택</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          ) : (
            <CustomerSearch value={customer} onChange={setCustomer} />
          )}
        </FieldRow>

        {/* 상품 선택 + 가격 테이블 */}
        <FieldRow
          label="상품별 가격"
          required
          help="상품마다 지정가 또는 할인율을 개별로 조정할 수 있습니다. 지정가는 정가를 넘을 수 없습니다."
        >
          <ProductSearch onAdd={(p) => setRows((prev) => [...prev, { product: p, mode: "price", value: "" }])} excludeIds={rows.map((r) => r.product.id)} />
          {rows.length > 0 && (
            <ul className="mt-3 divide-y divide-ink-100 border border-ink-200">
              {rows.map((row, i) => {
                const preview = appliedPreview(row);
                return (
                  <li key={row.product.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="truncate text-sm text-ink-900">{row.product.name}</p>
                      <p className="krw text-xs text-ink-400">정가 {krw(row.product.price)}원</p>
                    </div>
                    <Select
                      value={row.mode}
                      onChange={(e) => updateRow(i, { mode: e.target.value as DraftRow["mode"], value: "" })}
                      className="w-28 shrink-0"
                      aria-label="가격 방식"
                    >
                      <option value="price">지정가</option>
                      <option value="rate">할인율</option>
                    </Select>
                    <div className="relative w-32 shrink-0">
                      <Input
                        type="number"
                        min={row.mode === "price" ? 1 : 0.5}
                        max={row.mode === "price" ? row.product.price : 100}
                        step={row.mode === "price" ? 10 : 0.5}
                        value={row.value}
                        onChange={(e) => updateRow(i, { value: e.target.value })}
                        placeholder={row.mode === "price" ? "지정가" : "할인율"}
                        aria-label={row.mode === "price" ? "지정가" : "할인율"}
                        className="krw pr-9"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-400">
                        {row.mode === "price" ? "원" : "%"}
                      </span>
                    </div>
                    <p className="krw w-32 shrink-0 text-right text-sm">
                      {preview !== null ? (
                        <>
                          <span className="font-semibold text-forest-700">{krw(preview)}원</span>
                          <span className="ml-1 text-xs text-ink-400">
                            ({discountRate(row.product.price, preview)}%)
                          </span>
                        </>
                      ) : (
                        <span className="text-ink-300">—</span>
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                      aria-label="상품 제거"
                      className="shrink-0 p-1 text-ink-400 transition-colors hover:text-signal-red"
                    >
                      <X size={16} strokeWidth={1.5} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </FieldRow>

        {/* 기간 */}
        <FieldRow label="적용 기간" help="비워두면 상시 적용됩니다. 종료일 자정까지 유효합니다.">
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              max={endsAt || undefined}
              aria-label="적용 시작일"
              className="max-w-44"
            />
            <span className="text-ink-400">~</span>
            <Input
              type="date"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              min={startsAt || undefined}
              aria-label="적용 종료일"
              className="max-w-44"
            />
          </div>
        </FieldRow>

        {/* 활성 */}
        <FieldRow label="활성 상태">
          <Toggle checked={active} onChange={setActive} label={active ? "활성" : "비활성"} />
        </FieldRow>

        {error && <p className="pt-3 text-sm text-signal-red">{error}</p>}
      </div>
    </Modal>
  );
}
