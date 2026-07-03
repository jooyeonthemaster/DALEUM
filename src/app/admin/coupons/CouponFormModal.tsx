"use client";

import { useState } from "react";
import Modal from "@/components/admin/Modal";
import { FieldRow, Input, Select, Toggle, Help } from "@/components/admin/Field";
import { krw } from "@/lib/format";
import type { Coupon } from "@/lib/types";

/* ---------- 폼 상태 ---------- */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** ISO → KST 기준 yyyy-mm-dd (input[type=date]) */
function isoToKstDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(new Date(iso).getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

interface CouponForm {
  code: string;
  name: string;
  discount_type: "rate" | "fixed";
  value: string;
  min_order: string;
  max_discount: string;
  starts_at: string;
  ends_at: string;
  usage_limit: string;
  per_user_limit: string;
  is_active: boolean;
}

const EMPTY_FORM: CouponForm = {
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

function toForm(c: Coupon): CouponForm {
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

function toPayload(f: CouponForm): Record<string, unknown> {
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

/* ---------- 생성/수정 모달 ---------- */

export interface CouponFormModalProps {
  /** 수정 대상 (null이면 새 쿠폰) */
  coupon: Coupon | null;
  onClose: () => void;
  /** 저장 성공 후 호출 (목록 갱신) */
  onSaved: () => void | Promise<void>;
  /** 삭제 버튼 클릭 (확인 다이얼로그는 부모가 띄운다) */
  onDelete: (coupon: Coupon) => void;
}

export default function CouponFormModal({
  coupon,
  onClose,
  onSaved,
  onDelete,
}: CouponFormModalProps) {
  const [form, setForm] = useState<CouponForm>(() => (coupon ? toForm(coupon) : EMPTY_FORM));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch(coupon ? `/api/admin/coupons/${coupon.id}` : "/api/admin/coupons", {
        method: coupon ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(form)),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "저장에 실패했습니다.");
      await onSaved();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={coupon ? "쿠폰 수정" : "새 쿠폰"}
      size="lg"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <div>
            {coupon && (
              <button
                type="button"
                onClick={() => onDelete(coupon)}
                className="text-sm text-signal-red transition-colors hover:opacity-80"
              >
                삭제
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="border border-ink-200 bg-cream-50 px-4 py-2.5 text-sm text-ink-700 transition-colors hover:bg-cream-100"
            >
              취소
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="bg-forest-700 px-4 py-2.5 text-sm text-cream-50 transition-colors hover:bg-forest-800 disabled:opacity-50"
            >
              {saving ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>
      }
    >
      <div className="divide-y divide-ink-100">
        <FieldRow
          label="쿠폰 코드"
          required
          htmlFor="coupon-code"
          help="영문/숫자 2~30자. 고객이 입력하는 값입니다."
        >
          <Input
            id="coupon-code"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            placeholder="WELCOME10"
          />
        </FieldRow>
        <FieldRow label="쿠폰 이름" required htmlFor="coupon-name">
          <Input
            id="coupon-name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="신규 가입 감사 쿠폰"
          />
        </FieldRow>
        <FieldRow label="할인 유형" htmlFor="coupon-type">
          <div className="flex flex-wrap items-center gap-3">
            <Select
              id="coupon-type"
              className="w-32"
              value={form.discount_type}
              onChange={(e) =>
                setForm({ ...form, discount_type: e.target.value as "rate" | "fixed" })
              }
            >
              <option value="rate">정률 (%)</option>
              <option value="fixed">정액 (원)</option>
            </Select>
            <div className="flex items-center gap-2">
              <Input
                aria-label="할인 값"
                type="number"
                min={1}
                className="w-28"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
              />
              <span className="text-sm text-ink-500">
                {form.discount_type === "rate" ? "%" : "원"}
              </span>
            </div>
          </div>
        </FieldRow>
        {form.discount_type === "rate" && (
          <FieldRow label="최대 할인금액" htmlFor="coupon-max" help="비워 두면 한도 없이 할인됩니다.">
            <Input
              id="coupon-max"
              type="number"
              min={0}
              className="max-w-40"
              value={form.max_discount}
              onChange={(e) => setForm({ ...form, max_discount: e.target.value })}
              placeholder="5000"
            />
          </FieldRow>
        )}
        <FieldRow label="최소 주문금액" htmlFor="coupon-min" help="0이면 제한이 없습니다.">
          <Input
            id="coupon-min"
            type="number"
            min={0}
            className="max-w-40"
            value={form.min_order}
            onChange={(e) => setForm({ ...form, min_order: e.target.value })}
          />
        </FieldRow>
        <FieldRow label="사용 기간" help="비워 두면 상시 사용 가능합니다.">
          <div className="flex items-center gap-2">
            <Input
              aria-label="시작일"
              type="date"
              className="max-w-44"
              value={form.starts_at}
              max={form.ends_at || undefined}
              onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
            />
            <span aria-hidden className="text-ink-300">
              –
            </span>
            <Input
              aria-label="종료일"
              type="date"
              className="max-w-44"
              value={form.ends_at}
              min={form.starts_at || undefined}
              onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
            />
          </div>
        </FieldRow>
        <FieldRow label="총 사용 한도" htmlFor="coupon-limit" help="비워 두면 무제한입니다.">
          <Input
            id="coupon-limit"
            type="number"
            min={1}
            className="max-w-40"
            value={form.usage_limit}
            onChange={(e) => setForm({ ...form, usage_limit: e.target.value })}
            placeholder="100"
          />
        </FieldRow>
        <FieldRow label="1인당 한도" htmlFor="coupon-per-user">
          <Input
            id="coupon-per-user"
            type="number"
            min={1}
            className="max-w-40"
            value={form.per_user_limit}
            onChange={(e) => setForm({ ...form, per_user_limit: e.target.value })}
          />
        </FieldRow>
        <FieldRow label="활성" help="끄면 고객이 사용할 수 없습니다.">
          <Toggle
            checked={form.is_active}
            onChange={(v) => setForm({ ...form, is_active: v })}
            label={form.is_active ? "사용 가능" : "사용 중지"}
          />
        </FieldRow>
      </div>
      {formError && <Help tone="error">{formError}</Help>}
      {coupon && (
        <p className="mt-4 text-xs text-ink-400 krw">지금까지 {krw(coupon.used_count)}회 사용됨</p>
      )}
    </Modal>
  );
}
