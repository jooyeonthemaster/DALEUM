"use client";

/* ============================================================
   "이 쿠폰을 쓰면 실제로 얼마가 빠지는가" 를 입력과 동시에 보여 주는 상자.

   왜 필요한가:
   쿠폰 폼에는 결과 금액이 한 군데도 없었다. 그래서 '50% · 최소주문 0원 ·
   최대할인 미입력' 같은 쿠폰이 아무 저항 없이 만들어지고, 고액 주문에서
   수십만 원이 한 번에 빠져나가도 만든 사람은 사후 정산에서야 알게 된다.

   배송비를 함께 세는 이유(고쳐진 결함):
   이 상자는 처음에 '결제 36,000원' 이라고 단정했다. 그런데 실제 결제액은
   src/lib/orders.ts:352-354 가 **쿠폰을 뺀 금액**으로 배송비 문턱을 판정해
   더한 값이다. 45,000원에 20% 쿠폰이면 36,000원이 되어 무료배송 문턱
   (기본 40,000원)이 무너지고 배송비 3,500원이 되살아난다 — 고객은 39,500원을
   낸다. 3,500원이나 어긋나는 숫자를 '결제' 라고 적어 두면 쿠폰 설계가 통째로
   틀어지므로, 계산은 lib/shipping.ts 의 calcShippingFee 를 그대로 불러서 한다.

   배송 설정은 화면에서 상수로 박지 않고 설정 화면이 저장한 실제 값
   (/api/admin/settings)을 읽는다. 배송비를 바꾼 날 이 상자만 옛 숫자를
   말하면 같은 사고가 되풀이된다.

   VIP 경고를 함께 다는 이유:
   src/lib/orders.ts:334-347 은 VIP·캠페인 단가가 이미 반영된 합계(itemsTotal)에
   쿠폰 할인을 **추가로** 뺀다. 즉 VIP 30% 상품에 20% 쿠폰을 쓰면 44% 가 빠진다.
   지금 그걸 막는 설정은 어디에도 없으므로, 최소한 사실을 화면에 적어 둔다.
   ============================================================ */

import { useEffect, useState } from "react";
import { Input } from "@/components/admin/Field";
import { won, DISCOUNT_TYPE_LABELS, VIP_BASE_PRICE_LABEL } from "@/lib/admin-labels";
import { DEFAULT_SHIPPING } from "@/lib/shipping";
import type { ShippingSettings } from "@/lib/types";
import { applyCouponWithShipping, type CouponRule } from "./coupon-math";

export interface CouponPreviewProps {
  rule: CouponRule;
  /** 예시로 계산해 볼 주문금액 */
  sample: string;
  onSampleChange: (next: string) => void;
}

/**
 * 정률 쿠폰에 한도가 없을 때 얼마나 커질 수 있는지 보여 줄 기준 금액.
 *
 * 100만원으로 고정해 두었더니, 최소 주문금액이 200만원인 쿠폰에서는
 * 기준 금액이 최소 주문에 미달해 할인이 0원으로 계산됐고
 * "0원이 한 번에 빠집니다" 라는 말이 안 되는 경고가 나갔다.
 * 최소 주문의 두 배를 함께 보아야 문장이 실제 위험을 가리킨다.
 */
function bigOrderBase(minOrder: number): number {
  return Math.max(1_000_000, minOrder * 2);
}

