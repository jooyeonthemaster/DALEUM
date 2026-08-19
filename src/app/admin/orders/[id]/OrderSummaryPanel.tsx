"use client";

import Link from "next/link";
import Image from "next/image";
import OrderSection from "./OrderSection";
import { krw, formatDateTime, formatPhone } from "@/lib/format";
import { PAYMENT_STATUS_LABELS } from "@/lib/constants";
import type { PaymentStatus } from "@/lib/types";
import type { AdminOrderDetail, CustomerLink } from "./order-detail-types";

/* ============================================================
   주문 상세 왼쪽 — 주문 상품 · 결제 정보 · 배송지/주문자
   (상세 화면 한 파일이 너무 길어져 읽기 전용 부분을 따로 뺐다)
   ============================================================ */

interface Props {
  order: AdminOrderDetail;
  customer: CustomerLink | null;
  onEditShipping: () => void;
}

export default function OrderSummaryPanel({ order, customer, onEditShipping }: Props) {
  return (
    <div className="space-y-6">
      {/* 상품 라인 */}
      <OrderSection title="주문 상품">
        <ul className="divide-y divide-ink-100">
          {order.order_items.map((item) => (
            <li key={item.id} className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0">
              {item.image_url ? (
                <Image
                  src={item.image_url}
                  alt={item.name_snapshot}
                  width={56}
                  height={70}
                  sizes="56px"
                  className="h-[70px] w-14 shrink-0 bg-cream-100 object-cover"
                />
              ) : (
                <div className="h-[70px] w-14 shrink-0 bg-cream-100" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-900">{item.name_snapshot}</p>
                {item.option_snapshot && (
                  <p className="mt-0.5 text-xs text-ink-400">{item.option_snapshot}</p>
                )}
                <p className="krw mt-1 text-xs text-ink-500">
                  {krw(item.unit_price)}원 × {item.qty}
                  {item.unit_price < item.original_price && (
                    <span className="ml-2 text-ink-300 line-through">
                      {krw(item.original_price)}원
                    </span>
                  )}
                </p>
              </div>
              <p className="krw shrink-0 text-sm font-medium text-ink-900">
                {krw(item.unit_price * item.qty)}원
              </p>
            </li>
          ))}
        </ul>

        <dl className="mt-5 space-y-2 border-t border-ink-200 pt-4 text-sm">
          <div className="flex justify-between text-ink-600">
            <dt>상품 합계</dt>
            <dd className="krw">{krw(order.subtotal)}원</dd>
          </div>
          {order.discount_total > 0 && (
            <div className="flex justify-between text-ink-600">
              <dt>
                할인
                {order.coupon_discount > 0 && (
                  <span className="ml-1.5 text-xs text-ink-400">
                    (쿠폰 {krw(order.coupon_discount)}원 포함)
                  </span>
                )}
              </dt>
              <dd className="krw text-forest-700">−{krw(order.discount_total)}원</dd>
            </div>
          )}
          <div className="flex justify-between text-ink-600">
            <dt>배송비</dt>
            <dd className="krw">
              {order.shipping_fee > 0 ? `${krw(order.shipping_fee)}원` : "무료"}
            </dd>
          </div>
          <div className="flex justify-between border-t border-ink-200 pt-2.5 text-base font-semibold text-ink-900">
            <dt>총 결제 금액</dt>
            <dd className="krw">{krw(order.total)}원</dd>
          </div>
        </dl>

        {(order.vip_code || order.vip_campaign_id) && (
          <p className="mt-3 text-xs text-brass-700">
            {order.vip_campaign_id ? "VIP 캠페인 경유 주문" : "VIP 코드 주문"}
            {order.vip_code && <span className="krw ml-1.5">코드 {order.vip_code}</span>}
          </p>
        )}
      </OrderSection>

      {/* 결제 정보 */}
      <OrderSection title="결제 정보">
        {order.payments.length === 0 ? (
          <p className="text-sm leading-relaxed text-ink-500">
            {order.status === "pending"
              ? "아직 결제되지 않은 주문입니다."
              : "카드·간편결제 기록이 없는 주문입니다. 계좌이체 등으로 입금을 받고 결제 완료로 바꾼 주문이라면, 취소할 때 입금액은 직접 송금해 주셔야 합니다."}
          </p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {order.payments.map((p) => (
              <li key={p.id} className="py-3 text-sm first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-ink-900">{p.method ?? "카드 결제"}</span>
                  <span className="text-xs text-ink-500">
                    {PAYMENT_STATUS_LABELS[p.status as PaymentStatus] ?? "확인 필요"}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-500">
                  <span className="krw">
                    {krw(p.amount)}원
                    {p.approved_at && ` · ${formatDateTime(p.approved_at)} 승인`}
                  </span>
                  {p.receipt_url && (
                    <a
                      href={p.receipt_url}
                      target="_blank"
                      rel="noreferrer"
                      className="link-line text-forest-700"
                    >
                      영수증 보기
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {order.cancel_reason && (
          <p className="mt-3 border-t border-ink-100 pt-3 text-xs text-signal-red">
            취소·환불 사유: {order.cancel_reason}
            {order.cancelled_at && (
              <span className="krw ml-1.5 text-ink-400">
                ({formatDateTime(order.cancelled_at)})
              </span>
            )}
          </p>
        )}
      </OrderSection>

      {/* 배송지 / 주문자 */}
      <OrderSection
        title="배송지 · 주문자"
        action={
          <button
            type="button"
            onClick={onEditShipping}
            className="text-xs text-ink-600 transition-colors hover:text-forest-700"
          >
            배송지 수정
          </button>
        }
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium text-ink-400">받는 분</p>
            <p className="text-sm font-medium text-ink-900">{order.recipient?.name}</p>
            <p className="krw mt-0.5 text-sm text-ink-600">
              {formatPhone(order.recipient?.phone ?? "")}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-ink-600">
              ({order.recipient?.postcode}) {order.recipient?.address1}
              {order.recipient?.address2 && ` ${order.recipient.address2}`}
            </p>
            {order.recipient?.memo && (
              <p className="mt-2 text-xs text-ink-500">배송 메모: {order.recipient.memo}</p>
            )}
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-ink-400">주문자</p>
            <p className="text-sm font-medium text-ink-900">{order.orderer?.name}</p>
            <p className="krw mt-0.5 text-sm text-ink-600">
              {formatPhone(order.orderer?.phone ?? "")}
            </p>
            {order.orderer?.email && (
              <p className="mt-0.5 text-sm text-ink-600">{order.orderer.email}</p>
            )}
            <p className="mt-2 text-xs text-ink-400">
              {customer ? (
                <Link
                  href={`/admin/customers/${customer.id}`}
                  className="link-line text-forest-700"
                >
                  고객 상세 보기
                </Link>
              ) : (
                "비회원 주문"
              )}
            </p>
          </div>
        </div>
      </OrderSection>
    </div>
  );
}
