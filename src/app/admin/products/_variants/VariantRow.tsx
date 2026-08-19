"use client";

/* ============================================================
   옵션 한 줄.

   고친 것:
   - 옛 줄은 '가격 차액' 만 물었다. 그래서 '20개입은 37,600원에 팔자' 는 결정을 화면에서 확인할
     길이 없었고(기본 판매가는 다른 탭에 있다), 기본가를 나중에 올리면 모든 옵션 판매가가
     조용히 따라 올라가는 것도 보이지 않았다. 이제 최종 판매가를 줄마다 크게 보여 준다.
   - 숫자 칸이 자유 텍스트여서 '17,800' 을 넣으면 아무 말 없이 0 으로 저장됐다.
     37,600원짜리 20개입이 19,800원에 팔리는 사고가 여기서 난다. 쉼표를 흡수하는 숫자 칸으로 바꿨다.
   - 기존 옵션의 재고 칸은 아예 못 고치게 막았다. 폼이 들고 있는 재고는 화면을 연 순간의 스냅숏이라,
     그 사이 팔린 수량이 저장 한 번에 되살아나 초과판매가 됐다(재고 변경은 재고 관리 화면 한 곳으로).
   ============================================================ */

import Link from "next/link";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { Input, Toggle } from "@/components/admin/Field";
import { krw } from "@/lib/format";
import NumberField from "../_basic/NumberField";
import { parseNumberField, type VariantDraft } from "../form-types";

export interface VariantRowProps {
  variant: VariantDraft;
  index: number;
  total: number;
  /** 기본 판매가 — 최종 판매가 계산에 쓴다. 판매가 칸이 비었거나 못 읽히면 null */
  basePrice: number | null;
  /** 같은 이름의 옵션이 또 있는지 */
  duplicated: boolean;
  onUpdate: (patch: Partial<VariantDraft>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}

const ICON_BTN =
  "inline-flex h-7 w-7 items-center justify-center border border-ink-200 bg-cream-50 text-ink-500 transition-colors hover:border-forest-600 hover:text-forest-700 disabled:cursor-not-allowed disabled:opacity-30";

export default function VariantRow({
  variant,
  index,
  total,
  basePrice,
  duplicated,
  onUpdate,
  onMove,
  onRemove,
}: VariantRowProps) {
  const isExisting = variant.id !== null;
  const deltaState = parseNumberField(variant.price_delta);
  const delta = deltaState.kind === "ok" ? deltaState.value : null;
  const finalPrice = basePrice !== null && delta !== null ? basePrice + delta : null;
  const nameMissing = variant.name.trim() === "";

  return (
    <li
      className={`border bg-cream-50 p-4 ${
        duplicated || nameMissing ? "border-signal-red" : "border-ink-200"
      }`}
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="krw inline-flex h-7 min-w-7 items-center justify-center bg-ink-100 px-2 text-xs text-ink-600">
          {index + 1}
        </span>
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={index === 0}
          className={ICON_BTN}
          aria-label={`${index + 1}번째 옵션을 위로 옮기기`}
        >
          <ArrowUp size={14} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={index === total - 1}
          className={ICON_BTN}
          aria-label={`${index + 1}번째 옵션을 아래로 옮기기`}
        >
          <ArrowDown size={14} strokeWidth={1.5} />
        </button>
        <span className="text-xs text-ink-400">
          고객 화면에서 이 순서대로 보입니다
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-[1fr_140px_140px_150px]">
        <div className="col-span-2 md:col-span-1">
          <Input
            value={variant.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder="예: 150g × 20개"
            aria-label={`${index + 1}번째 옵션 이름`}
            aria-invalid={duplicated || nameMissing || undefined}
            className={duplicated || nameMissing ? "border-signal-red" : ""}
          />
          <p className="mt-1 text-xs text-ink-400">옵션명</p>
          {duplicated && (
            <p className="mt-1 text-xs leading-relaxed text-signal-red">
              같은 이름의 옵션이 또 있습니다. 고객 화면에도 똑같은 줄이 두 개 뜹니다.
            </p>
          )}
        </div>

        <div>
          <NumberField
            value={variant.price_delta}
            onChange={(v) => onUpdate({ price_delta: v })}
            suffix="원"
            ariaLabel={`${index + 1}번째 옵션 추가 금액`}
            invalid={deltaState.kind === "invalid"}
          />
          <p className="mt-1 text-xs text-ink-400">추가 금액</p>
        </div>

        <div>
          {/* 계산 결과라 입력칸이 아니다 — 값이 어디서 나왔는지 아래 줄에서 밝힌다 */}
          <p className="krw pt-2.5 text-sm font-semibold text-ink-900">
            {finalPrice !== null ? `${krw(finalPrice)}원` : "—"}
          </p>
          <p className="mt-1 text-xs text-ink-400">
            {finalPrice !== null && basePrice !== null
              ? `이 옵션 판매가 (기본 ${krw(basePrice)}원 기준)`
              : "이 옵션 판매가"}
          </p>
          {basePrice === null && (
            <p className="mt-1 text-xs leading-relaxed text-signal-amber">
              기본 정보 탭의 판매가를 먼저 넣어 주세요.
            </p>
          )}
          {finalPrice !== null && finalPrice < 0 && (
            <p className="mt-1 text-xs leading-relaxed text-signal-red">
              판매가가 0원보다 작아집니다.
            </p>
          )}
        </div>

        <div>
          <Input
            value={variant.sku}
            onChange={(e) => onUpdate({ sku: e.target.value })}
            placeholder="선택"
            aria-label={`${index + 1}번째 옵션 코드`}
          />
          <p className="mt-1 text-xs text-ink-400">옵션 코드</p>
        </div>
      </div>

      <div className="mt-3 border-t border-ink-100 pt-3">
        {isExisting ? (
          <p className="text-sm text-ink-600">
            현재 재고 <span className="krw font-semibold">{variant.expectedStock ?? 0}</span>개
            <Link
              href="/admin/inventory"
              className="ml-2 text-xs text-forest-700 underline underline-offset-4"
            >
              재고 관리에서 입고·조정하기
            </Link>
            <span className="mt-1 block text-xs text-ink-400">
              재고는 이 화면에서 고치지 않습니다. 화면을 열어 둔 사이 팔린 수량이 저장할 때 되살아나
              실제로 없는 물건을 팔게 되기 때문입니다.
            </span>
          </p>
        ) : (
          <div className="max-w-40">
            <NumberField
              value={variant.stock}
              onChange={(v) => onUpdate({ stock: v })}
              suffix="개"
              ariaLabel={`${index + 1}번째 옵션 최초 재고`}
              invalid={parseNumberField(variant.stock).kind === "invalid"}
            />
            <p className="mt-1 text-xs text-ink-400">최초 재고 — 등록 이후에는 재고 관리 화면에서 바꿉니다.</p>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-ink-100 pt-3">
        <Toggle
          checked={variant.is_active}
          onChange={(checked) => onUpdate({ is_active: checked })}
          label="판매 활성"
        />
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex items-center gap-1 text-xs text-ink-400 transition-colors hover:text-signal-red"
        >
          <X size={14} strokeWidth={1.5} />
          옵션 빼기
        </button>
      </div>
    </li>
  );
}
