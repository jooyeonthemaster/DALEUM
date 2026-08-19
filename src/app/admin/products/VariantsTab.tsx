"use client";

/* ============================================================
   옵션 탭 — 같은 상품의 용량·맛 갈래를 만든다.

   이 화면에서 실제로 났던 사고를 기준으로 고쳤다.
   1) '17,800' 처럼 쉼표를 찍으면 추가 금액이 조용히 0 원이 됐다 → 쉼표를 흡수하는 숫자 칸.
   2) 최종 판매가를 어디서도 볼 수 없어 암산으로 가격을 정했다 → 줄마다 최종 판매가 표시.
   3) 순서를 바꾸려면 지웠다 다시 만드는 수밖에 없었고, 지우면 재고와 입출고 이력 연결이 끊겼다
      → 위/아래 버튼으로 순서만 바꾼다(저장할 때 이 배열 순서가 그대로 노출 순서가 된다).
   4) 삭제가 확인 한 번 없이 즉시 사라졌다 → 재고가 남은 기존 옵션은 확인창, 그 외에는 되돌리기.
   5) 20개 상한이 화면에 없어서 버튼이 아무 설명 없이 눌리지 않기만 했다 → 개수를 항상 보여 준다.
   ============================================================ */

import { useState } from "react";
import { Undo2 } from "lucide-react";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { Help } from "@/components/admin/Field";
import { krw } from "@/lib/format";
import type { VariantDraft } from "./form-types";
import { duplicateVariantIndexes, MAX_VARIANTS } from "./_form/validate";
import VariantRow from "./_variants/VariantRow";

export interface VariantsTabProps {
  variants: VariantDraft[];
  onChange: (variants: VariantDraft[]) => void;
  isNew: boolean;
  /** 기본 정보 탭의 판매가 — 옵션별 최종 판매가를 이 값 위에 얹어 보여 준다 */
  basePrice: number | null;
}

interface Removed {
  index: number;
  variant: VariantDraft;
}

export default function VariantsTab({ variants, onChange, isNew, basePrice }: VariantsTabProps) {
  // 지운 옵션을 잠시 들고 있다가 되돌릴 수 있게 한다 — 오타를 고치려다 X 를 잘못 누르는 일이 잦다.
  const [removed, setRemoved] = useState<Removed | null>(null);
  const [confirmIndex, setConfirmIndex] = useState<number | null>(null);
  const duplicated = duplicateVariantIndexes(variants);
  const atLimit = variants.length >= MAX_VARIANTS;

  function update(index: number, patch: Partial<VariantDraft>) {
    onChange(variants.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= variants.length) return;
    const next = [...variants];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function drop(index: number) {
    setRemoved({ index, variant: variants[index] });
    onChange(variants.filter((_, i) => i !== index));
  }

  function requestRemove(index: number) {
    const v = variants[index];
    // 재고가 남아 있는 기존 옵션을 지우면 그 재고와 입출고 이력 연결이 영구히 끊긴다 — 한 번 묻는다.
    if (v.id && (v.expectedStock ?? 0) > 0) {
      setConfirmIndex(index);
      return;
    }
    drop(index);
  }

  function restore() {
    if (!removed) return;
    const next = [...variants];
    next.splice(Math.min(removed.index, next.length), 0, removed.variant);
    onChange(next);
    setRemoved(null);
  }

  function add() {
    if (atLimit) return;
    setRemoved(null);
    onChange([
      ...variants,
      { id: null, name: "", price_delta: "0", stock: "0", expectedStock: null, sku: "", is_active: true },
    ]);
  }

  const pending = confirmIndex !== null ? variants[confirmIndex] : null;

  return (
    // 아래 여백은 폼 본체가 저장 바 높이만큼 한 번에 준다(탭마다 제각각이면 어긋난다)
    <div>
      <p className="text-sm leading-relaxed text-ink-600">
        옵션이 있으면 재고와 주문은 옵션 단위로 관리됩니다. 각 옵션의 판매가는{" "}
        {basePrice !== null ? (
          <>
            기본 판매가 <span className="krw font-semibold text-ink-900">{krw(basePrice)}원</span>에
            추가 금액을 더한 값입니다.
          </>
        ) : (
          "기본 정보 탭의 판매가에 추가 금액을 더한 값입니다."
        )}
      </p>
      {!isNew && (
        <Help>
          옵션명·추가 금액·순서는 저장할 때 함께 반영됩니다. 재고는 이 화면에서 바꾸지 않고 재고 관리
          화면에서 입고·조정으로 처리합니다.
        </Help>
      )}

      {removed && (
        <div className="mt-4 flex items-center justify-between gap-3 border border-ink-200 bg-cream-100 px-4 py-2.5">
          <p className="text-xs leading-relaxed text-ink-600">
            &lsquo;{removed.variant.name.trim() || "이름 없는 옵션"}&rsquo; 을(를) 목록에서 뺐습니다.
            저장하면 되돌릴 수 없습니다.
          </p>
          <button
            type="button"
            onClick={restore}
            className="inline-flex shrink-0 items-center gap-1 text-xs text-forest-700 transition-colors hover:text-forest-800"
          >
            <Undo2 size={14} strokeWidth={1.5} />
            되돌리기
          </button>
        </div>
      )}

      {variants.length === 0 ? (
        <div className="mt-6 border border-dashed border-ink-300 py-12 text-center">
          <p className="headline-serif text-ink-500">등록된 옵션이 없습니다.</p>
          <p className="mt-1 text-xs text-ink-400">옵션 없이 판매하면 상품 재고가 사용됩니다.</p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {variants.map((v, i) => (
            <VariantRow
              key={v.id ?? `new-${i}`}
              variant={v}
              index={i}
              total={variants.length}
              basePrice={basePrice}
              duplicated={duplicated.has(i)}
              onUpdate={(patch) => update(i, patch)}
              onMove={(direction) => move(i, direction)}
              onRemove={() => requestRemove(i)}
            />
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={add}
          disabled={atLimit}
          className="border border-dashed border-ink-300 px-4 py-2.5 text-sm text-ink-500 transition-colors hover:border-forest-600 hover:text-forest-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          옵션 추가
        </button>
        <span className={`text-xs ${atLimit ? "text-signal-amber" : "text-ink-400"}`}>
          옵션 <span className="krw">{variants.length}</span> /{" "}
          <span className="krw">{MAX_VARIANTS}</span>개
          {atLimit && " — 상한에 닿아 더 추가할 수 없습니다. 하나를 빼고 다시 시도해 주세요."}
        </span>
      </div>

      <ConfirmDialog
        open={pending !== null}
        onClose={() => setConfirmIndex(null)}
        onConfirm={() => {
          if (confirmIndex !== null) drop(confirmIndex);
          setConfirmIndex(null);
        }}
        title="이 옵션을 뺄까요?"
        description={
          pending
            ? `'${pending.name.trim() || "이름 없는 옵션"}' 에는 재고가 ${
                pending.expectedStock ?? 0
              }개 남아 있습니다.\n저장하면 이 옵션의 재고와 지금까지의 입고·출고 기록 연결이 사라지고 되돌릴 수 없습니다.\n잠시 판매만 멈추려면 빼는 대신 '판매 활성' 을 꺼 주세요.`
            : ""
        }
        confirmLabel="목록에서 빼기"
        danger
      />
    </div>
  );
}
