"use client";

import { X } from "lucide-react";
import { Input, Toggle, Help } from "@/components/admin/Field";
import type { VariantDraft } from "./form-types";

export interface VariantsTabProps {
  variants: VariantDraft[];
  onChange: (variants: VariantDraft[]) => void;
  isNew: boolean;
}

/** 옵션 탭 — product_variants 행 추가/수정/삭제 */
export default function VariantsTab({ variants, onChange, isNew }: VariantsTabProps) {
  function update(index: number, patch: Partial<VariantDraft>) {
    onChange(variants.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  }

  function remove(index: number) {
    onChange(variants.filter((_, i) => i !== index));
  }

  function add() {
    onChange([
      ...variants,
      { id: null, name: "", price_delta: "0", stock: "0", sku: "", is_active: true },
    ]);
  }

  return (
    <div>
      <p className="text-sm leading-relaxed text-ink-600">
        옵션이 있으면 재고와 주문은 옵션 단위로 관리됩니다. 가격 차액은 판매가에 더해집니다.
      </p>
      {!isNew && (
        <Help>
          저장 시 기존 옵션의 재고를 바꾸면 &lsquo;조정&rsquo; 이력이, 새 옵션의 재고는
          &lsquo;최초 등록&rsquo; 이력이 자동으로 남습니다. 목록에서 지운 옵션은 삭제됩니다.
        </Help>
      )}

      {variants.length === 0 ? (
        <div className="mt-6 border border-dashed border-ink-300 py-12 text-center">
          <p className="headline-serif text-ink-500">등록된 옵션이 없습니다.</p>
          <p className="mt-1 text-xs text-ink-400">옵션 없이 판매하면 상품 재고가 사용됩니다.</p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {variants.map((v, i) => (
            <li key={v.id ?? `new-${i}`} className="border border-ink-200 bg-cream-50 p-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-[1fr_120px_100px_150px]">
                <div className="col-span-2 md:col-span-1">
                  <Input
                    value={v.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                    placeholder="옵션명 — 예: 소면 (2mm)"
                    aria-label={`옵션 ${i + 1} 이름`}
                  />
                  <p className="mt-1 text-xs text-ink-400">옵션명</p>
                </div>
                <div>
                  <Input
                    inputMode="numeric"
                    value={v.price_delta}
                    onChange={(e) => update(i, { price_delta: e.target.value })}
                    aria-label={`옵션 ${i + 1} 가격 차액`}
                  />
                  <p className="mt-1 text-xs text-ink-400">가격 차액 (원)</p>
                </div>
                <div>
                  <Input
                    inputMode="numeric"
                    value={v.stock}
                    onChange={(e) => update(i, { stock: e.target.value })}
                    aria-label={`옵션 ${i + 1} 재고`}
                  />
                  <p className="mt-1 text-xs text-ink-400">재고</p>
                </div>
                <div>
                  <Input
                    value={v.sku}
                    onChange={(e) => update(i, { sku: e.target.value })}
                    placeholder="선택"
                    aria-label={`옵션 ${i + 1} SKU`}
                  />
                  <p className="mt-1 text-xs text-ink-400">SKU</p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-ink-100 pt-3">
                <Toggle
                  checked={v.is_active}
                  onChange={(checked) => update(i, { is_active: checked })}
                  label="판매 활성"
                />
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="inline-flex items-center gap-1 text-xs text-ink-400 transition-colors hover:text-signal-red"
                >
                  <X size={14} strokeWidth={1.5} />
                  옵션 삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={add}
        disabled={variants.length >= 20}
        className="mt-4 border border-dashed border-ink-300 px-4 py-2 text-sm text-ink-500 transition-colors hover:border-forest-600 hover:text-forest-700 disabled:opacity-40"
      >
        옵션 추가
      </button>
    </div>
  );
}
