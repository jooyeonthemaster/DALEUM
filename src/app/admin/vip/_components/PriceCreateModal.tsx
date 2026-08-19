"use client";

import { useState } from "react";
import { X } from "lucide-react";
import Modal from "@/components/admin/Modal";
import { FieldRow, Input, Select, Toggle } from "@/components/admin/Field";
import { TOGGLE_LABELS, VIP_BASE_PRICE_LABEL, won } from "@/lib/admin-labels";
import { discountRate } from "@/lib/format";
import CustomerSearch from "./CustomerSearch";
import KoreanDateField from "./KoreanDateField";
import ProductPickerModal from "./ProductPickerModal";
import { BasePriceLine, isBelowCost, MarginLine } from "./PriceMeta";
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
   상품별 VIP 가격 — 여러 상품을 한 번에 등록하는 모달.

   고친 것:
   · 상품 담기가 1건씩 검색·타이핑뿐이었다 → 여러 개를 한 번에 고르는 모달로.
   · 기준 금액을 "정가"라고 불렀다 → 상품 폼의 정가(할인 전 표시가)와 뒤섞이므로
     VIP 화면에서는 '기본 판매가'로 부른다.
   · 원가가 보이지 않아 원가 이하로 팔아도 아무도 못 막았다 → 원가·마진을 같이 보여 주고,
     원가 아래면 한 번 더 확인을 받는다.
   · 기간 입력이 mm/dd/yyyy 로 떴다 → 한국식 달력으로.
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
  const [picking, setPicking] = useState(false);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [costWarning, setCostWarning] = useState<string | null>(null);
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
    setCostWarning(null);
  }

  function close() {
    reset();
    onClose();
  }

  function updateRow(index: number, patch: Partial<DraftRow>) {
    setCostWarning(null);
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
      setError("어느 그룹에 적용할지 골라 주세요.");
      return;
    }
    if (targetType === "user" && !customer) {
      setError("어느 고객에게 적용할지 검색해 골라 주세요.");
      return;
    }
    if (rows.length === 0) {
      setError("가격을 정할 상품을 1개 이상 담아 주세요.");
      return;
    }
    for (const row of rows) {
      if (appliedPreview(row) === null) {
        setError(
          row.mode === "price"
            ? `'${row.product.name}'의 가격을 확인해 주세요. (1원 이상, ${VIP_BASE_PRICE_LABEL} ${won(row.product.price)} 이하)`
            : `'${row.product.name}'의 할인율을 확인해 주세요. (0 초과 100 이하)`
        );
        return;
      }
    }
    if (startsAt && endsAt && startsAt > endsAt) {
      setError("적용 종료일은 시작일보다 뒤여야 합니다.");
      return;
    }

    // 원가 이하로 파는 것은 막지 않되, 모르고 지나치지는 않게 한 번 더 묻는다
    const belowCost = rows.filter((row) => isBelowCost(appliedPreview(row), row.product.cost_price));
    if (belowCost.length > 0 && !costWarning) {
      setError(null);
      setCostWarning(
        `${belowCost.map((r) => `'${r.product.name}'`).join(", ")} 의 가격이 원가보다 낮습니다. 이대로 등록하면 팔수록 손해입니다. 그래도 등록하시겠습니까?`
      );
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
      setError(e instanceof Error ? e.message : "전용 가격을 등록하지 못했습니다.");
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
            {saving
              ? "등록 중…"
              : costWarning
                ? "그래도 등록"
                : rows.length > 0
                  ? `${rows.length}개 상품 등록`
                  : "등록"}
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
                { key: "group", label: "그룹 전체" },
                { key: "user", label: "고객 한 명" },
              ] as const
            ).map((option) => (
              <label
                key={option.key}
                className="flex cursor-pointer items-center gap-1.5 text-sm text-ink-700"
              >
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

        {/* 상품 담기 + 가격 표 */}
        <FieldRow
          label="상품별 가격"
          required
          help={`상품마다 가격을 직접 정하거나 할인율로 정할 수 있습니다. ${VIP_BASE_PRICE_LABEL}보다 비싸게는 정할 수 없습니다.`}
        >
          <button type="button" onClick={() => setPicking(true)} className={BTN_GHOST}>
            상품 담기
          </button>
          {rows.length > 0 && (
            <ul className="mt-3 divide-y divide-ink-100 border border-ink-200">
              {rows.map((row, i) => {
                const preview = appliedPreview(row);
                const below = isBelowCost(preview, row.product.cost_price);
                return (
                  <li
                    key={row.product.id}
                    className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 ${
                      below ? "bg-[#f6e8e3]" : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="truncate text-sm text-ink-900">{row.product.name}</p>
                      <BasePriceLine price={row.product.price} cost={row.product.cost_price} />
                    </div>
                    <Select
                      value={row.mode}
                      onChange={(e) =>
                        updateRow(i, { mode: e.target.value as DraftRow["mode"], value: "" })
                      }
                      className="w-32 shrink-0"
                      aria-label="가격 정하는 방식"
                    >
                      <option value="price">가격 직접</option>
                      <option value="rate">할인율로</option>
                    </Select>
                    <div className="relative w-32 shrink-0">
                      <Input
                        type="number"
                        min={row.mode === "price" ? 1 : 0.5}
                        max={row.mode === "price" ? row.product.price : 100}
                        step={row.mode === "price" ? 10 : 0.5}
                        value={row.value}
                        onChange={(e) => updateRow(i, { value: e.target.value })}
                        placeholder={row.mode === "price" ? "판매할 가격" : "할인율"}
                        aria-label={row.mode === "price" ? "적용할 가격" : "할인율"}
                        className="krw pr-9"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-400">
                        {row.mode === "price" ? "원" : "%"}
                      </span>
                    </div>
                    <div className="w-40 shrink-0 text-right">
                      {preview !== null ? (
                        <>
                          <p className="krw text-sm">
                            <span className="font-semibold text-forest-700">{won(preview)}</span>
                            <span className="ml-1 text-xs text-ink-400">
                              ({discountRate(row.product.price, preview)}% 할인)
                            </span>
                          </p>
                          <MarginLine applied={preview} cost={row.product.cost_price} />
                        </>
                      ) : (
                        <span className="text-ink-300">—</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                      aria-label="상품 빼기"
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
        <FieldRow label="적용 기간" help="비워 두면 계속 적용됩니다. 종료일은 그 날 밤 12시까지입니다.">
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

        {/* 노출 */}
        <FieldRow label="지금 적용" help="끄면 저장만 해 두고 나중에 켤 수 있습니다.">
          <Toggle
            checked={active}
            onChange={setActive}
            label={active ? TOGGLE_LABELS.on : TOGGLE_LABELS.off}
          />
        </FieldRow>

        {costWarning && (
          <p className="border border-signal-red/30 bg-[#f6e8e3] px-4 py-2.5 text-sm leading-relaxed text-signal-red">
            {costWarning}
          </p>
        )}
        {error && <p className="pt-3 text-sm text-signal-red">{error}</p>}
      </div>

      <ProductPickerModal
        open={picking}
        onClose={() => setPicking(false)}
        excludeIds={rows.map((r) => r.product.id)}
        onAdd={(products) =>
          setRows((prev) => [...prev, ...products.map((p) => ({ product: p, mode: "price" as const, value: "" }))])
        }
      />
    </Modal>
  );
}
