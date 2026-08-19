/* ============================================================
   가격 일괄 조정 미리보기 계산.

   모달(PriceAdjustModal)에서 떼어 낸 이유는 두 가지다.
   1) 모달이 400줄을 넘겼다.
   2) 여기서 세는 것들(정가 역전 · 옵션 추가금액 · 적용 불가 사유)은 화면이 아니라
      **판단**이다. 화면 코드 사이에 끼워 두면 조건이 하나 늘 때마다 JSX 안에서
      계산이 자라고, 결국 "표에 보이는 숫자"와 "버튼이 켜지는 조건"이 갈라진다.

   실제 저장은 서버가 하지만 계산식은 price-math.ts 하나뿐이므로,
   여기서 보이는 값과 저장되는 값은 어긋날 수 없다.
   ============================================================ */

import {
  PERCENT_MAX,
  PERCENT_MIN,
  PRICE_MAX,
  PRICE_TARGET_LABELS,
  adjustPrice,
  parsePlan,
  type PriceAdjustPlan,
} from "./price-math";
import type { ProductListRow } from "./list-types";

export interface PricePreviewRow {
  id: string;
  name: string;
  before: number | null;
  after: number | null;
  /** 건너뛰는 이유 (있으면 값은 바뀌지 않는다) */
  skip: string | null;
  /** 판매가를 바꿀 때만 계산하는 변경 후 마진율 */
  margin: number | null;
  /** 판매중인데 판매가가 0원이 되어 서버가 거절할 행 */
  blocked: boolean;
  /** 바뀐 판매가가 정가를 넘어서는 행 — 고객 화면의 할인 취소선이 조용히 사라진다 */
  compareAt: number | null;
  overCompare: boolean;
  /** 이 상품이 가진 '추가 금액이 붙은 옵션' 수 — 0이면 판매가만으로 값이 결정된다 */
  surchargedVariants: number;
}

export interface PricePreview {
  rows: PricePreviewRow[];
  /** 실제로 바뀌는 행 */
  changing: PricePreviewRow[];
  /** 판매중 + 0원이라 서버가 거절할 행 */
  blocked: PricePreviewRow[];
  /** 정가를 넘어서는 행 */
  overCompare: PricePreviewRow[];
  /** 추가 금액이 붙은 옵션을 가진 채로 판매가가 바뀌는 상품 */
  withSurcharge: PricePreviewRow[];
}

const EMPTY: PricePreview = {
  rows: [],
  changing: [],
  blocked: [],
  overCompare: [],
  withSurcharge: [],
};

export function buildPricePreview(
  rows: ProductListRow[],
  plan: PriceAdjustPlan | null
): PricePreview {
  if (!plan) return EMPTY;

  const previewRows = rows.map<PricePreviewRow>((row) => {
    const before = row[plan.target] ?? null;
    const after = adjustPrice(before, plan);

    let skip: string | null = null;
    if (after === null) skip = `${PRICE_TARGET_LABELS[plan.target]}가 비어 있어 건너뜁니다`;
    else if (after === before) skip = "바뀌는 값이 없습니다";

    const touchesPrice = plan.target === "price" && skip === null;
    const nextPrice = touchesPrice && after !== null ? after : row.price;
    const margin =
      plan.target === "price" && row.cost_price != null && nextPrice > 0
        ? Math.round(((nextPrice - row.cost_price) / nextPrice) * 1000) / 10
        : null;

    return {
      id: row.id,
      name: row.name,
      before,
      after,
      skip,
      margin,
      blocked: plan.target === "price" && row.status === "active" && after === 0,
      compareAt: row.compare_at_price,
      // 정가가 있고, 바뀐 판매가가 그 위로 올라서는 경우만 경고한다.
      // (정가 자체를 조정하는 중이면 비교 대상이 움직이므로 따지지 않는다.)
      overCompare:
        touchesPrice &&
        row.compare_at_price != null &&
        after !== null &&
        after > row.compare_at_price,
      surchargedVariants: touchesPrice
        ? (row.product_variants ?? []).filter((v) => v.price_delta !== 0).length
        : 0,
    };
  });

  const changing = previewRows.filter((r) => !r.skip && !r.blocked);
  return {
    rows: previewRows,
    changing,
    blocked: previewRows.filter((r) => r.blocked),
    overCompare: changing.filter((r) => r.overCompare),
    withSurcharge: changing.filter((r) => r.surchargedVariants > 0),
  };
}

/**
 * 이 조정을 서버가 받아 줄 수 없는 이유를 한국어로 돌려준다 (문제없으면 null).
 *
 * 예전에는 화면이 아무것도 검사하지 않아, 8 대신 800 을 친 사람이 미리보기까지 다 본 뒤
 * "요청한 변경 내용을 이해하지 못했습니다" 만 보고 대상·방식·끝자리를 전부 다시 골라야 했다.
 * 판정은 서버와 같은 함수(parsePlan)로 하고, 여기서는 **왜 걸렸는지**만 말로 옮긴다.
 */
export function describePlanIssue(plan: PriceAdjustPlan | null): string | null {
  if (!plan) return null;
  if (parsePlan(plan)) return null;

  if (plan.mode === "percent") {
    return `퍼센트는 ${PERCENT_MIN}% 부터 ${PERCENT_MAX.toLocaleString("ko-KR")}% 까지만 넣을 수 있습니다. (${plan.value.toLocaleString("ko-KR")}% 는 자릿수를 잘못 누른 값일 가능성이 큽니다)`;
  }
  if (plan.mode === "set" && plan.value < 0) {
    return "정할 금액은 0원보다 작을 수 없습니다.";
  }
  if (Math.abs(plan.value) > PRICE_MAX) {
    return `금액은 ${PRICE_MAX.toLocaleString("ko-KR")}원까지만 다룰 수 있습니다.`;
  }
  return "입력한 값으로는 가격을 바꿀 수 없습니다. 숫자를 다시 확인해 주세요.";
}
