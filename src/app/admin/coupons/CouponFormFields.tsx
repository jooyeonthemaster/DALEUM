"use client";

/* ============================================================
   쿠폰 입력 칸들.

   손본 것:
   · '정률 (%) / 정액 (원)' 이라는 회계 용어를 DISCOUNT_TYPE_LABELS
     (퍼센트 할인 / 금액 할인)로 바꿨다. 정률·정액은 비개발자에게 코드나 다름없고,
     실제로 '정액 5000' 을 정률로 잘못 골라 5,000% 를 넣는 사고가 있었다.
   · 날짜는 브라우저 기본 위젯(미국식 mm/dd/yyyy)을 버리고 연/월/일 선택으로 바꿨다.
   · '총 사용 한도 / 1인당 한도' 처럼 무엇의 한도인지 모호하던 이름을
     '총 사용 가능 횟수 / 한 사람당 횟수' 로 풀었다.
   ============================================================ */

import { FieldRow, Input, Select, Toggle, Help } from "@/components/admin/Field";
import { DISCOUNT_TYPE_LABELS, TOGGLE_LABELS } from "@/lib/admin-labels";
// 날짜 입력은 콘텐츠 화면과 같은 부품을 쓴다 — 같은 유닛 안에서 날짜 표기가 갈리면 안 된다
import DateField from "@/app/admin/content/_components/DateField";
import type { CouponForm } from "./coupon-form-state";
import { toInt, type DiscountKind } from "./coupon-math";

export interface CouponFormFieldsProps {
  form: CouponForm;
  onChange: (next: CouponForm) => void;
  /** 퍼센트 할인인데 최대 할인금액이 비어 있는 상태 */
  riskyUnlimited: boolean;
}

