import { calcShippingFee } from "@/lib/shipping";
import type { ShippingSettings } from "@/lib/types";

/* ============================================================
   쿠폰이 실제로 얼마를 깎는지 — 화면 미리보기가 서버와 어긋나면 안 된다.

   여기 계산식은 src/lib/orders.ts 의 validateCoupon(153-181행) 을 그대로 옮긴 것이다.
   (그 파일은 이번 파도에서 수정 금지라 가져다 쓸 수 없어 계산만 같은 규칙으로 복제한다.
    바뀌면 두 곳을 함께 고쳐야 한다.)
   ============================================================ */

export type DiscountKind = "rate" | "fixed";

export interface CouponRule {
  discount_type: DiscountKind;
  value: number;
  min_order: number;
  max_discount: number | null;
}

export interface CouponOutcome {
  /** 최소 주문금액에 못 미쳐 아예 쓸 수 없는 경우 */
  belowMinimum: boolean;
  discount: number;
  payable: number;
  /** 최대 할인금액에 걸려 깎인 경우 */
  cappedByMax: boolean;
}

/** 상품 합계(itemsTotal)에 이 쿠폰을 적용하면 어떻게 되는가 */
export function applyCoupon(rule: CouponRule, itemsTotal: number): CouponOutcome {
  if (itemsTotal < rule.min_order) {
    return { belowMinimum: true, discount: 0, payable: itemsTotal, cappedByMax: false };
  }
  let discount =
    rule.discount_type === "rate"
      ? Math.floor((itemsTotal * rule.value) / 100)
      : rule.value;
  const raw = discount;
  if (rule.discount_type === "rate" && rule.max_discount != null) {
    discount = Math.min(discount, rule.max_discount);
  }
  discount = Math.max(0, Math.min(discount, itemsTotal));
  return {
    belowMinimum: false,
    discount,
    payable: itemsTotal - discount,
    cappedByMax: discount < raw,
  };
}

/** 숫자 입력칸의 문자열을 정수로 — 빈 값은 null */
export function toInt(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/* ============================================================
   배송비까지 포함한 "고객이 실제로 내는 돈".

   왜 따로 두는가:
   applyCoupon 의 payable 은 **상품 금액 합계에서 쿠폰만 뺀 값**이다.
   실제 결제액은 src/lib/orders.ts:352-354 가

       shippingFee = calcShippingFee(itemsTotal - couponDiscount, settings)
       total       = subtotal - discountTotal + shippingFee

   로 계산한다. 즉 배송비 문턱(기본 40,000원)은 **쿠폰을 뺀 뒤 금액**으로 판정한다.
   그래서 45,000원 주문에 20% 쿠폰을 쓰면 36,000원이 되어 문턱 아래로 떨어지고
   배송비 3,500원이 되살아난다 — 미리보기가 36,000원이라고 말하던 그 자리에서
   고객은 39,500원을 낸다. 할인 9,000원을 받고 배송비 3,500원을 다시 내니
   실제로 아끼는 돈은 5,500원이다.

   계산은 반드시 lib/shipping.ts 의 calcShippingFee 를 **그대로 불러서** 한다.
   여기서 문턱 판정을 다시 구현하면 배송 설정을 바꾼 날 두 곳이 갈라진다.
   ============================================================ */

export interface CheckoutOutcome extends CouponOutcome {
  /** 쿠폰을 적용한 뒤 붙는 배송비 */
  shippingFee: number;
  /** 쿠폰을 쓰지 않았다면 붙었을 배송비 */
  shippingFeeWithout: number;
  /** 쿠폰 때문에 무료배송 문턱이 무너졌는가 (쿠폰 없으면 무료인데 쓰면 유료) */
  losesFreeShipping: boolean;
  /** 고객이 실제로 결제하는 금액 = 상품 금액 - 할인 + 배송비 */
  total: number;
  /** 배송비까지 감안했을 때 고객이 실제로 아끼는 돈 */
  netSaving: number;
}

export function applyCouponWithShipping(
  rule: CouponRule,
  itemsTotal: number,
  shipping: ShippingSettings
): CheckoutOutcome {
  const outcome = applyCoupon(rule, itemsTotal);
  const shippingFee = calcShippingFee(outcome.payable, shipping);
  const shippingFeeWithout = calcShippingFee(itemsTotal, shipping);
  return {
    ...outcome,
    shippingFee,
    shippingFeeWithout,
    losesFreeShipping: shippingFeeWithout === 0 && shippingFee > 0,
    total: outcome.payable + shippingFee,
    // 배송비가 되살아나면 깎인 금액만큼 아끼는 게 아니다
    netSaving: outcome.discount - (shippingFee - shippingFeeWithout),
  };
}
