"use client";

/* ============================================================
   옵션 표 — 한 상품의 10입 / 20입 / 30입

   왜 생겼는가:
   실제 품목표는 한 제품이 입수별로 여러 줄이다. 그런데 초안 자료형에 옵션 칸이
   아예 없어서, 엑셀의 20입·30입 줄이 통째로 버려지고 안내조차 없었다.
   대표는 18줄을 올렸는데 7개만 들어온 걸 눈치채지 못했다.

   가격은 **대표 가격 대비 차액**으로 다룬다(서버 product_variants.price_delta 와 같은 뜻).
   그래서 판매가만 고쳐도 옵션 가격이 함께 따라 움직인다.
   ============================================================ */

import { Plus, X } from "lucide-react";
import { Input } from "@/components/admin/Field";
import { MAX_VARIANTS, emptyVariant, toNumeric, type VariantDraft } from "./bulk-types";

export interface VariantTableProps {
  basePrice: string;
  value: VariantDraft[];
  onChange: (next: VariantDraft[]) => void;
  disabled?: boolean;
}

export default function VariantTable({
  basePrice,
  value,
  onChange,
  disabled = false,
}: VariantTableProps) {
  const base = toNumeric(basePrice) ?? 0;

  function patch(id: string, next: Partial<VariantDraft>) {
    onChange(value.map((row) => (row.id === id ? { ...row, ...next } : row)));
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-ink-700">
          옵션
          {value.length > 0 && <span className="krw ml-1.5 text-xs text-ink-400">{value.length}개</span>}
        </span>
        <button
          type="button"
          disabled={disabled || value.length >= MAX_VARIANTS}
          title={value.length >= MAX_VARIANTS ? `옵션은 ${MAX_VARIANTS}개까지 만들 수 있습니다` : undefined}
          onClick={() => onChange([...value, emptyVariant()])}
          className="inline-flex items-center gap-1 border border-ink-200 px-2.5 py-1.5 text-xs text-ink-700 transition-colors hover:bg-cream-100 disabled:opacity-50"
        >
          <Plus size={13} strokeWidth={1.5} />
          옵션 추가
        </button>
      </div>

      {value.length === 0 ? (
        <p className="border border-dashed border-ink-200 px-3 py-4 text-center text-xs text-ink-400">
          옵션이 없습니다. 10입·20입처럼 포장 단위가 여러 개면 옵션으로 추가하세요.
        </p>
      ) : (
        <ul className="space-y-2">
          {value.map((row, index) => {
            const delta = toNumeric(row.priceDelta) ?? 0;
            const finalPrice = base + delta;
            return (
              <li key={row.id} className="border border-ink-100 bg-cream-100/60 p-2.5">
                <div className="flex flex-wrap items-end gap-2">
                  <label className="min-w-28 flex-1">
                    <span className="mb-1 block text-[11px] text-ink-400">옵션 이름</span>
                    <Input
                      value={row.name}
                      disabled={disabled}
                      placeholder="10입"
                      onChange={(e) => patch(row.id, { name: e.target.value })}
                      aria-label={`${index + 1}번째 옵션 이름`}
                    />
                  </label>
                  <label className="min-w-24 flex-1">
                    <span className="mb-1 block text-[11px] text-ink-400">기본가와의 차액</span>
                    <Input
                      value={row.priceDelta}
                      disabled={disabled}
                      inputMode="numeric"
                      onChange={(e) => patch(row.id, { priceDelta: e.target.value })}
                      aria-label={`${index + 1}번째 옵션 차액`}
                    />
                  </label>
                  <label className="min-w-20 flex-1">
                    <span className="mb-1 block text-[11px] text-ink-400">재고</span>
                    <Input
                      value={row.stock}
                      disabled={disabled}
                      inputMode="numeric"
                      onChange={(e) => patch(row.id, { stock: e.target.value })}
                      aria-label={`${index + 1}번째 옵션 재고`}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange(value.filter((r) => r.id !== row.id))}
                    aria-label={`${index + 1}번째 옵션 삭제`}
                    className="mb-1 shrink-0 p-2 text-ink-400 transition-colors hover:text-signal-red disabled:opacity-50"
                  >
                    <X size={15} strokeWidth={1.5} />
                  </button>
                </div>
                <p className="krw mt-1.5 text-xs text-ink-500">
                  고객이 내는 금액 {finalPrice.toLocaleString("ko-KR")}원
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