export default function CouponFormFields({
  form,
  onChange,
  riskyUnlimited,
}: CouponFormFieldsProps) {
  // 저장을 눌러야 알려 주면 이미 늦다 — 잘못 넣은 그 자리에서 바로 말해 준다.
  // (실제로 '금액 할인 5000' 을 퍼센트로 잘못 골라 5,000% 를 넣고, 저장 실패 문구만
  //  보고 무엇이 잘못됐는지 몰라 포기하는 일이 있었다)
  const rawValue = toInt(form.value);
  const rateOver100 =
    form.discount_type === "rate" && rawValue !== null && rawValue > 100;
  const reversedPeriod = Boolean(
    form.starts_at && form.ends_at && form.ends_at < form.starts_at
  );

  return (
    <div className="divide-y divide-ink-100">
      {/* 도움말이 검사와 다르면 관리자는 쓸 수 있는 글자를 스스로 좁혀 쓴다.
          실제 검사는 coupon-form-state.ts:84 와 api/admin/coupons/validation.ts:45 둘 다
          /^[A-Z0-9_-]{2,30}$/ 이라 붙임표·밑줄도 통과한다 — 거절 문구와 같은 문장으로 맞춘다. */}
      <FieldRow
        label="쿠폰 코드"
        required
        htmlFor="coupon-code"
        help="고객이 결제 화면에서 직접 입력하는 글자입니다. 영문 대문자·숫자와 -, _ 만 써서 2~30자로 넣어 주세요. 소문자로 적어도 대문자로 자동으로 바뀝니다."
      >
        <Input
          id="coupon-code"
          className="max-w-60"
          value={form.code}
          onChange={(e) => onChange({ ...form, code: e.target.value.toUpperCase() })}
          placeholder="WELCOME10"
        />
      </FieldRow>

      <FieldRow
        label="쿠폰 이름"
        required
        htmlFor="coupon-name"
        help="관리자와 고객이 목록에서 보는 이름입니다."
      >
        <Input
          id="coupon-name"
          value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          placeholder="신규 가입 감사 쿠폰"
        />
      </FieldRow>

      <FieldRow label="할인 방식" htmlFor="coupon-type">
        <div className="flex flex-wrap items-center gap-3">
          <Select
            id="coupon-type"
            className="w-40"
            value={form.discount_type}
            onChange={(e) => onChange({ ...form, discount_type: e.target.value as DiscountKind })}
          >
            <option value="rate">{DISCOUNT_TYPE_LABELS.rate}</option>
            <option value="fixed">{DISCOUNT_TYPE_LABELS.fixed}</option>
          </Select>
          <div className="flex items-center gap-2">
            <Input
              aria-label="할인 값"
              type="number"
              min={1}
              max={form.discount_type === "rate" ? 100 : undefined}
              className="w-28"
              value={form.value}
              onChange={(e) => onChange({ ...form, value: e.target.value })}
            />
            <span className="text-sm text-ink-500">
              {form.discount_type === "rate" ? "% 깎아 줍니다" : "원 깎아 줍니다"}
            </span>
          </div>
        </div>
        {rateOver100 && (
          <Help tone="error">
            {DISCOUNT_TYPE_LABELS.rate}은 100%를 넘을 수 없습니다. {rawValue.toLocaleString("ko-KR")}
            원을 깎아 주려던 것이라면 할인 방식을 {DISCOUNT_TYPE_LABELS.fixed}으로 바꿔 주세요.
          </Help>
        )}
      </FieldRow>

      {form.discount_type === "rate" && (
        <FieldRow label="최대 할인금액" htmlFor="coupon-max">
          <Input
            id="coupon-max"
            type="number"
            min={1}
            className="max-w-40"
            value={form.max_discount}
            onChange={(e) => onChange({ ...form, max_discount: e.target.value })}
            placeholder="5000"
          />
          {riskyUnlimited ? (
            <Help tone="error">
              비워 두면 아무리 큰 주문이어도 한도 없이 깎입니다. 한도를 넣는 것을 권합니다.
            </Help>
          ) : (
            <Help>이 금액을 넘게는 깎이지 않습니다.</Help>
          )}
        </FieldRow>
      )}

      <FieldRow
        label="최소 주문금액"
        htmlFor="coupon-min"
        help="이 금액 이상 주문해야 쿠폰을 쓸 수 있습니다. 0이면 제한이 없습니다."
      >
        <Input
          id="coupon-min"
          type="number"
          min={0}
          step={1000}
          className="max-w-40"
          value={form.min_order}
          onChange={(e) => onChange({ ...form, min_order: e.target.value })}
        />
      </FieldRow>

      <FieldRow label="사용 기간">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
          <div>
            <p className="mb-1 text-xs text-ink-500">시작</p>
            <DateField
              ariaLabel="사용 시작일"
              value={form.starts_at}
              onChange={(next) => onChange({ ...form, starts_at: next })}
              quick
            />
          </div>
          <div>
            <p className="mb-1 text-xs text-ink-500">종료</p>
            <DateField
              ariaLabel="사용 종료일"
              value={form.ends_at}
              onChange={(next) => onChange({ ...form, ends_at: next })}
              quick
            />
          </div>
        </div>
        {reversedPeriod ? (
          <Help tone="error">
            종료일이 시작일보다 빠릅니다. 이대로는 저장할 수 없으니 두 날짜를 다시 확인해 주세요.
          </Help>
        ) : (
          <Help>두 칸 다 비워 두면 기간 제한 없이 계속 쓸 수 있습니다.</Help>
        )}
      </FieldRow>

      <FieldRow
        label="총 사용 가능 횟수"
        htmlFor="coupon-limit"
        help="모든 고객을 합쳐 이 횟수만큼만 쓰이고 소진됩니다. 비워 두면 제한이 없습니다."
      >
        <Input
          id="coupon-limit"
          type="number"
          min={1}
          className="max-w-40"
          value={form.usage_limit}
          onChange={(e) => onChange({ ...form, usage_limit: e.target.value })}
          placeholder="100"
        />
      </FieldRow>

      <FieldRow
        label="한 사람당 횟수"
        htmlFor="coupon-per-user"
        help="회원 한 명이 몇 번까지 쓸 수 있는지입니다."
      >
        <Input
          id="coupon-per-user"
          type="number"
          min={1}
          className="max-w-40"
          value={form.per_user_limit}
          onChange={(e) => onChange({ ...form, per_user_limit: e.target.value })}
        />
      </FieldRow>

      <FieldRow label={TOGGLE_LABELS.switch} help="끄면 고객이 코드를 정확히 넣어도 쓸 수 없습니다.">
        <Toggle
          checked={form.is_active}
          onChange={(v) => onChange({ ...form, is_active: v })}
          label={form.is_active ? TOGGLE_LABELS.on : TOGGLE_LABELS.off}
        />
      </FieldRow>
    </div>
  );
}
