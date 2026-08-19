"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { Input, Select } from "@/components/admin/Field";
import { VIP_BASE_PRICE_LABEL, won } from "@/lib/admin-labels";
import { discountRate } from "@/lib/format";
import ProductPickerModal from "../../_components/ProductPickerModal";
import { BasePriceLine, isBelowCost, MarginLine } from "../../_components/PriceMeta";
import { BTN_GHOST, previewRatePrice } from "../../_components/vipApi";
import { itemPrice, type ItemDraft } from "./campaignDraft";

/* ============================================================
   캠페인에 담을 상품과 그 가격.

   무엇이 문제였나:
   · 상품을 1건씩 검색해 담고, 담은 상품마다 가격을 손으로 찍어야 했다.
     '전 품목 25% 할인' 같은 가장 흔한 요구를 한 번에 반영할 방법이 없어
     계산기와 씨름하다 오타를 냈다.
   · 기준 금액을 '정가'라고 불렀다 — 상품 폼의 정가(할인 전 표시가)와 다른
     금액인데 같은 말을 써서 캠페인가를 잘못 매기게 만들었다.
   · 원가가 없어 원가 이하로 파는지 알 수 없었다.
   ============================================================ */

export interface CampaignItemsProps {
  items: ItemDraft[];
  onChange: (next: ItemDraft[]) => void;
}

type BulkMode = "rate" | "amount";

