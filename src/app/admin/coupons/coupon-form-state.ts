/* ============================================================
   쿠폰 폼 상태 ↔ 저장 형식 ↔ 저장 전 검사.

   검사를 화면 쪽에도 두는 이유: 서버까지 갔다가 거절당하면 어느 칸이
   문제인지 흐려진다. 실제로 '금액 할인 5000' 을 퍼센트로 잘못 골라 5,000% 를
   넣으면 서버(api/admin/coupons/validation.ts)에서야 막혔고, 대표는 무엇이
   잘못됐는지 몰라 시도를 포기했다.
   ============================================================ */

import { DISCOUNT_TYPE_LABELS } from "@/lib/admin-labels";
import type { Coupon } from "@/lib/types";
import { toInt, type DiscountKind } from "./coupon-math";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** ISO → KST 기준 yyyy-mm-dd */
function isoToKstDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(new Date(iso).getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export interface CouponForm {
  code: string;
  name: string;
  discount_type: DiscountKind;
  value: string;
  min_order: string;
  max_discount: string;
  starts_at: string;
  ends_at: string;
  usage_limit: string;
  per_user_limit: string;
  is_active: boolean;
}

export const EMPTY_COUPON_FORM: CouponForm = {
  code: "",
  name: "",
  discount_type: "rate",
  value: "",
  min_order: "0",
  max_discount: "",
  starts_at: "",
  ends_at: "",
  usage_limit: "",
  per_user_limit: "1",
  is_active: true,
};

export function toForm(c: Coupon): CouponForm {
  return {
    code: c.code,
    name: c.name,
    discount_type: c.discount_type,
    value: String(c.value),
    min_order: String(c.min_order),
    max_discount: c.max_discount === null ? "" : String(c.max_discount),
    starts_at: isoToKstDate(c.starts_at),
    ends_at: isoToKstDate(c.ends_at),
    usage_limit: c.usage_limit === null ? "" : String(c.usage_limit),
    per_user_limit: String(c.per_user_limit),
    is_active: c.is_active,
  };
}

export function toPayload(f: CouponForm): Record<string, unknown> {
  return {
    code: f.code,
    name: f.name,
    discount_type: f.discount_type,
    value: f.value,
    min_order: f.min_order || 0,
    max_discount: f.discount_type === "rate" && f.max_discount !== "" ? f.max_discount : null,
    starts_at: f.starts_at ? `${f.starts_at}T00:00:00+09:00` : null,
    ends_at: f.ends_at ? `${f.ends_at}T23:59:59+09:00` : null,
    usage_limit: f.usage_limit !== "" ? f.usage_limit : null,
    per_user_limit: f.per_user_limit || 1,
    is_active: f.is_active,
  };
}

/** 통과하면 null, 막아야 하면 사람 말로 된 이유 */
export function validateCouponForm(f: CouponForm): string | null {
  if (!/^[A-Z0-9_-]{2,30}$/.test(f.code.trim())) {
    return "쿠폰 코드는 영문 대문자·숫자와 -, _ 만 써서 2~30자로 넣어 주세요.";
  }
  if (!f.name.trim()) return "쿠폰 이름을 입력해 주세요.";
  if (f.name.trim().length > 60) return "쿠폰 이름을 60자 이내로 줄여 주세요.";

  const value = toInt(f.value);
  if (value === null || value <= 0) return "얼마를 깎아 줄지 입력해 주세요.";
  if (f.discount_type === "rate" && value > 100) {
    return `${DISCOUNT_TYPE_LABELS.rate}은 100%를 넘을 수 없습니다. 금액으로 깎으려면 할인 방식을 ${DISCOUNT_TYPE_LABELS.fixed}으로 바꿔 주세요.`;
  }

  if ((toInt(f.min_order) ?? 0) < 0) return "최소 주문금액은 0원 이상이어야 합니다.";

  if (f.discount_type === "rate" && f.max_discount !== "") {
    const max = toInt(f.max_discount);
    if (max === null || max <= 0) return "최대 할인금액은 1원 이상으로 넣거나 비워 두세요.";
  }

  if (f.usage_limit !== "") {
    const usage = toInt(f.usage_limit);
    if (usage === null || usage < 1) {
      return "총 사용 가능 횟수는 1회 이상으로 넣거나 비워 두세요.";
    }
  }
  if ((toInt(f.per_user_limit) ?? 1) < 1) {
    return "한 사람이 쓸 수 있는 횟수는 1회 이상이어야 합니다.";
  }

  if (f.starts_at && f.ends_at && f.ends_at < f.starts_at) {
    return "사용 종료일이 시작일보다 빠릅니다. 두 날짜를 다시 확인해 주세요.";
  }
  return null;
}
