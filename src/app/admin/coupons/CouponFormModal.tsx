"use client";

import { useState } from "react";
import Modal from "@/components/admin/Modal";
import { Help } from "@/components/admin/Field";
import type { Coupon } from "@/lib/types";
import CouponFormFields from "./CouponFormFields";
import CouponPreview from "./CouponPreview";
import {
  EMPTY_COUPON_FORM,
  toForm,
  toPayload,
  validateCouponForm,
  type CouponForm,
} from "./coupon-form-state";
import { toInt } from "./coupon-math";

export interface CouponFormModalProps {
  /** 수정 대상 (null이면 새 쿠폰) */
  coupon: Coupon | null;
  onClose: () => void;
  /** 저장 성공 후 호출 (목록 갱신) */
  onSaved: () => void | Promise<void>;
  /** 삭제 버튼 클릭 (확인 다이얼로그는 부모가 띄운다) */
  onDelete: (coupon: Coupon) => void;
}

/**
 * 쿠폰 만들기·고치기.
 *
 * 예전 폼에는 결과 금액이 한 군데도 없었다. 그래서 '50% · 최소주문 0원 ·
 * 최대할인 미입력' 같은 쿠폰이 아무 저항 없이 만들어졌다. 이제 입력과 동시에
 * 실제 할인액을 계산해 보여 주고, 한도 없는 퍼센트 할인은 한 번 더 묻는다.
 */
export default function CouponFormModal({
  coupon,
  onClose,
  onSaved,
  onDelete,
}: CouponFormModalProps) {
  const [form, setForm] = useState<CouponForm>(() =>
    coupon ? toForm(coupon) : EMPTY_COUPON_FORM
  );
  const [sample, setSample] = useState("30000");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  const rule = {
    discount_type: form.discount_type,
    value: toInt(form.value) ?? 0,
    min_order: toInt(form.min_order) ?? 0,
    max_discount: form.discount_type === "rate" ? toInt(form.max_discount) : null,
  };
  // 한도 없는 퍼센트 할인은 사고가 크다 — 저장을 한 번 더 묻는다
  const riskyUnlimited =
    form.discount_type === "rate" && form.max_discount === "" && rule.value > 0;

  async function save(confirmed: boolean) {
    const invalid = validateCouponForm(form);
    if (invalid) {
      setFormError(invalid);
      setNeedsConfirm(false);
      return;
    }
    if (riskyUnlimited && !confirmed) {
      setFormError(null);
      setNeedsConfirm(true);
      return;
    }
    setSaving(true);
    setFormError(null);
    setNeedsConfirm(false);
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
              onClick={() => void save(false)}
              disabled={saving}
              className="bg-forest-700 px-4 py-2.5 text-sm text-cream-50 transition-colors hover:bg-forest-800 disabled:opacity-50"
            >
              {saving ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>
      }
    >
      <CouponFormFields form={form} onChange={setForm} riskyUnlimited={riskyUnlimited} />

      <CouponPreview rule={rule} sample={sample} onSampleChange={setSample} />

      {needsConfirm && (
        <div className="mt-4 border border-signal-red px-4 py-3">
          <p className="text-sm text-signal-red">
            최대 할인금액을 정하지 않았습니다. 이대로 저장하면 큰 주문에서 할인이 무제한으로
            커집니다. 그래도 저장할까요?
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setNeedsConfirm(false)}
              className="border border-ink-200 bg-cream-50 px-3 py-1.5 text-xs text-ink-700 transition-colors hover:bg-cream-100"
            >
              한도를 넣겠습니다
            </button>
            <button
              type="button"
              onClick={() => void save(true)}
              className="bg-signal-red px-3 py-1.5 text-xs text-cream-50 transition-opacity hover:opacity-90"
            >
              그래도 저장
            </button>
          </div>
        </div>
      )}

      {formError && <Help tone="error">{formError}</Help>}
      {coupon && (
        <p className="mt-4 text-xs text-ink-400">
          지금까지 {coupon.used_count.toLocaleString("ko-KR")}회 쓰였습니다.
        </p>
      )}
    </Modal>
  );
}
