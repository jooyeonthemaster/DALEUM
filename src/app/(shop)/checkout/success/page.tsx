import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { krw, formatPhone } from "@/lib/format";
import { COMPANY } from "@/lib/constants";
import type { OrdererInfo, RecipientInfo } from "@/lib/types";
import PurchaseComplete from "@/components/checkout/PurchaseComplete";
import Reveal from "@/components/shop/Reveal";
import RevealText from "@/components/shop/RevealText";

export const metadata: Metadata = {
  title: "주문 완료",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

interface SuccessSearchParams {
  paymentKey?: string;
  orderId?: string;
  amount?: string;
}

interface ConfirmedOrder {
  id: string;
  order_no: string;
  user_id: string | null;
  subtotal: number;
  discount_total: number;
  coupon_discount: number;
  shipping_fee: number;
  total: number;
  orderer: OrdererInfo;
  recipient: RecipientInfo;
  order_items: { name_snapshot: string; qty: number }[];
}

async function getBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  }
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

/**
 * 결제 성공 리다이렉트 — 서버에서 /api/payments/confirm 호출 후 결과 렌더.
 * 클라이언트 금액은 신뢰하지 않고 그대로 전달만 하며, 검증은 서버(API)가 수행한다.
 */
export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<SuccessSearchParams>;
}) {
  const { paymentKey, orderId, amount } = await searchParams;
  const amountNum = Number(amount);

  if (!paymentKey || !orderId || !amount || !Number.isSafeInteger(amountNum) || amountNum <= 0) {
    return (
      <FailureView
        title="잘못된 접근입니다."
        description="결제 정보가 올바르게 전달되지 않았습니다. 장바구니에서 다시 시도해 주세요."
        actions={[{ href: "/cart", label: "장바구니로 가기" }]}
      />
    );
  }

  // ---------- 결제 승인 (서버 → 서버) ----------
  let status = 0;
  let confirmData: { orderId?: string; error?: string } = {};
  try {
    const res = await fetch(`${await getBaseUrl()}/api/payments/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentKey, orderId, amount: amountNum }),
      cache: "no-store",
    });
    status = res.status;
    confirmData = (await res.json().catch(() => ({}))) as typeof confirmData;
  } catch {
    status = 0;
  }

  // ---------- 실패 분기 ----------
  if (status !== 200) {
    if (status === 502) {
      return (
        <FailureView
          title="결제가 완료되지 않았습니다."
          description={confirmData.error ?? "결제 승인에 실패했습니다."}
          note="주문하신 내용과 장바구니는 그대로 남아 있습니다. 다시 결제를 진행해 주세요."
          actions={[
            { href: "/checkout", label: "다시 결제하기" },
            { href: "/cart", label: "장바구니로 가기" },
          ]}
        />
      );
    }
    if (status === 400) {
      return (
        <FailureView
          title="결제를 완료하지 못했습니다."
          description={confirmData.error ?? "결제 금액 검증에 실패했습니다."}
          note="금액 검증에 실패한 결제는 안전을 위해 승인되지 않습니다. 장바구니에서 다시 주문해 주세요."
          actions={[{ href: "/cart", label: "장바구니로 가기" }]}
        />
      );
    }
    if (status === 500) {
      return (
        <FailureView
          title="주문 반영이 지연되고 있습니다."
          description={
            confirmData.error ??
            "결제는 완료되었으나 주문 처리가 지연되고 있습니다. 잠시 후 주문 내역을 확인해 주세요."
          }
          note={`잠시 후에도 주문이 보이지 않으면 고객센터(${COMPANY.tel})로 문의해 주세요.`}
          actions={[
            { href: "/mypage/orders", label: "주문 내역 확인" },
            { href: "/", label: "홈으로" },
          ]}
        />
      );
    }
    return (
      <FailureView
        title="결제를 완료하지 못했습니다."
        description={confirmData.error ?? "결제 처리 중 문제가 발생했습니다. 다시 시도해 주세요."}
        actions={[
          { href: "/checkout", label: "다시 결제하기" },
          { href: "/cart", label: "장바구니로 가기" },
        ]}
      />
    );
  }

  // ---------- 승인 성공 — 주문 정보 조회 (서버 전용 service client) ----------
  const service = createServiceClient();
  const { data: orderData } = await service
    .from("orders")
    .select(
      "id, order_no, user_id, subtotal, discount_total, coupon_discount, shipping_fee, total, orderer, recipient, order_items(name_snapshot, qty)"
    )
    .eq("id", confirmData.orderId ?? "")
    .maybeSingle();
  const order = orderData as unknown as ConfirmedOrder | null;

  if (!order) {
    return (
      <FailureView
        title="주문 정보를 불러오지 못했습니다."
        description="결제는 정상적으로 완료되었습니다. 주문 내역에서 확인해 주세요."
        actions={[
          { href: "/mypage/orders", label: "주문 내역 확인" },
          { href: "/", label: "홈으로" },
        ]}
      />
    );
  }

  // 회원 본인 주문이면 주문 상세 링크 노출
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isMine = !!user && order.user_id === user.id;

  const discount = order.discount_total;
  const itemsLabel =
    order.order_items.length > 1
      ? `${order.order_items[0]?.name_snapshot} 외 ${order.order_items.length - 1}건`
      : (order.order_items[0]?.name_snapshot ?? "");

  return (
    <div className="container-hall flex flex-1 flex-col items-center py-20 text-center md:py-28">
      <PurchaseComplete orderId={order.id} orderNo={order.order_no} amount={order.total} />

      <Reveal variant="fade">
        <span className="mx-auto mb-8 block h-10 w-px bg-ink-200" aria-hidden />
        <p className="label-caps text-forest-600">Order Complete</p>
      </Reveal>
      <RevealText
        as="h1"
        text="감사합니다."
        delay={0.15}
        className="headline-serif mt-4 text-3xl text-ink-900 md:text-4xl"
      />
      <Reveal as="p" variant="fade" delay={0.25} className="mt-4 max-w-md text-sm leading-relaxed text-ink-500">
        주문이 정상적으로 완료되었습니다.
        <br />
        정성껏 준비해 신선하게 보내드리겠습니다.
      </Reveal>

      <Reveal variant="fade" delay={0.35} className="mt-10">
        <p className="label-caps text-ink-400">주문번호</p>
        <p className="krw mt-1.5 text-xl font-semibold tracking-wide text-ink-900">
          {order.order_no}
        </p>
      </Reveal>

      {/* ---------- 주문 요약 ---------- */}
      <Reveal
        variant="fade"
        delay={0.45}
        className="mt-10 w-full max-w-lg border border-ink-200 text-left text-sm"
      >
        <div className="flex gap-6 border-b border-ink-100 px-5 py-4">
          <p className="w-16 shrink-0 text-ink-400">주문 상품</p>
          <p className="text-ink-900">{itemsLabel}</p>
        </div>
        <div className="flex gap-6 border-b border-ink-100 px-5 py-4">
          <p className="w-16 shrink-0 text-ink-400">받는 분</p>
          <p className="text-ink-900">
            {order.recipient.name} · {formatPhone(order.recipient.phone)}
          </p>
        </div>
        <div className="flex gap-6 border-b border-ink-100 px-5 py-4">
          <p className="w-16 shrink-0 text-ink-400">배송지</p>
          <p className="leading-relaxed text-ink-900">
            ({order.recipient.postcode}) {order.recipient.address1}
            {order.recipient.address2 ? ` ${order.recipient.address2}` : ""}
          </p>
        </div>
        {order.recipient.memo && (
          <div className="flex gap-6 border-b border-ink-100 px-5 py-4">
            <p className="w-16 shrink-0 text-ink-400">배송 메모</p>
            <p className="text-ink-900">{order.recipient.memo}</p>
          </div>
        )}
        <dl className="space-y-2.5 bg-cream-100/60 px-5 py-5">
          <div className="flex items-baseline justify-between">
            <dt className="text-ink-500">상품 금액</dt>
            <dd className="krw text-ink-900">{krw(order.subtotal)}원</dd>
          </div>
          {discount > 0 && (
            <div className="flex items-baseline justify-between">
              <dt className="text-ink-500">할인</dt>
              <dd className="krw text-forest-700">−{krw(discount)}원</dd>
            </div>
          )}
          <div className="flex items-baseline justify-between">
            <dt className="text-ink-500">배송비</dt>
            <dd className="krw text-ink-900">
              {order.shipping_fee === 0 ? "무료" : `${krw(order.shipping_fee)}원`}
            </dd>
          </div>
          <div className="flex items-baseline justify-between border-t border-ink-200 pt-3">
            <dt className="font-medium text-ink-900">총 결제 금액</dt>
            <dd className="krw text-lg font-semibold text-ink-900">{krw(order.total)}원</dd>
          </div>
        </dl>
      </Reveal>

      {!isMine && (
        <Reveal
          as="p"
          variant="fade"
          delay={0.5}
          className="mt-6 max-w-md text-xs leading-relaxed text-ink-400"
        >
          비회원 주문은 주문번호와 주문자 연락처로 조회·취소하실 수 있습니다. 주문번호를 꼭
          보관해 주세요. 문의: {COMPANY.tel} ({COMPANY.csHours})
        </Reveal>
      )}

      <Reveal
        variant="fade"
        delay={0.55}
        className="mt-12 flex flex-col items-center gap-3 sm:flex-row"
      >
        {isMine && (
          <Link
            href={`/mypage/orders/${order.id}`}
            className="label-caps inline-block bg-ink-900 px-9 py-3.5 text-cream-50 transition-colors duration-500 hover:bg-forest-800"
          >
            주문 상세 보기
          </Link>
        )}
        <Link
          href="/products"
          className="label-caps inline-block border border-ink-900 px-9 py-3.5 text-ink-900 transition-colors duration-500 hover:bg-ink-900 hover:text-cream-50"
        >
          계속 쇼핑하기
        </Link>
      </Reveal>
    </div>
  );
}

/** 승인 실패/오류 화면 */
function FailureView({
  title,
  description,
  note,
  actions,
}: {
  title: string;
  description: string;
  note?: string;
  actions: { href: string; label: string }[];
}) {
  return (
    <div className="container-hall flex flex-1 flex-col items-center py-20 text-center md:py-28">
      <Reveal variant="fade" className="flex flex-col items-center">
        <span className="mb-8 block h-10 w-px bg-ink-200" aria-hidden />
        <h1 className="headline-serif max-w-md text-balance text-2xl text-ink-900 md:text-3xl">
          {title}
        </h1>
        <p className="mt-4 max-w-md text-balance text-sm leading-relaxed text-signal-red">
          {description}
        </p>
        {note && (
          <p className="mt-3 max-w-md text-balance text-sm leading-relaxed text-ink-500">
            {note}
          </p>
        )}
      </Reveal>
      <Reveal variant="fade" delay={0.15} className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
        {actions.map((a, i) => (
          <Link
            key={a.href}
            href={a.href}
            className={
              i === 0
                ? "label-caps inline-block bg-ink-900 px-9 py-3.5 text-cream-50 transition-colors duration-500 hover:bg-forest-800"
                : "label-caps inline-block border border-ink-900 px-9 py-3.5 text-ink-900 transition-colors duration-500 hover:bg-ink-900 hover:text-cream-50"
            }
          >
            {a.label}
          </Link>
        ))}
      </Reveal>
    </div>
  );
}
