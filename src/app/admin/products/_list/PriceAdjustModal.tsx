"use client";

/* ============================================================
   가격 일괄 조정 대화상자.

   여기서 가장 중요한 것은 "적용 전 미리보기"다. 퍼센트 인상은 머릿속으로 검산이
   안 되기 때문에(19,800 의 8% 인상을 100원 단위로 반올림하면 21,400인지 21,384인지
   즉답할 수 있는 사람은 없다) 확인 없이 누르게 되고, 한 번 잘못 누르면 13개 상품의
   가격이 한꺼번에 틀어진다. 그래서 바뀔 값 전부를 표로 먼저 보여주고 확인을 받는다.

   계산은 price-math.ts 한 곳에서만 한다 — 서버도 같은 함수를 쓰므로 여기 보이는
   숫자와 실제 저장되는 숫자가 어긋날 수 없다. 세어 보여 줄 것(정가 역전·옵션 추가금액·
   적용 불가 사유)은 price-preview.ts 가, 표와 카드는 PriceAdjustPreview 가 맡는다.
   ============================================================ */

import { useMemo, useState } from "react";
import Modal from "@/components/admin/Modal";
import { Help, Input, Label, Select } from "@/components/admin/Field";
import { BTN_GHOST, BTN_PRIMARY } from "../product-ui";
import type { ProductListRow } from "./list-types";
import PriceAdjustPreview from "./PriceAdjustPreview";
import { buildPricePreview, describePlanIssue } from "./price-preview";
import {
  PRICE_MODES,
  PRICE_MODE_LABELS,
  PRICE_TARGETS,
  PRICE_TARGET_LABELS,
  ROUND_DIR_LABELS,
  ROUND_UNITS,
  ROUND_UNIT_LABELS,
  describePlan,
  type PriceAdjustPlan,
  type PriceMode,
  type PriceTarget,
  type RoundDir,
  type RoundUnit,
} from "./price-math";

export interface PriceAdjustModalProps {
  open: boolean;
  rows: ProductListRow[];
  busy: boolean;
  /**
   * 저장에 실패했을 때 서버가 돌려준 한국어 사유.
   *
   * 예전에는 성공이든 실패든 모달을 닫아 버려서, 실패하면 방금 고른 대상·방식·끝자리가
   * 전부 사라지고 관리자는 목록 위 배너 한 줄만 봤다. 실패는 모달 안에서 알린다.
   */
  errorText: string | null;
  onClose: () => void;
  onApply: (plan: PriceAdjustPlan) => void;
}

/**
 * 엑셀에서 복사한 "12,900" · "12900원" 을 그대로 받아 준다.
 * 예전 가격 입력칸은 이런 값을 조용히 버려서, 저장은 성공했는데 값이 사라졌다.
 */
