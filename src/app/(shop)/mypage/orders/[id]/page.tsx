import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { OrderWithItems, Payment, Shipment } from "@/lib/types";
import { getCarrier, PAYMENT_STATUS_LABELS, ORDER_STATUS_LABELS } from "@/lib/constants";
import { formatDate, formatDateTime, formatPhone, krw } from "@/lib/format";
import Reveal from "@/components/shop/Reveal";
import OrderStatusLabel from "@/components/mypage/OrderStatusLabel";
import OrderTimeline from "@/components/mypage/OrderTimeline";
import OrderActions from "@/components/mypage/OrderActions";

export const metadata: Metadata = { title: "주문 상세" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CANCELLED_STATUSES = ["cancelled", "refund_requested", "refunded"] as const;

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="headline-serif mb-5 text-lg text-ink-900">{children}</h3>;
}

/** 주문 상세 — 타임라인 · 상품 · 배송 · 결제 · 액션 */
export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/mypage/orders/${id}`);

  const { data } = await supabase
    .from("orders")
    .select("*, order_items(*), payments(*), shipments(*)")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  const order = data as unknown as OrderWithItems | null;
  if (!order) notFound();

  const items = [...(order.order_items ?? [])].sort((a, b) =>
    a.created_at.localeCompare(b.created_at)
  );

  // 리뷰 작성 여부 (구매 확정 주문의 상품별 리뷰 쓰기 링크용)
  let reviewedItemIds = new Set<string>();
  if (order.status === "confirmed" && items.length > 0) {
    const { data: myReviews } = await supabase
      .from("reviews")
      .select("order_item_id")
      .eq("user_id", user.id)
      .in(
        "order_item_id",
        items.map((i) => i.id)
      );
    reviewedItemIds = new Set(
      ((myReviews ?? []) as { order_item_id: string | null }[])
        .map((r) => r.order_item_id)
        .filter((v): v is string => Boolean(v))
    );
  }

  const payment: Payment | undefined = [...(order.payments ?? [])].sort((a, b) =>
    (b.requested_at ?? "").localeCompare(a.requested_at ?? "")
  )[0];
  const shipment: Shipment | undefined = [...(order.shipments ?? [])].sort((a, b) =>
    (b.created_at ?? "").localeCompare(a.created_at ?? "")
  )[0];
  const carrier = shipment ? getCarrier(shipment.carrier_code) : undefined;
  const trackingUrl =
    shipment && carrier ? carrier.trackingUrl(shipment.tracking_no) : null;

  const isCancelled = (CANCELLED_STATUSES as readonly string[]).includes(order.status);

  return (
    <div>
      {/* 헤더 */}
      <Reveal variant="fade" delay={0.12} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div>
          <Link
            href="/mypage/orders"
            className="-my-2 inline-block py-2 text-xs text-ink-400 transition-colors hover:text-ink-900"
          >
            주문 내역으로 돌아가기
          </Link>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="krw headline-serif text-xl text-ink-900 md:text-2xl">
              {order.order_no}
            </h2>
            <span className="text-[13px] text-ink-400">
              {formatDateTime(order.created_at)} 주문
            </span>
          </div>
        </div>
        <OrderStatusLabel status={order.status} />
      </Reveal>

      {/* 진행 타임라인 / 취소 안내 */}
      {isCancelled ? (
        <Reveal variant="fade" delay={0.2} className="mt-8 border border-ink-200 bg-cream-100 px-6 py-6">
          <p className="text-sm font-medium text-ink-900">
            {ORDER_STATUS_LABELS[order.status]}
            {order.cancelled_at && (
              <span className="ml-2 font-normal text-ink-400">
                {formatDateTime(order.cancelled_at)}
              </span>
            )}
          </p>
          {order.cancel_reason && (
            <p className="mt-2 text-[13px] leading-relaxed text-ink-500">
              사유: {order.cancel_reason}
            </p>
          )}
          <p className="mt-2 text-[13px] leading-relaxed text-ink-500">
            결제하신 금액은 결제 수단 정책에 따라 3~5영업일 내 환불됩니다.
          </p>
        </Reveal>
      ) : (
        <Reveal variant="fade" delay={0.2} className="mt-9 border border-ink-200 px-4 py-7 md:px-8">
          <OrderTimeline status={order.status} />
          {order.status === "confirmed" && (
            <p className="mt-5 text-center text-[13px] text-forest-700">
              구매가 확정된 주문입니다. 상품별로 리뷰를 남겨보세요.
            </p>
          )}
        </Reveal>
      )}

      {/* 주문 상품 */}
      <Reveal as="section" variant="fade" delay={0.28} className="hairline-t mt-10 pt-8">
        <SectionHeading>주문 상품</SectionHeading>
        <ul className="divide-y divide-ink-100 border-y border-ink-200">
          {items.map((item) => {
            const reviewed = reviewedItemIds.has(item.id);
            return (
              <li key={item.id} className="flex gap-4 py-5">
                <div className="relative h-20 w-16 shrink-0 overflow-hidden bg-cream-100">
                  {item.image_url ? (
                    <Image
                      src={item.image_url}
                      alt={item.name_snapshot}
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-[9px] tracking-[0.18em] text-ink-300">
                      DALEUM
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-snug text-ink-900">
                    {item.name_snapshot}
                  </p>
                  {item.option_snapshot && (
                    <p className="mt-1 text-xs text-ink-500">{item.option_snapshot}</p>
                  )}
                  <p className="krw mt-1.5 text-xs text-ink-500">
                    {krw(item.unit_price)}원 × {item.qty}개
                    {item.original_price > item.unit_price && (
                      <del className="ml-1.5 text-ink-300">{krw(item.original_price)}원</del>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end justify-between">
                  <span className="krw text-sm font-semibold text-ink-900">
                    {krw(item.unit_price * item.qty)}원
                  </span>
                  {order.status === "confirmed" &&
                    item.product_id &&
                    (reviewed ? (
                      <span className="text-xs text-ink-400">리뷰 작성 완료</span>
                    ) : (
                      <Link
                        href={`/mypage/reviews?item=${item.id}`}
                        className="flex min-h-10 items-center border border-ink-200 px-3.5 text-xs text-ink-700 transition-colors hover:border-ink-400 hover:text-ink-900 md:min-h-8"
                      >
                        리뷰 쓰기
                      </Link>
                    ))}
                </div>
              </li>
            );
          })}
        </ul>
      </Reveal>

      <div className="mt-10 grid gap-10 overflow-x-clip md:grid-cols-2">
        {/* 배송 정보 */}
        <Reveal as="section" variant="left">
          <SectionHeading>배송 정보</SectionHeading>
          <dl className="space-y-3 text-sm">
            <div className="flex gap-4">
              <dt className="w-16 shrink-0 text-ink-400">받는 분</dt>
              <dd className="text-ink-900">{order.recipient?.name}</dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-16 shrink-0 text-ink-400">연락처</dt>
              <dd className="krw text-ink-900">
                {order.recipient?.phone ? formatPhone(order.recipient.phone) : "-"}
              </dd>
            </div>
            <div className="flex gap-4">
              <dt className="w-16 shrink-0 text-ink-400">주소</dt>
              <dd className="leading-relaxed text-ink-900">
                {order.recipient?.postcode && (
                  <span className="krw text-ink-400">({order.recipient.postcode}) </span>
                )}
                {order.recipient?.address1} {order.recipient?.address2}
              </dd>
            </div>
            {order.recipient?.memo && (
              <div className="flex gap-4">
                <dt className="w-16 shrink-0 text-ink-400">요청사항</dt>
                <dd className="leading-relaxed text-ink-600">{order.recipient.memo}</dd>
              </div>
            )}
          </dl>

          {shipment && (
            <div className="mt-5 border border-ink-200 px-5 py-4">
              <p className="label-caps text-ink-400">Delivery</p>
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <p className="text-sm text-ink-900">
                  {shipment.carrier_name || carrier?.name || "택배"}
                  <span className="krw ml-2 text-ink-600">{shipment.tracking_no}</span>
                </p>
                {trackingUrl && (
                  <a
                    href={trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="-my-1 inline-flex min-h-11 items-center gap-1 border border-forest-700/40 px-4 text-[13px] font-medium text-forest-700 transition-colors hover:border-forest-700 hover:text-forest-800 md:min-h-9"
                  >
                    배송 조회
                    <ArrowUpRight size={14} strokeWidth={1.5} />
                  </a>
                )}
              </div>
              {shipment.shipped_at && (
                <p className="mt-1.5 text-xs text-ink-400">
                  {formatDate(shipment.shipped_at)} 발송
                </p>
              )}
            </div>
          )}
        </Reveal>

        {/* 결제 정보 */}
        <Reveal as="section" variant="right">
          <SectionHeading>결제 정보</SectionHeading>
          <dl className="space-y-2.5 text-sm">
            <div className="flex items-baseline justify-between">
              <dt className="text-ink-400">상품 금액</dt>
              <dd className="krw text-ink-900">{krw(order.subtotal)}원</dd>
            </div>
            {order.discount_total > 0 && (
              <div className="flex items-baseline justify-between">
                <dt className="text-ink-400">
                  할인
                  {order.coupon_discount > 0 && (
                    <span className="ml-1.5 text-xs text-ink-400">
                      (쿠폰 {krw(order.coupon_discount)}원 포함)
                    </span>
                  )}
                </dt>
                <dd className="krw text-forest-700">-{krw(order.discount_total)}원</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between">
              <dt className="text-ink-400">배송비</dt>
              <dd className="krw text-ink-900">
                {order.shipping_fee === 0 ? "무료" : `${krw(order.shipping_fee)}원`}
              </dd>
            </div>
            <div className="hairline-t flex items-baseline justify-between pt-3">
              <dt className="font-medium text-ink-900">총 결제 금액</dt>
              <dd className="krw text-lg font-semibold text-ink-900">{krw(order.total)}원</dd>
            </div>
          </dl>

          {payment && (
            <div className="mt-5 border border-ink-200 px-5 py-4">
              <p className="label-caps text-ink-400">Payment</p>
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <p className="text-sm text-ink-900">
                  {payment.method ?? "토스페이먼츠"}
                  <span className="ml-2 text-xs text-ink-400">
                    {PAYMENT_STATUS_LABELS[payment.status]}
                  </span>
                </p>
                {payment.receipt_url && (
                  <a
                    href={payment.receipt_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="-my-1 inline-flex min-h-11 items-center gap-1 border border-forest-700/40 px-4 text-[13px] font-medium text-forest-700 transition-colors hover:border-forest-700 hover:text-forest-800 md:min-h-9"
                  >
                    영수증 보기
                    <ArrowUpRight size={14} strokeWidth={1.5} />
                  </a>
                )}
              </div>
              {payment.approved_at && (
                <p className="mt-1.5 text-xs text-ink-400">
                  {formatDateTime(payment.approved_at)} 승인
                </p>
              )}
            </div>
          )}
        </Reveal>
      </div>

      {/* 액션 */}
      <div className="hairline-t mt-12 pt-6">
        <OrderActions orderId={order.id} status={order.status} />
        {["shipped", "delivered"].includes(order.status) && (
          <p className="mt-4 text-right text-xs leading-relaxed text-ink-400">
            배송이 시작된 주문의 취소·교환·반품은 고객센터(031-963-3375)로 문의해 주세요.
          </p>
        )}
      </div>
    </div>
  );
}
