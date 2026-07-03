"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import StatusChip from "@/components/admin/StatusChip";
import { Select, Textarea, Help } from "@/components/admin/Field";
import TrackingSection from "./TrackingSection";
import RefundSection from "./RefundSection";
import { krw, formatDateTime, formatPhone } from "@/lib/format";
import {
  ADMIN_SETTABLE_STATUSES,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
} from "@/lib/constants";
import type {
  OrderStatus,
  OrderItem,
  Payment,
  PaymentStatus,
  Shipment,
  OrdererInfo,
  RecipientInfo,
} from "@/lib/types";

/* ============================================================
   관리자 주문 상세 — 스냅샷 / 결제 / 배송지 / 상태 변경 /
   운송장 / 관리자 메모(자동저장) / 환불
   ============================================================ */

export interface AdminOrderDetail {
  id: string;
  order_no: string;
  status: OrderStatus;
  created_at: string;
  paid_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  subtotal: number;
  discount_total: number;
  shipping_fee: number;
  total: number;
  coupon_discount: number;
  vip_code: string | null;
  vip_campaign_id: string | null;
  admin_memo: string | null;
  user_id: string | null;
  orderer: OrdererInfo;
  recipient: RecipientInfo;
  order_items: OrderItem[];
  payments: Payment[];
  shipments: Shipment[];
}