export default function CampaignItems({ items, onChange }: CampaignItemsProps) {
  const [picking, setPicking] = useState(false);
  const [bulkMode, setBulkMode] = useState<BulkMode>("rate");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkError, setBulkError] = useState<string | null>(null);

  function patchItem(index: number, value: string) {
    onChange(items.map((item, i) => (i === index ? { ...item, value } : item)));
  }

  function moveItem(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  /** 담긴 상품 전부에 같은 규칙으로 값을 매긴다. 이후 개별 행만 손보면 된다. */
  function applyBulk() {
    const n = Number(bulkValue);
    if (!Number.isFinite(n) || n <= 0) {
      setBulkError("적용할 숫자를 넣어 주세요.");
      return;
    }
    if (bulkMode === "rate" && n > 100) {
      setBulkError("할인율은 100을 넘을 수 없습니다.");
      return;
    }
    setBulkError(null);
    onChange(
      items.map((item) => {
        // 퍼센트는 10원 단위로 내려 맞춘다(고객 화면 VIP 가격과 같은 규칙)
        const next =
          bulkMode === "rate"
            ? previewRatePrice(item.price, n)
            : Math.max(1, item.price - Math.round(n));
        return { ...item, value: String(Math.max(1, Math.min(next, item.price))) };
      })
    );
  }

  const priced = items.map((item) => itemPrice(item));
  const baseSum = items.reduce((sum, item) => sum + item.price, 0);
  const campaignSum = priced.reduce<number | null>(
    (sum, value) => (sum === null || value === null ? null : sum + value),
    0
  );
  const avgRate =
    campaignSum !== null && baseSum > 0
      ? Math.round(((baseSum - campaignSum) / baseSum) * 100)
      : null;

  return (
    <section className="mt-4 border border-ink-200 bg-cream-50 p-5">
      <h2 className="mb-2 text-sm font-medium text-ink-900">담을 상품과 가격</h2>
      <p className="mb-3 text-sm leading-relaxed text-ink-500">
        상품을 담고, 이 캠페인에서만 적용할 가격을 정하세요. 위에서부터 순서대로 진열됩니다.
      </p>

      {/* 쿠폰 중복 — 코드가 실제로 그렇게 동작한다(주문 계산이 캠페인가 위에 쿠폰을 한 번 더 뺀다) */}
      <p className="mb-3 border border-signal-amber/40 bg-[#fbf3e4] px-4 py-2.5 text-xs leading-relaxed text-ink-700">
        쿠폰은 이 캠페인가 <strong>위에 한 번 더</strong> 적용됩니다. 예를 들어 캠페인가 20,000원인
        상품에 고객이 20% 쿠폰을 쓰면 16,000원에 결제됩니다. 겹치면 안 되는 기간에는 쿠폰을 잠시
        꺼 두세요.
      </p>

      <button type="button" onClick={() => setPicking(true)} className={BTN_GHOST}>
        상품 담기
      </button>

      {items.length === 0 ? (
        <p className="mt-4 border border-dashed border-ink-300 px-4 py-8 text-center text-sm text-ink-400">
          아직 담긴 상품이 없습니다. ‘상품 담기’로 여러 개를 한 번에 고를 수 있습니다.
        </p>
      ) : (
        <>
          {/* 한꺼번에 값 매기기 */}
          <div className="mt-4 flex flex-wrap items-center gap-2 border border-ink-200 bg-cream-100 px-3 py-2.5">
            <span className="text-sm text-ink-700">담긴 {items.length}개에 한꺼번에</span>
            <Select
              value={bulkMode}
              onChange={(e) => setBulkMode(e.target.value as BulkMode)}
              className="w-32"
              aria-label="한꺼번에 적용하는 방식"
            >
              <option value="rate">퍼센트 할인</option>
              <option value="amount">금액 인하</option>
            </Select>
            <div className="relative w-28">
              <Input
                type="number"
                min={1}
                value={bulkValue}
                onChange={(e) => setBulkValue(e.target.value)}
                aria-label="한꺼번에 적용할 값"
                className="krw pr-8"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-400">
                {bulkMode === "rate" ? "%" : "원"}
              </span>
            </div>
            <button type="button" onClick={applyBulk} className={BTN_GHOST}>
              적용
            </button>
            {bulkError && <span className="text-xs text-signal-red">{bulkError}</span>}
          </div>

          <ul className="mt-3 divide-y divide-ink-100 border border-ink-200">
            {items.map((item, i) => {
              const applied = priced[i];
              const below = isBelowCost(applied, item.cost);
              return (
                <li
                  key={item.productId}
                  className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 ${
                    below ? "bg-[#f6e8e3]" : ""
                  }`}
                >
                  <div className="flex shrink-0 flex-col">
                    <button
                      type="button"
                      onClick={() => moveItem(i, -1)}
                      disabled={i === 0}
                      aria-label="위로 옮기기"
                      className="p-1 text-ink-400 transition-colors hover:text-forest-700 disabled:opacity-30"
                    >
                      <ArrowUp size={14} strokeWidth={1.5} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveItem(i, 1)}
                      disabled={i === items.length - 1}
                      aria-label="아래로 옮기기"
                      className="p-1 text-ink-400 transition-colors hover:text-forest-700 disabled:opacity-30"
                    >
                      <ArrowDown size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                  <span className="krw w-6 shrink-0 text-center text-xs text-ink-400">{i + 1}</span>
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="truncate text-sm text-ink-900">{item.name}</p>
                    <BasePriceLine price={item.price} cost={item.cost} />
                  </div>
                  <div className="relative w-36 shrink-0">
                    <Input
                      type="number"
                      min={1}
                      max={item.price}
                      step={10}
                      value={item.value}
                      onChange={(e) => patchItem(i, e.target.value)}
                      placeholder="캠페인가"
                      aria-label="캠페인가"
                      className="krw pr-9"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-400">
                      원
                    </span>
                  </div>
                  <div className="w-32 shrink-0 text-right">
                    {applied !== null ? (
                      <>
                        <p className="krw text-sm font-semibold text-forest-700">
                          {discountRate(item.price, applied)}% 할인
                        </p>
                        <MarginLine applied={applied} cost={item.cost} />
                      </>
                    ) : (
                      <span className="text-ink-300">—</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                    aria-label="상품 빼기"
                    className="shrink-0 p-1 text-ink-400 transition-colors hover:text-signal-red"
                  >
                    <X size={16} strokeWidth={1.5} />
                  </button>
                </li>
              );
            })}
          </ul>

          <p className="mt-3 text-right text-sm text-ink-600">
            {VIP_BASE_PRICE_LABEL} 합계 <span className="krw">{won(baseSum)}</span>
            <span className="mx-1.5 text-ink-300">→</span>
            캠페인가 합계{" "}
            <span className="krw font-semibold text-forest-700">
              {campaignSum !== null ? won(campaignSum) : "입력 중"}
            </span>
            {avgRate !== null && (
              <span className="ml-1.5 text-xs text-ink-400">(평균 {avgRate}% 할인)</span>
            )}
          </p>
        </>
      )}

      <ProductPickerModal
        open={picking}
        onClose={() => setPicking(false)}
        excludeIds={items.map((item) => item.productId)}
        onAdd={(products) =>
          onChange([
            ...items,
            ...products.map((p) => ({
              productId: p.id,
              name: p.name,
              price: p.price,
              cost: p.cost_price,
              value: "",
            })),
          ])
        }
      />
    </section>
  );
}
