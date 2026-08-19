"use client";

/* ============================================================
   VIP 전용가·캠페인가를 정할 때 늘 함께 보여야 하는 숫자들.

   왜 만들었나:
   가격을 매기는 화면에 기준 금액과 할인율만 있고 원가가 없었다.
   대표가 40% 할인을 걸거나 캠페인가를 손으로 찍을 때 그 값이 원가 아래인지
   화면에서 알 수 없어, 매번 엑셀 원가표를 따로 열어 대조해야 했다.
   실수하면 팔수록 손해 나는 가격이 그대로 고객에게 열린다.

   같은 표시를 전용가 모달과 캠페인 폼 두 곳에서 쓰므로 여기 한 벌만 둔다 —
   따로 만들면 또 다른 말로 갈라진다(그렇게 "정가"가 두 금액을 가리키게 됐다).
   ============================================================ */

import { margin, PRICE_LABELS, VIP_BASE_PRICE_LABEL, won } from "@/lib/admin-labels";

/** 적용가가 원가 아래인가 — 원가를 모르면 판단하지 않는다(false) */
export function isBelowCost(applied: number | null, cost: number | null | undefined): boolean {
  return applied != null && cost != null && applied < cost;
}

/** 상품명 아래 한 줄 — 기준이 되는 금액과 원가 */
export function BasePriceLine({ price, cost }: { price: number; cost: number | null }) {
  return (
    <p className="krw text-xs text-ink-400">
      {VIP_BASE_PRICE_LABEL} {won(price)}
      {cost != null ? ` · ${PRICE_LABELS.cost} ${won(cost)}` : ` · ${PRICE_LABELS.cost} 미입력`}
    </p>
  );
}

/** 입력한 값 옆 한 줄 — 남는 돈이 얼마인지 즉시 알려 준다 */
export function MarginLine({
  applied,
  cost,
}: {
  applied: number | null;
  cost: number | null;
}) {
  if (applied == null) return null;
  // 원가가 없다는 사실은 바로 위 BasePriceLine 이 이미 '원가 미입력'으로 말한다.
  // 여기서 또 문장을 얹으면 좁은 칸에서 세 줄로 접혀 정작 할인율을 가린다.
  if (cost == null) return null;
  if (applied < cost) {
    return (
      <span className="text-xs font-medium text-signal-red">
        원가보다 {won(cost - applied)} 낮습니다
      </span>
    );
  }
  const m = margin(applied, cost);
  return (
    <span className="krw text-xs text-ink-500">
      마진 +{won(m ? m.amount : 0)} ({m ? Math.round(m.rate) : 0}%)
    </span>
  );
}