function parseNumberInput(text: string): number | null {
  const cleaned = text.replace(/[,\s원₩%]/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export default function PriceAdjustModal({
  open,
  rows,
  busy,
  errorText,
  onClose,
  onApply,
}: PriceAdjustModalProps) {
  const [target, setTarget] = useState<PriceTarget>("price");
  const [mode, setMode] = useState<PriceMode>("percent");
  const [valueText, setValueText] = useState("");
  const [unit, setUnit] = useState<RoundUnit>(100);
  const [dir, setDir] = useState<RoundDir>("round");

  // 미리보기 useMemo 가 매 렌더마다 다시 계산되지 않도록 plan 자체를 기억해 둔다
  const plan = useMemo<PriceAdjustPlan | null>(() => {
    const value = parseNumberInput(valueText);
    return value === null ? null : { target, mode, value, unit, dir };
  }, [valueText, target, mode, unit, dir]);

  // 서버가 받아 줄 수 없는 값이면 미리보기를 계산하지 않는다 — 저장되지 않을 숫자를
  // 표로 보여 주는 것이 가장 나쁘다(관리자는 그 값이 될 것이라 믿고 확인을 누른다)
  const issue = describePlanIssue(plan);
  const preview = useMemo(
    () => buildPricePreview(rows, issue === null ? plan : null),
    [rows, plan, issue]
  );

  const canApply = plan !== null && issue === null && preview.changing.length > 0 && !busy;
  const unitLabel = mode === "percent" ? "%" : "원";

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={`가격 일괄 조정 — 선택한 상품 ${rows.length}개`}
      size="lg"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={BTN_GHOST}>
            취소
          </button>
          <button
            type="button"
            onClick={() => plan && onApply(plan)}
            disabled={!canApply}
            className={BTN_PRIMARY}
          >
            {busy ? "바꾸는 중…" : `${preview.changing.length}개 상품에 적용`}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {errorText && (
          <p className="border border-signal-red/40 bg-signal-red/5 px-4 py-3 text-sm leading-relaxed text-signal-red">
            {errorText} 고른 조건은 그대로 두었으니 값을 고쳐 다시 눌러 주세요.
          </p>
        )}

        {/* ---------- 조건 ---------- */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="price-target">어떤 가격을 바꿀까요</Label>
            <Select
              id="price-target"
              value={target}
              onChange={(e) => setTarget(e.target.value as PriceTarget)}
            >
              {PRICE_TARGETS.map((t) => (
                <option key={t} value={t}>
                  {PRICE_TARGET_LABELS[t]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="price-mode">어떻게 바꿀까요</Label>
            <Select
              id="price-mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as PriceMode)}
            >
              {PRICE_MODES.map((m) => (
                <option key={m} value={m}>
                  {PRICE_MODE_LABELS[m]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="price-value">
              {mode === "set" ? "정할 금액" : mode === "percent" ? "몇 퍼센트" : "얼마"}
            </Label>
            <div className="relative">
              <Input
                id="price-value"
                inputMode="decimal"
                value={valueText}
                onChange={(e) => setValueText(e.target.value)}
                placeholder={mode === "percent" ? "예: 8 (내릴 때는 -8)" : "예: 1000"}
                className="pr-10"
              />
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-400">
                {unitLabel}
              </span>
            </div>
            {mode !== "set" && <Help>내리려면 앞에 빼기표(-)를 붙이세요.</Help>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="price-unit">끝자리</Label>
              <Select
                id="price-unit"
                value={String(unit)}
                onChange={(e) => setUnit(Number(e.target.value) as RoundUnit)}
              >
                {ROUND_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {ROUND_UNIT_LABELS[u]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="price-dir">맞추는 방향</Label>
              <Select
                id="price-dir"
                value={dir}
                onChange={(e) => setDir(e.target.value as RoundDir)}
                disabled={unit === 1}
              >
                {(Object.keys(ROUND_DIR_LABELS) as RoundDir[]).map((d) => (
                  <option key={d} value={d}>
                    {ROUND_DIR_LABELS[d]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>

        {issue !== null ? (
          <p className="border border-signal-red/40 bg-signal-red/5 px-4 py-3 text-sm leading-relaxed text-signal-red">
            {issue}
          </p>
        ) : (
          plan && (
            <p className="border border-forest-600/30 bg-forest-50/60 px-4 py-3 text-sm text-forest-800">
              {describePlan(plan)}
            </p>
          )
        )}

        {/* ---------- 미리보기 ---------- */}
        {plan === null || issue !== null ? (
          <p className="border border-ink-200 bg-cream-100 px-4 py-6 text-center text-sm text-ink-500">
            바꿀 값을 입력하면 상품마다 어떤 가격이 되는지 미리 보여 드립니다.
          </p>
        ) : (
          <div>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-[13px] font-medium text-ink-700">적용 전후 미리보기</h3>
              <p className="text-xs text-ink-400">
                {rows.length}개 중{" "}
                <span className="font-medium text-ink-700">{preview.changing.length}개</span>가
                바뀝니다
              </p>
            </div>

            {preview.blocked.length > 0 && (
              <p className="mb-2 border border-signal-red/40 bg-signal-red/5 px-3 py-2 text-xs leading-relaxed text-signal-red">
                판매중인 상품 {preview.blocked.length}개는 판매가가 0원이 되어 바꿀 수 없습니다. 이
                상품들은 건너뜁니다.
              </p>
            )}

            {/* 옵션 추가금액은 이 기능이 손대지 못하는 값이다.
                고객이 실제로 내는 값은 판매가 + 옵션 추가금액인데 여기서는 판매가만
                바꾸므로, 추가금액이 붙은 상품에서는 "8% 인상" 이 그대로 성립하지 않는다.
                (예: 12,000원 + 옵션 3,000원 = 15,000원 → 8% 올려도 16,000원이 아니라 15,960원)
                추가금액까지 함께 조정하는 것은 정책·스키마 판단이라 감독에게 올렸다.
                그때까지는 최소한 **몇 개가 그런 상품인지** 눈에 보이게 한다. */}
            {preview.withSurcharge.length > 0 && (
              <p className="mb-2 border border-signal-red/40 bg-signal-red/5 px-3 py-2 text-xs leading-relaxed text-signal-red">
                옵션 추가금액이 있어 옵션 가격은 바뀌지 않습니다 — {preview.withSurcharge.length}개.
                이 상품들은 기본 판매가만 바뀌므로, 옵션을 고른 고객이 내는 값은 계산한 비율만큼
                오르내리지 않습니다. 상품을 열어 옵션 추가 금액을 직접 확인해 주세요.
              </p>
            )}

            {preview.overCompare.length > 0 && (
              <p className="mb-2 border border-signal-amber/50 bg-signal-amber/5 px-3 py-2 text-xs leading-relaxed text-signal-amber">
                {preview.overCompare.length}개는 바뀐 판매가가 정가보다 비싸집니다. 고객 화면에서
                할인 표시(취소선과 할인율)가 사라집니다.
              </p>
            )}

            <PriceAdjustPreview rows={preview.rows} />
          </div>
        )}
      </div>
    </Modal>
  );
}
