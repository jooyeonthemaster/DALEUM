/* 쿠폰 생성/수정 공용 검증 — route.ts와 [id]/route.ts에서 사용.

   거절 문구는 전부 "무엇을 어떻게 고치면 되는지" 로 적는다. 예전 문구는
   '할인 유형이 올바르지 않습니다' 처럼 개발자 필드명을 그대로 옮긴 것이라,
   화면에 떠도 대표는 어느 칸을 만져야 하는지 알 수 없었다. */

import { DISCOUNT_TYPE_LABELS } from "@/lib/admin-labels";

export interface CouponPayload {
  code?: unknown;
  name?: unknown;
  discount_type?: unknown;
  value?: unknown;
  min_order?: unknown;
  max_discount?: unknown;
  starts_at?: unknown;
  ends_at?: unknown;
  usage_limit?: unknown;
  per_user_limit?: unknown;
  is_active?: unknown;
}

function asInt(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function asIso(v: unknown): string | null | "invalid" {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") return "invalid";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "invalid" : d.toISOString();
}

/** 성공 시 { data: 컬럼 객체 }, 실패 시 { error: 메시지 } */
export function validateCoupon(
  body: CouponPayload,
  { partial = false }: { partial?: boolean } = {}
): { data?: Record<string, unknown>; error?: string } {
  const out: Record<string, unknown> = {};

  if (body.code !== undefined) {
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    if (!/^[A-Z0-9_-]{2,30}$/.test(code)) {
      return { error: "쿠폰 코드는 영문 대문자·숫자와 -, _ 만 써서 2~30자로 넣어 주세요." };
    }
    out.code = code;
  } else if (!partial) {
    return { error: "쿠폰 코드를 입력해 주세요." };
  }

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 60) return { error: "쿠폰 이름을 60자 이내로 입력해 주세요." };
    out.name = name;
  } else if (!partial) {
    return { error: "쿠폰 이름을 입력해 주세요." };
  }

  if (body.discount_type !== undefined || !partial) {
    if (body.discount_type !== "rate" && body.discount_type !== "fixed") {
      return { error: `할인 방식을 ${DISCOUNT_TYPE_LABELS.rate} 또는 ${DISCOUNT_TYPE_LABELS.fixed} 중에서 골라 주세요.` };
    }
    out.discount_type = body.discount_type;
  }

  if (body.value !== undefined || !partial) {
    const value = asInt(body.value);
    if (value === null || value <= 0) return { error: "얼마를 깎아 줄지 입력해 주세요." };
    if ((out.discount_type ?? body.discount_type) === "rate" && value > 100) {
      return { error: `${DISCOUNT_TYPE_LABELS.rate}은 100%를 넘을 수 없습니다. 금액으로 깎으려면 할인 방식을 ${DISCOUNT_TYPE_LABELS.fixed}으로 바꿔 주세요.` };
    }
    out.value = value;
  }

  if (body.min_order !== undefined) {
    const minOrder = asInt(body.min_order) ?? 0;
    if (minOrder < 0) return { error: "최소 주문금액은 0원 이상이어야 합니다." };
    out.min_order = minOrder;
  }

  if (body.max_discount !== undefined) {
    const maxDiscount = asInt(body.max_discount);
    if (maxDiscount !== null && maxDiscount <= 0) {
      return { error: "최대 할인금액은 1원 이상으로 넣거나 비워 두세요." };
    }
    out.max_discount = maxDiscount;
  }

  if (body.starts_at !== undefined) {
    const startsAt = asIso(body.starts_at);
    if (startsAt === "invalid") return { error: "사용 시작일을 다시 골라 주세요." };
    out.starts_at = startsAt;
  }
  if (body.ends_at !== undefined) {
    const endsAt = asIso(body.ends_at);
    if (endsAt === "invalid") return { error: "사용 종료일을 다시 골라 주세요." };
    out.ends_at = endsAt;
  }
  if (
    typeof out.starts_at === "string" &&
    typeof out.ends_at === "string" &&
    out.ends_at < out.starts_at
  ) {
    return { error: "사용 종료일이 시작일보다 빠릅니다. 두 날짜를 다시 확인해 주세요." };
  }

  if (body.usage_limit !== undefined) {
    const usageLimit = asInt(body.usage_limit);
    if (usageLimit !== null && usageLimit < 1) {
      return { error: "총 사용 가능 횟수는 1회 이상으로 넣거나 비워 두세요." };
    }
    out.usage_limit = usageLimit;
  }

  if (body.per_user_limit !== undefined) {
    const perUser = asInt(body.per_user_limit) ?? 1;
    if (perUser < 1) return { error: "한 사람이 쓸 수 있는 횟수는 1회 이상이어야 합니다." };
    out.per_user_limit = perUser;
  }

  if (body.is_active !== undefined) {
    out.is_active = Boolean(body.is_active);
  }

  return { data: out };
}
