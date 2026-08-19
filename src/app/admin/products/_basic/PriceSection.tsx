"use client";

/* ============================================================
   가격 블록 — 판매가·정가·원가를 받는 자리에서 마진까지 바로 계산해 준다.

   왜 만들었나:
   옛 화면은 세 칸을 나란히 놓고 값을 받기만 했다. "이 상품 남는 게 얼마냐" 를 알려면
   대표가 계산기로 19,800-14,300=5,500, 5,500/19,800=27.8% 를 직접 두드려야 했고
   상품이 27개면 27번 반복해야 했다. 원가를 넣을 이유가 사라져 결국 아무도 원가를 관리하지 않는다.
   정가를 판매가보다 낮게 넣는 실수(두 칸을 바꿔 넣음)도 아무도 막지 않아서,
   저장은 되는데 고객 화면에는 할인 표시가 안 나오고 이유를 알 수 없었다.

   그래서 이 블록은 값을 받는 그 자리에서
   마진액·마진율·원가율·할인율을 실시간으로 계산하고, 모순된 조합은 즉시(막지는 않고) 알린다.
   ============================================================ */

import type { ReactNode } from "react";
import { Help, Label } from "@/components/admin/Field";
import { discountRate, krw } from "@/lib/format";
import { parseNumberField, type FormState } from "../form-types";
import NumberField from "./NumberField";

export interface PriceSectionProps {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
}

/** 주의 문구 한 줄 — 빨강은 '고치지 않으면 사고', 주황은 '확인해 보세요' */
function Note({ tone, children }: { tone: "warn" | "danger"; children: ReactNode }) {
  return (
    <p
      className={`mt-1.5 text-xs leading-relaxed ${
        tone === "danger" ? "text-signal-red" : "text-signal-amber"
      }`}
    >
      {children}
    </p>
  );
}

export default function PriceSection({ form, set }: PriceSectionProps) {
  const priceState = parseNumberField(form.price);
  const compareState = parseNumberField(form.compare_at_price);
  const costState = parseNumberField(form.cost_price);

  const price = priceState.kind === "ok" ? priceState.value : null;
  const compare = compareState.kind === "ok" ? compareState.value : null;
  const cost = costState.kind === "ok" ? costState.value : null;

  const margin = price != null && cost != null ? price - cost : null;
  // 마진율은 판매가 기준(원가율과 합이 100이 되는 쪽). 판매가 0원이면 나눗셈 자체가 성립하지 않는다.
  const marginRate = margin != null && price != null && price > 0 ? (margin / price) * 100 : null;
  const marginTone =
    marginRate == null ? "ok" : marginRate < 0 ? "danger" : marginRate < 10 ? "warn" : "ok";

  /** 정가와 판매가를 서로 바꿔 넣은 실수를 한 번에 되돌린다 */
  function swapPriceAndCompare() {
    const nextPrice = form.compare_at_price;
    set("compare_at_price", form.price);
    set("price", nextPrice);
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="p-price" requiredMark>
            판매가
          </Label>
          <NumberField
            id="p-price"
            value={form.price}
            onChange={(v) => set("price", v)}
            placeholder="예: 19,800"
            suffix="원"
            invalid={priceState.kind === "invalid"}
          />
          <Help>고객이 실제로 결제하는 금액입니다.</Help>
          {priceState.kind === "invalid" && (
            <Note tone="danger">숫자로 읽을 수 없습니다. 숫자만 넣어 주세요.</Note>
          )}
        </div>

        <div>
          <Label htmlFor="p-compare">정가</Label>
          <NumberField
            id="p-compare"
            value={form.compare_at_price}
            onChange={(v) => set("compare_at_price", v)}
            placeholder="할인 전 원래 가격"
            suffix="원"
            invalid={compareState.kind === "invalid"}
          />
          <Help>판매가보다 높게 넣어야 고객 화면에 취소선과 할인율이 표시됩니다. 비워도 됩니다.</Help>
          {compareState.kind === "invalid" && (
            <Note tone="danger">숫자로 읽을 수 없습니다. 숫자만 넣어 주세요.</Note>
          )}
        </div>

        <div>
          <Label htmlFor="p-cost">원가</Label>
          <NumberField
            id="p-cost"
            value={form.cost_price}
            onChange={(v) => set("cost_price", v)}
            placeholder="매입가 · 관리자만 봅니다"
            suffix="원"
            invalid={costState.kind === "invalid"}
          />
          <Help>고객에게는 보이지 않습니다. 넣어 두면 마진을 자동으로 계산합니다.</Help>
          {costState.kind === "invalid" && (
            <Note tone="danger">숫자로 읽을 수 없습니다. 숫자만 넣어 주세요.</Note>
          )}
        </div>
      </div>

      {/* 계산 요약 — 계산기를 따로 켜지 않아도 되게 */}
      <div className="mt-4 border border-ink-100 bg-cream-100 px-4 py-3">
        {price == null ? (
          <p className="text-sm text-ink-400">판매가를 넣으면 마진과 할인율을 여기서 계산해 드립니다.</p>
        ) : (
          <>
            <p className="text-sm text-ink-700">
              <span className="krw">판매가 {krw(price)}원</span>
              {compare != null && compare > price && (
                <span className="krw text-forest-700">
                  {" "}
                  · 정가 대비 {discountRate(compare, price)}% 할인 ({krw(compare - price)}원 인하)
                </span>
              )}
            </p>

            {cost == null ? (
              <Help>
                원가를 넣으면 마진액·마진율·원가율을 이 자리에서 바로 보여드립니다.
              </Help>
            ) : (
              <p
                className={`krw mt-1 text-sm ${
                  marginTone === "danger"
                    ? "text-signal-red"
                    : marginTone === "warn"
                      ? "text-signal-amber"
                      : "text-forest-700"
                }`}
              >
                마진 {krw(margin ?? 0)}원
                {marginRate != null && (
                  <>
                    {" "}
                    · 마진율 {marginRate.toFixed(1)}% · 원가율 {(100 - marginRate).toFixed(1)}%
                  </>
                )}
              </p>
            )}

            {margin != null && margin < 0 && (
              <Note tone="danger">
                원가가 판매가보다 높습니다. 지금 이대로 팔면 한 개당 {krw(-margin)}원 손해입니다.
              </Note>
            )}
            {marginRate != null && marginRate >= 0 && marginRate < 10 && (
              <Note tone="warn">마진율이 10%가 되지 않습니다. 가격을 다시 확인해 주세요.</Note>
            )}

            {price === 0 && form.status === "active" && (
              <Note tone="danger">
                판매가가 0원이면 &lsquo;판매중&rsquo; 으로 저장할 수 없습니다. 판매가를 먼저 넣어 주세요.
              </Note>
            )}
            {price === 0 && form.status !== "active" && (
              <Note tone="warn">
                판매가가 0원입니다. 이대로는 판매 상태를 &lsquo;판매중&rsquo; 으로 바꿀 수 없습니다.
              </Note>
            )}

            {compare != null && compare > 0 && compare <= price && (
              <div className="mt-1.5">
                <Note tone="danger">
                  정가가 판매가보다 낮거나 같습니다. 이대로 저장하면 고객 화면에 할인 표시가 나가지 않습니다.
                  두 칸을 바꿔 넣으신 건 아닌지 확인해 주세요.
                </Note>
                <button
                  type="button"
                  onClick={swapPriceAndCompare}
                  className="mt-1.5 border border-ink-200 bg-cream-50 px-3 py-1.5 text-xs text-ink-700 transition-colors hover:border-forest-600 hover:text-forest-700"
                >
                  판매가와 정가 바꾸기
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