export default function CouponPreview({ rule, sample, onSampleChange }: CouponPreviewProps) {
  // 설정 화면에서 저장한 실제 배송 설정. 못 읽으면 서버와 같은 기본값으로 계산한다.
  const [shipping, setShipping] = useState<ShippingSettings>(DEFAULT_SHIPPING);

  useEffect(() => {
    let alive = true;
    async function loadShipping() {
      try {
        const res = await fetch("/api/admin/settings", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { shipping?: ShippingSettings };
        if (alive && body.shipping) setShipping(body.shipping);
      } catch {
        // 못 읽으면 DEFAULT_SHIPPING 그대로 — 서버가 쓰는 기본값과 같다
      }
    }
    void loadShipping();
    return () => {
      alive = false;
    };
  }, []);

  const sampleTotal = Math.max(0, Math.round(Number(sample) || 0));
  const outcome = applyCouponWithShipping(rule, sampleTotal, shipping);
  const unlimitedRate = rule.discount_type === "rate" && rule.max_discount == null;
  const bigBase = bigOrderBase(rule.min_order);
  const bigOrder = applyCouponWithShipping(rule, bigBase, shipping);

  return (
    <div className="mt-5 border border-ink-200 bg-cream-50 px-4 py-4">
      <p className="text-[13px] font-medium text-ink-900">이 쿠폰이 실제로 깎는 금액</p>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="coupon-sample" className="text-ink-500">
          주문금액이
        </label>
        <Input
          id="coupon-sample"
          type="number"
          min={0}
          step={1000}
          className="w-32"
          value={sample}
          onChange={(e) => onSampleChange(e.target.value)}
        />
        <span className="text-ink-500">원일 때</span>
      </div>

      {rule.value <= 0 ? (
        <p className="mt-3 text-sm text-ink-400">할인 값을 넣으면 결과가 여기에 나옵니다.</p>
      ) : outcome.belowMinimum ? (
        <p className="mt-3 text-sm text-signal-red">
          최소 주문금액 {won(rule.min_order)}에 못 미쳐 이 쿠폰을 쓸 수 없습니다.
        </p>
      ) : (
        <>
          <p className="krw mt-3 text-sm text-ink-900">
            상품 금액 {won(sampleTotal)} → 할인{" "}
            <b className="text-forest-700">{won(outcome.discount)}</b> → 상품 금액 합계{" "}
            {won(outcome.payable)}
            {outcome.cappedByMax && (
              <span className="ml-1 text-xs text-ink-500">
                (최대 할인 {won(rule.max_discount ?? 0)}에 걸렸습니다)
              </span>
            )}
          </p>
          <p className="krw mt-1 text-sm text-ink-900">
            {outcome.shippingFee > 0
              ? `배송비 ${won(outcome.shippingFee)}이 붙어 `
              : "배송비는 무료라 "}
            고객이 실제로 내는 돈은 <b>{won(outcome.total)}</b>입니다.
          </p>
        </>
      )}

      {/* 쿠폰이 무료배송 문턱을 무너뜨리는 경우 — 가장 많이 어긋나는 구간이라 붉게 짚는다 */}
      {rule.value > 0 && !outcome.belowMinimum && outcome.losesFreeShipping && (
        <p className="mt-3 border-t border-ink-100 pt-3 text-xs leading-relaxed text-signal-red">
          이 주문은 쿠폰을 쓰지 않으면 배송비가 무료입니다. 쿠폰을 쓰면 상품 금액이{" "}
          <span className="krw">{won(outcome.payable)}</span>으로 내려가 무료배송 기준{" "}
          <span className="krw">{won(shipping.free_threshold)}</span>에 미치지 못해 배송비{" "}
          <span className="krw">{won(outcome.shippingFee)}</span>이 되살아납니다. 고객이 실제로
          아끼는 돈은 <b className="krw">{won(outcome.netSaving)}</b>뿐입니다.
        </p>
      )}

      {unlimitedRate && rule.value > 0 && (
        <p className="mt-3 border-t border-ink-100 pt-3 text-xs leading-relaxed text-signal-red">
          최대 할인금액을 비워 두었습니다. 고액 주문에서 할인이 무제한으로 커집니다 —{" "}
          {won(bigBase)} 주문이 들어오면 <b>{won(bigOrder.discount)}</b>이 한 번에 빠집니다.
        </p>
      )}

      {rule.discount_type === "fixed" && rule.value > 0 && rule.min_order < rule.value && (
        <p className="mt-3 border-t border-ink-100 pt-3 text-xs leading-relaxed text-signal-red">
          {DISCOUNT_TYPE_LABELS.fixed} {won(rule.value)}인데 최소 주문금액이{" "}
          {won(rule.min_order)}입니다. 할인액보다 작은 주문에는 결제 금액이 0원에 가까워집니다.
        </p>
      )}

      <p className="mt-3 border-t border-ink-100 pt-3 text-xs leading-relaxed text-ink-500">
        배송비는 <b>쿠폰을 뺀 금액</b>으로 판정합니다. 지금 설정은 상품 금액{" "}
        <span className="krw">{won(shipping.free_threshold)}</span> 이상이면 무료, 그 아래면{" "}
        <span className="krw">{won(shipping.base_fee)}</span>입니다. 쿠폰이 이 기준선을 넘나들면
        고객이 내는 돈이 할인액보다 적게 줄어듭니다.
      </p>

      <p className="mt-2 text-xs leading-relaxed text-ink-500">
        VIP 전용가·시크릿 캠페인가로 이미 깎인 금액에도 이 쿠폰이 <b>그대로 더</b> 적용됩니다. 예를
        들어 VIP 30% 상품에 20% 쿠폰을 쓰면 {VIP_BASE_PRICE_LABEL} 대비 44%가 빠집니다. 지금은 이
        중복을 끄는 설정이 없으니 할인율을 정할 때 감안해 주세요.
      </p>
    </div>
  );
}