interface CustomerLink {
  id: string;
  name: string | null;
  email: string | null;
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-ink-200 bg-cream-50">
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 hairline-b">
        <h2 className="label-caps text-ink-400">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export default function OrderDetailClient({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [customer, setCustomer] = useState<CustomerLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [statusError, setStatusError] = useState<string | null>(null);
  const [memo, setMemo] = useState("");
  const [memoStatus, setMemoStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const memoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------- 조회 ----------
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/admin/orders/${orderId}`, { signal: controller.signal });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "주문을 불러오지 못했습니다.");
        setOrder(json.order as AdminOrderDetail);
        setCustomer(json.customer ?? null);
        setMemo((json.order as AdminOrderDetail).admin_memo ?? "");
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setLoadError(e instanceof Error ? e.message : "주문을 불러오지 못했습니다.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [orderId]);

  // ---------- 상태 변경 ----------
  async function changeStatus(next: OrderStatus) {
    if (!order || next === order.status) return;
    const prev = order.status;
    setOrder({ ...order, status: next });
    setStatusError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "상태를 변경하지 못했습니다.");
    } catch (e) {
      setOrder((o) => (o ? { ...o, status: prev } : o));
      setStatusError(e instanceof Error ? e.message : "상태를 변경하지 못했습니다.");
    }
  }

  // ---------- 관리자 메모 자동저장 ----------
  function onMemoChange(value: string) {
    setMemo(value);
    setMemoStatus("idle");
    if (memoTimer.current) clearTimeout(memoTimer.current);
    memoTimer.current = setTimeout(async () => {
      setMemoStatus("saving");
      try {
        const res = await fetch(`/api/admin/orders/${orderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adminMemo: value }),
        });
        if (!res.ok) throw new Error();
        setMemoStatus("saved");
      } catch {
        setMemoStatus("error");
      }
    }, 900);
  }

  // ---------- 로딩 / 에러 ----------
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse bg-cream-100" />
        <div className="grid gap-6 lg:grid-cols-[1fr_minmax(20rem,24rem)]">
          <div className="h-96 animate-pulse bg-cream-100" />
          <div className="h-96 animate-pulse bg-cream-100" />
        </div>
      </div>
    );
  }
  if (loadError || !order) {
    return (
      <div className="py-24 text-center">
        <p className="headline-serif text-lg text-ink-500">
          {loadError ?? "주문을 찾을 수 없습니다."}
        </p>
        <Link
          href="/admin/orders"
          className="mt-6 inline-block border border-ink-200 px-5 py-2.5 text-sm text-ink-700 transition-colors hover:bg-cream-100"
        >
          주문 목록으로
        </Link>
      </div>
    );
  }

  const locked = ["cancelled", "refunded"].includes(order.status);
  const settable = ADMIN_SETTABLE_STATUSES.includes(order.status);
  const shipment = order.shipments?.[0] ?? null;

  return (
    <div>
      {/* ---------- 헤더 ---------- */}
      <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link
          href="/admin/orders"
          aria-label="주문 목록으로"
          className="-ml-1 p-1 text-ink-400 transition-colors hover:text-ink-900"
        >
          <ArrowLeft size={20} strokeWidth={1.5} />
        </Link>
        <h1 className="headline-serif text-2xl text-ink-900">{order.order_no}</h1>
        <StatusChip status={order.status} />
        <span className="krw text-sm text-ink-400">{formatDateTime(order.created_at)} 주문</span>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_minmax(20rem,24rem)]">
        {/* ================= 좌측 — 주문 내용 ================= */}
        <div className="space-y-6">
          {/* 상품 라인 */}
          <Section title="주문 상품">
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
                    <p className="truncate text-sm font-medium text-ink-900">
                      {item.name_snapshot}
                    </p>
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

            {/* 금액 요약 */}
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
                <dd className="krw">{order.shipping_fee > 0 ? `${krw(order.shipping_fee)}원` : "무료"}</dd>
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
          </Section>

          {/* 결제 정보 */}
          <Section title="결제 정보">
            {order.payments.length === 0 ? (
              <p className="text-sm text-ink-400">
                결제 내역이 없습니다{order.status === "pending" ? " (결제 대기 주문)" : ""}.
              </p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {order.payments.map((p) => (
                  <li key={p.id} className="py-3 text-sm first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-ink-900">{p.method ?? "토스페이먼츠"}</span>
                      <span className="text-xs text-ink-500">
                        {PAYMENT_STATUS_LABELS[p.status as PaymentStatus] ?? p.status}
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
                취소/환불 사유: {order.cancel_reason}
                {order.cancelled_at && (
                  <span className="krw ml-1.5 text-ink-400">
                    ({formatDateTime(order.cancelled_at)})
                  </span>
                )}
              </p>
            )}
          </Section>

          {/* 배송지 / 주문자 */}
          <Section title="배송지 · 주문자">
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
          </Section>
        </div>

        {/* ================= 우측 — 운영 패널 ================= */}
        <div className="space-y-6">
          {/* 상태 변경 */}
          <Section title="주문 상태">
            <Select
              value={order.status}
              disabled={locked}
              onChange={(e) => changeStatus(e.target.value as OrderStatus)}
              aria-label="주문 상태 변경"
            >
              {!settable && (
                <option value={order.status} disabled>
                  {ORDER_STATUS_LABELS[order.status]}
                </option>
              )}
              {ADMIN_SETTABLE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {ORDER_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
            {locked ? (
              <Help>취소/환불된 주문의 상태는 변경할 수 없습니다.</Help>
            ) : (
              <Help>취소·환불 전환은 아래 환불 처리로만 진행됩니다.</Help>
            )}
            {statusError && <Help tone="error">{statusError}</Help>}
          </Section>

          {/* 운송장 */}
          <TrackingSection
            orderId={order.id}
            orderStatus={order.status}
            shipment={shipment}
            onChange={(nextShipment, nextStatus) =>
              setOrder((o) =>
                o
                  ? {
                      ...o,
                      shipments: nextShipment ? [nextShipment] : [],
                      status: nextStatus,
                    }
                  : o
              )
            }
          />

          {/* 관리자 메모 */}
          <Section
            title="관리자 메모"
            action={
              <span
                className={`text-xs ${
                  memoStatus === "error" ? "text-signal-red" : "text-ink-400"
                }`}
              >
                {memoStatus === "saving" && "저장 중…"}
                {memoStatus === "saved" && "저장됨"}
                {memoStatus === "error" && "저장 실패"}
              </span>
            }
          >
            <Textarea
              value={memo}
              rows={6}
              placeholder="운영 메모를 입력하면 자동으로 저장됩니다."
              onChange={(e) => onMemoChange(e.target.value)}
            />
          </Section>

          {/* 환불 / 취소 */}
          <RefundSection
            orderId={order.id}
            orderNo={order.order_no}
            status={order.status}
            total={order.total}
            payments={order.payments}
            onDone={(nextStatus) =>
              setOrder((o) => {
                if (!o) return o;
                // 전액 환불/취소 확정 시 결제 표시도 함께 동기화
                const refunded = ["cancelled", "refunded"].includes(nextStatus);
                return {
                  ...o,
                  status: nextStatus,
                  payments: refunded
                    ? o.payments.map((p) =>
                        p.status === "paid" ? { ...p, status: "refunded" as const } : p
                      )
                    : o.payments,
                };
              })
            }
          />
        </div>
      </div>
    </div>
  );
}
