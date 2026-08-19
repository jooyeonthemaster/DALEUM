/* ============================================================
   쿠폰이 "지금 실제로 쓰이는가" 를 판정한다.

   목록에 켜짐 스위치만 있으면 관리자는 "켜 두었는데 왜 안 되냐" 를 스스로 풀 수 없다.
   실제로는 네 가지가 함께 정한다 — 켜짐 여부·시작일·종료일·소진 여부.
   판정 기준은 src/lib/orders.ts 의 validateCoupon(155-165행) 과 같아야 한다.
   ============================================================ */

import { formatDate } from "@/lib/format";
import { TOGGLE_LABELS, won } from "@/lib/admin-labels";
import type { Coupon } from "@/lib/types";

export type CouponState = "live" | "scheduled" | "ended" | "usedUp" | "off";

export const STATE_LABELS: Record<CouponState, string> = {
  live: "지금 사용 가능",
  scheduled: "시작 전",
  ended: "기간 종료",
  usedUp: "모두 소진",
  off: TOGGLE_LABELS.off,
};

export const STATE_TONE: Record<CouponState, string> = {
  live: "bg-forest-100 text-forest-800",
  scheduled: "bg-cream-100 text-ink-600",
  ended: "bg-cream-100 text-ink-400",
  usedUp: "bg-cream-100 text-signal-red",
  off: "bg-cream-100 text-ink-400",
};

export function couponState(c: Coupon, now: Date): CouponState {
  if (!c.is_active) return "off";
  if (c.usage_limit !== null && c.used_count >= c.usage_limit) return "usedUp";
  if (c.starts_at && new Date(c.starts_at) > now) return "scheduled";
  if (c.ends_at && new Date(c.ends_at) < now) return "ended";
  return "live";
}

/** 종료까지 남은 일수 — 종료일이 없으면 null */
export function daysLeft(c: Coupon, now: Date): number | null {
  if (!c.ends_at) return null;
  return Math.ceil((new Date(c.ends_at).getTime() - now.getTime()) / 86400000);
}

/** 남은 수량 문구 — 총 한도가 없으면 제한 없음 */
export function remainingText(c: Coupon): string {
  if (c.usage_limit === null) return "남은 수량 제한 없음";
  return `${Math.max(0, c.usage_limit - c.used_count).toLocaleString("ko-KR")}회 남음`;
}

export function benefitText(c: Coupon): string {
  if (c.discount_type === "rate") {
    return c.max_discount ? `${c.value}% 할인 (최대 ${won(c.max_discount)})` : `${c.value}% 할인`;
  }
  return `${won(c.value)} 할인`;
}

export function periodText(c: Coupon): string {
  if (!c.starts_at && !c.ends_at) return "제한 없음";
  const from = c.starts_at ? formatDate(c.starts_at) : "";
  const to = c.ends_at ? formatDate(c.ends_at) : "";
  if (from && !to) return `${from}부터`;
  if (!from && to) return `${to}까지`;
  return `${from} – ${to}`;
}
