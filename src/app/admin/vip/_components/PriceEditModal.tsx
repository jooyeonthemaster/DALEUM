"use client";

import { useState } from "react";
import Modal from "@/components/admin/Modal";
import { FieldRow, Input, Select, Toggle } from "@/components/admin/Field";
import { TOGGLE_LABELS, VIP_BASE_PRICE_LABEL, won } from "@/lib/admin-labels";
import { discountRate } from "@/lib/format";
import KoreanDateField from "./KoreanDateField";
import { BasePriceLine, isBelowCost, MarginLine } from "./PriceMeta";
import {
  api,
  BTN_GHOST,
  BTN_PRIMARY,
  customerLabel,
  isoToDateInput,
  kstDayEnd,
  kstDayStart,
  previewRatePrice,
  type PriceRow,
} from "./vipApi";

/* ============================================================
   전용 가격 수정 모달 — PricesTab 에서 떼어 냈다(한 파일 400줄 넘김 방지).
   기준 금액은 '기본 판매가'로 부르고, 원가·마진을 함께 보여 준다.
   ============================================================ */

export interface PriceEditModalProps {
  row: PriceRow | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

export default function PriceEditModal({ row, onClose, onSaved }: PriceEditModalProps) {
  const [mode, setMode] = useState<"price" | "rate">("price");
  const [value, setValue] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // 어떤 행을 편집 중인지 기억해 둔다 — 행이 바뀌면 그때 폼을 채운다
  // (effect 안에서 setState 하지 않으려고 렌더 중 비교로 처리한다)
  const [loadedId, setLoadedId] = useState<string | null>(null);

  // 모달을 닫으면 기억을 지운다 — 같은 행을 다시 열었을 때 저장하지 않은 값이 남아 있으면 안 된다
  if (!row && loadedId !== null) setLoadedId(null);

  if (row && row.id !== loadedId) {
    setLoadedId(row.id);
    setMode(row.custom_price != null ? "price" : "rate");
    setValue(
      row.custom_price != null
        ? String(row.custom_price)
        : row.discount_rate != null
          ? String(Number(row.discount_rate))
          : ""
    );
    setStartsAt(isoToDateInput(row.starts_at));
    setEndsAt(isoToDateInput(row.ends_at));
    setActive(row.is_active);
    setError(null);
  }

  const base = row?.products?.price ?? null;
  const cost = row?.products?.cost_price ?? null;

  /** 지금 입력값이 만들어 내는 최종 금액 */
  function preview(): number | null {
    const n = Number(value);
    if (value.trim() === "" || !Number.isFinite(n) || base == null) return null;
    if (mode === "price") return Number.isInteger(n) && n >= 1 && n <= base ? n : null;
    return n > 0 && n <= 100 ? previewRatePrice(base, n) : null;
  }

  async function save() {
    if (!row) return;
    const n = Number(value);
    if (mode === "price") {
      if (!Number.isInteger(n) || n < 1 || (base != null && n > base)) {
        setError(
          base != null
            ? `가격은 1원 이상, ${VIP_BASE_PRICE_LABEL} ${won(base)} 이하로 넣어 주세요.`
            : "가격은 1원 이상의 정수로 넣어 주세요."
        );
        return;
      }
    } else if (!Number.isFinite(n) || n <= 0 || n > 100) {
      setError("할인율은 0보다 크고 100 이하인 숫자로 넣어 주세요.");
      return;
    }
    if (startsAt && endsAt && startsAt > endsAt) {
      setError("적용 종료일은 시작일보다 뒤여야 합니다.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await api(`/api/admin/vip/prices/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...(mode === "price" ? { custom_price: n } : { discount_rate: n }),
          starts_at: kstDayStart(startsAt),
          ends_at: kstDayEnd(endsAt),
          is_active: active,
        }),
      });
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "수정하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const applied = preview();

  return (
    <Modal
      open={row !== null}
      onClose={onClose}
      title="전용 가격 수정"
      footer={
        <>
          <button type="button" onClick={onClose} className={BTN_GHOST}>
            취소
          </button>
          <button type="button" onClick={save} disabled={saving} className={BTN_PRIMARY}>
            {saving ? "저장 중…" : "저장"}
          </button>
        </>
      }
    >
      {row && (
        <div className="divide-y divide-ink-100">
          <FieldRow label="대상 / 상품">
            <div className="border border-ink-200 bg-cream-100 px-3.5 py-2.5 text-sm">
              <p className="text-ink-900">
                {row.group_id
                  ? `그룹 · ${row.vip_groups?.name ?? "삭제된 그룹"}`
                  : `고객 · ${customerLabel(row.profiles)}`}
              </p>
              <p className="mt-0.5 text-xs text-ink-500">
                {row.products?.name ?? "삭제된 상품"}
              </p>
              {row.products && <BasePriceLine price={row.products.price} cost={cost} />}
            </div>
          </FieldRow>

          <FieldRow label="적용할 가격" required>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value as "price" | "rate");
                  setValue("");
                }}
                className="w-32 shrink-0"
                aria-label="가격 정하는 방식"
              >
                <option value="price">가격 직접</option>
                <option value="rate">할인율로</option>
              </Select>
              <div className="relative max-w-40 flex-1">
                <Input
                  type="number"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={mode === "price" ? "판매할 가격" : "할인율"}
                  aria-label={mode === "price" ? "적용할 가격" : "할인율"}
                  className="krw pr-9"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-400">
                  {mode === "price" ? "원" : "%"}
                </span>
              </div>
            </div>
            {applied != null && base != null && (
              <p
                className={`mt-2 text-sm ${
                  isBelowCost(applied, cost) ? "text-signal-red" : "text-ink-600"
                }`}
              >
                <span className="krw font-semibold text-forest-700">{won(applied)}</span>
                <span className="ml-1 text-xs text-ink-400">
                  ({discountRate(base, applied)}% 할인)
                </span>
                <span className="ml-2">
                  <MarginLine applied={applied} cost={cost} />
                </span>
              </p>
            )}
          </FieldRow>

          <FieldRow label="적용 기간" help="비워 두면 계속 적용됩니다.">
            <div className="flex flex-wrap items-start gap-2">
              <KoreanDateField
                value={startsAt}
                onChange={setStartsAt}
                emptyLabel="바로 시작"
                max={endsAt || undefined}
                ariaLabel="적용 시작일"
              />
              <span className="pt-2.5 text-ink-400">~</span>
              <KoreanDateField
                value={endsAt}
                onChange={setEndsAt}
                emptyLabel="종료 없음"
                min={startsAt || undefined}
                ariaLabel="적용 종료일"
              />
            </div>
          </FieldRow>

          <FieldRow label="지금 적용">
            <Toggle
              checked={active}
              onChange={setActive}
              label={active ? TOGGLE_LABELS.on : TOGGLE_LABELS.off}
            />
          </FieldRow>

          {error && <p className="pt-3 text-sm text-signal-red">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
