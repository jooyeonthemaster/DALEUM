"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  loadTossPayments,
  ANONYMOUS,
  type TossPaymentsWidgets,
} from "@tosspayments/tosspayments-sdk";
import { useCart } from "@/store/cart";
import { track } from "@/lib/analytics";
import { krw } from "@/lib/format";
import { calcShippingFee } from "@/lib/shipping";
import { TOSS_CLIENT_KEY } from "@/lib/constants";
import type { Address, ShippingSettings } from "@/lib/types";
import EmptyState from "@/components/shop/EmptyState";
import Reveal from "@/components/shop/Reveal";
import Skeleton from "@/components/shop/Skeleton";
import AddressPickerModal from "./AddressPickerModal";
import PostcodeModal from "./PostcodeModal";
import { useMounted } from "./useMounted";

export interface CheckoutUser {
  id: string;
  email: string | null;
}

export interface CheckoutProfile {
  name: string | null;
  phone: string | null;
  email: string | null;
}

export interface CheckoutFormProps {
  user: CheckoutUser | null;
  profile: CheckoutProfile | null;
  addresses: Address[];
  shipping: ShippingSettings;
}

interface AppliedCoupon {
  code: string;
  name: string;
  discount: number;
}

const MEMO_OPTIONS = [
  "문 앞에 놓아 주세요",
  "경비실(관리실)에 맡겨 주세요",
  "택배함에 넣어 주세요",
  "배송 전에 연락 주세요",
] as const;
const MEMO_CUSTOM = "직접 입력";

const inputCls =
  "h-12 w-full rounded-none border border-ink-200 bg-cream-50 px-4 text-sm text-ink-900 placeholder:text-ink-400 transition-colors focus:border-ink-500";
const readonlyCls =
  "h-12 w-full rounded-none border border-ink-200 bg-cream-100 px-4 text-sm text-ink-600";
const labelCls = "mb-2 block text-xs font-medium text-ink-500";
const sectionTitleCls =
  "headline-serif border-b border-ink-200 pb-4 text-lg text-ink-900";

/** 주문/결제 폼 — 주문 생성(POST /api/orders) 후 토스 결제위젯으로 결제 요청 */
export default function CheckoutForm({ user, profile, addresses, shipping }: CheckoutFormProps) {
  const lines = useCart((s) => s.lines);
  const mounted = useMounted();

  const defaultAddress = addresses.find((a) => a.is_default) ?? addresses[0] ?? null;

  // ---------- 주문자 / 배송지 ----------
  const [orderer, setOrderer] = useState({
    name: profile?.name ?? "",
    phone: profile?.phone ?? "",
    email: profile?.email ?? user?.email ?? "",
  });
  const [recipient, setRecipient] = useState(() =>
    defaultAddress
      ? {
          name: defaultAddress.recipient,
          phone: defaultAddress.phone,
          postcode: defaultAddress.postcode,
          address1: defaultAddress.address1,
          address2: defaultAddress.address2 ?? "",
        }
      : { name: "", phone: "", postcode: "", address1: "", address2: "" }
  );
  const [memoChoice, setMemoChoice] = useState("");
  const [customMemo, setCustomMemo] = useState("");
  const [postcodeOpen, setPostcodeOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  // ---------- 쿠폰 ----------
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);

  // ---------- 결제 ----------
  const [agree, setAgree] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [widgetReady, setWidgetReady] = useState(false);
  const [widgetLoadError, setWidgetLoadError] = useState<string | null>(null);
  const widgetError =
    widgetLoadError ??
    (TOSS_CLIENT_KEY ? null : "결제 모듈 설정을 찾을 수 없습니다. 잠시 후 다시 시도해 주세요.");
  const widgetsRef = useRef<TossPaymentsWidgets | null>(null);
  const totalRef = useRef(0);

  // ---------- 금액 (표시용 — 최종 금액은 서버가 확정) ----------
  const originalTotal = lines.reduce((s, l) => s + l.originalPrice * l.qty, 0);
  const itemsTotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const productDiscount = Math.max(0, originalTotal - itemsTotal);
  const couponDiscount = coupon ? Math.min(coupon.discount, itemsTotal) : 0;
  const shippingFee = itemsTotal > 0 ? calcShippingFee(itemsTotal - couponDiscount, shipping) : 0;
  const total = itemsTotal - couponDiscount + shippingFee;

  // ---------- 토스 결제위젯 초기화 (마운트 + 장바구니 존재 시 1회) ----------
  useEffect(() => {
    if (!mounted || lines.length === 0 || widgetsRef.current || !TOSS_CLIENT_KEY) return;
    let cancelled = false;
    (async () => {
      try {
        const toss = await loadTossPayments(TOSS_CLIENT_KEY);
        if (cancelled) return;
        const widgets = toss.widgets({ customerKey: user?.id ?? ANONYMOUS });
        widgetsRef.current = widgets;
        await widgets.setAmount({ currency: "KRW", value: totalRef.current });
        await Promise.all([
          widgets.renderPaymentMethods({
            selector: "#toss-payment-methods",
            variantKey: "DEFAULT",
          }),
          widgets.renderAgreement({ selector: "#toss-agreement", variantKey: "AGREEMENT" }),
        ]);
        if (!cancelled) setWidgetReady(true);
      } catch (e) {
        console.error("[checkout] 토스 위젯 초기화 실패:", e);
        if (!cancelled) {
          setWidgetLoadError("결제 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mounted, lines.length, user?.id]);

  // 금액 변동(쿠폰 적용 등) 시 위젯 금액 동기화
  useEffect(() => {
    totalRef.current = total;
    if (widgetReady && total > 0) {
      widgetsRef.current?.setAmount({ currency: "KRW", value: total }).catch(() => {});
    }
  }, [total, widgetReady]);

  // ---------- 헬퍼 ----------
  const finalMemo = (memoChoice === MEMO_CUSTOM ? customMemo : memoChoice).trim();

  function copyOrdererToRecipient() {
    setRecipient((r) => ({ ...r, name: orderer.name, phone: orderer.phone }));
  }

  function handleSelectAddress(a: Address) {
    setRecipient({
      name: a.recipient,
      phone: a.phone,
      postcode: a.postcode,
      address1: a.address1,
      address2: a.address2 ?? "",
    });
    setPickerOpen(false);
  }

  async function applyCoupon() {
    const code = couponInput.trim();
    if (!code) {
      setCouponError("쿠폰 코드를 입력해 주세요.");
      return;
    }
    setCouponLoading(true);
    setCouponError(null);
    try {
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, subtotal: itemsTotal }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        coupon?: { code: string; name: string };
        discount?: number;
      };
      if (!res.ok || !data.coupon) {
        throw new Error(data.error ?? "쿠폰을 확인하지 못했습니다.");
      }
      setCoupon({ code: data.coupon.code, name: data.coupon.name, discount: data.discount ?? 0 });
      setCouponInput("");
    } catch (e) {
      setCoupon(null);
      setCouponError(e instanceof Error ? e.message : "쿠폰을 확인하지 못했습니다.");
    } finally {
      setCouponLoading(false);
    }
  }

  function validate(): string | null {
    if (!orderer.name.trim()) return "주문하시는 분의 성함을 입력해 주세요.";
    if (orderer.phone.replace(/\D/g, "").length < 10)
      return "주문자 연락처를 정확히 입력해 주세요.";
    const email = orderer.email.trim();
    if (email && !/^\S+@\S+\.\S+$/.test(email)) return "이메일 형식이 올바르지 않습니다.";
    if (!recipient.name.trim()) return "받으시는 분의 성함을 입력해 주세요.";
    if (recipient.phone.replace(/\D/g, "").length < 10)
      return "수령인 연락처를 정확히 입력해 주세요.";
    if (!recipient.postcode || !recipient.address1.trim())
      return "우편번호 검색으로 배송지 주소를 입력해 주세요.";
    if (!agree) return "주문 내용 확인 및 결제 진행에 동의해 주세요.";
    return null;
  }

  // ---------- 결제하기 ----------
  async function handlePay() {
    setError(null);
    const invalid = validate();
    if (invalid) {
      setError(invalid);
      return;
    }
    const widgets = widgetsRef.current;
    if (!widgets || !widgetReady) {
      setError("결제 모듈이 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    setPaying(true);
    track("begin_checkout", { meta: { item_count: lines.length, estimated_total: total } });

    try {
      // 1) 서버에 주문 생성 — 금액은 서버가 전면 재계산
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: lines.map((l) => ({
            productId: l.productId,
            ...(l.variantId ? { variantId: l.variantId } : {}),
            qty: l.qty,
          })),
          orderer: {
            name: orderer.name.trim(),
            phone: orderer.phone.trim(),
            ...(orderer.email.trim() ? { email: orderer.email.trim() } : {}),
          },
          recipient: {
            name: recipient.name.trim(),
            phone: recipient.phone.trim(),
            postcode: recipient.postcode,
            address1: recipient.address1.trim(),
            ...(recipient.address2.trim() ? { address2: recipient.address2.trim() } : {}),
            ...(finalMemo ? { memo: finalMemo } : {}),
          },
          ...(coupon ? { couponCode: coupon.code } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        orderNo?: string;
        amount?: number;
      };
      if (!res.ok || !data.orderNo || typeof data.amount !== "number") {
        throw new Error(data.error ?? "주문 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      }

      // 2) 서버 확정 금액으로 위젯 금액 세팅 후 결제 요청
      await widgets.setAmount({ currency: "KRW", value: data.amount });

      const first = lines[0];
      const orderName = (
        lines.length > 1 ? `${first.name} 외 ${lines.length - 1}건` : first.name
      ).slice(0, 100);
      const phoneDigits = orderer.phone.replace(/\D/g, "");

      await widgets.requestPayment({
        orderId: data.orderNo,
        orderName,
        successUrl: `${window.location.origin}/checkout/success`,
        failUrl: `${window.location.origin}/checkout/fail`,
        customerName: orderer.name.trim(),
        ...(orderer.email.trim() ? { customerEmail: orderer.email.trim() } : {}),
        ...(/^\d{10,11}$/.test(phoneDigits) ? { customerMobilePhone: phoneDigits } : {}),
      });
      // 리다이렉트 방식 — 성공/실패 모두 페이지 이동으로 이어진다
    } catch (e) {
      const message =
        e instanceof Error && e.message ? e.message : "결제를 진행하지 못했습니다.";
      setError(message);
    } finally {
      setPaying(false);
    }
  }

  // ---------- 렌더 ----------
  if (!mounted) return <CheckoutSkeleton />;

  if (lines.length === 0) {
    return (
      <EmptyState
        title="주문할 상품이 없습니다."
        description="장바구니에 상품을 담은 뒤 결제를 진행해 주세요."
        action={{ href: "/products", label: "상품 보러 가기" }}
        className="flex-1"
      />
    );
  }

  const count = lines.reduce((n, l) => n + l.qty, 0);

  return (
    <div className="container-hall pb-20 pt-10 md:pb-24 md:pt-16">
      <Reveal as="header" variant="fade">
        <p className="label-caps text-forest-600">Checkout</p>
        <h1 className="headline-serif mt-3 text-3xl text-ink-900 md:text-4xl">주문 / 결제</h1>
        {!user && (
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-ink-500">
            이미 회원이신가요?{" "}
            <Link href="/login" className="link-line font-medium text-ink-900">
              로그인
            </Link>
            하시면 배송지를 바로 불러올 수 있습니다.{" "}
            <br className="hidden md:block" />
            비회원으로도 주문하실 수 있습니다.
          </p>
        )}
      </Reveal>

      <div className="mt-10 grid items-start gap-x-16 gap-y-12 md:mt-12 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-y-14">
        {/* ==================== 좌측 상단: 주문 정보 입력 ==================== */}
        <div className="min-w-0 space-y-12 lg:col-start-1 lg:row-start-1">
          {/* ---------- 주문 상품 ---------- */}
          <section>
            <h2 className={sectionTitleCls}>
              주문 상품 <span className="krw text-sm text-ink-400">({count}개)</span>
            </h2>
            <ul className="divide-y divide-ink-100">
              {lines.map((l) => (
                <li
                  key={`${l.productId}::${l.variantId ?? ""}`}
                  className="flex items-center gap-4 py-4"
                >
                  <div className="relative aspect-[4/5] w-14 shrink-0 overflow-hidden bg-cream-100">
                    {l.imageUrl && (
                      <Image
                        src={l.imageUrl}
                        alt={l.name}
                        fill
                        sizes="56px"
                        className="object-cover"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900">{l.name}</p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {l.optionName ? `${l.optionName} · ` : ""}
                      {l.qty}개
                    </p>
                  </div>
                  <p className="krw shrink-0 text-sm font-semibold text-ink-900">
                    {krw(l.price * l.qty)}원
                  </p>
                </li>
              ))}
            </ul>
          </section>

          {/* ---------- 주문자 정보 ---------- */}
          <section>
            <h2 className={sectionTitleCls}>주문자 정보</h2>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="orderer-name" className={labelCls}>
                  이름 <span className="text-signal-red">*</span>
                </label>
                <input
                  id="orderer-name"
                  type="text"
                  value={orderer.name}
                  onChange={(e) => setOrderer((o) => ({ ...o, name: e.target.value }))}
                  placeholder="주문하시는 분 성함"
                  autoComplete="name"
                  className={inputCls}
                />
              </div>
              <div>
                <label htmlFor="orderer-phone" className={labelCls}>
                  연락처 <span className="text-signal-red">*</span>
                </label>
                <input
                  id="orderer-phone"
                  type="tel"
                  value={orderer.phone}
                  onChange={(e) => setOrderer((o) => ({ ...o, phone: e.target.value }))}
                  placeholder="01012345678"
                  autoComplete="tel"
                  className={inputCls}
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="orderer-email" className={labelCls}>
                  이메일{" "}
                  <span className="font-normal text-ink-400">
                    {user ? "(선택)" : "(선택 — 주문 확인 메일을 받으실 수 있습니다)"}
                  </span>
                </label>
                <input
                  id="orderer-email"
                  type="email"
                  value={orderer.email}
                  onChange={(e) => setOrderer((o) => ({ ...o, email: e.target.value }))}
                  placeholder="daleum@daleum.kr"
                  autoComplete="email"
                  className={inputCls}
                />
              </div>
            </div>
          </section>

          {/* ---------- 배송지 ---------- */}
          <section>
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-ink-200 pb-4">
              <h2 className="headline-serif text-lg text-ink-900">배송지</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={copyOrdererToRecipient}
                  className="border border-ink-200 px-4 py-2.5 text-xs text-ink-600 transition-colors hover:border-ink-900 hover:text-ink-900"
                >
                  주문자와 동일
                </button>
                {addresses.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className="border border-ink-900 px-4 py-2.5 text-xs font-medium text-ink-900 transition-colors hover:bg-ink-900 hover:text-cream-50"
                  >
                    배송지 선택
                  </button>
                )}
              </div>
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="recipient-name" className={labelCls}>
                  받는 분 <span className="text-signal-red">*</span>
                </label>
                <input
                  id="recipient-name"
                  type="text"
                  value={recipient.name}
                  onChange={(e) => setRecipient((r) => ({ ...r, name: e.target.value }))}
                  placeholder="받으시는 분 성함"
                  className={inputCls}
                />
              </div>
              <div>
                <label htmlFor="recipient-phone" className={labelCls}>
                  연락처 <span className="text-signal-red">*</span>
                </label>
                <input
                  id="recipient-phone"
                  type="tel"
                  value={recipient.phone}
                  onChange={(e) => setRecipient((r) => ({ ...r, phone: e.target.value }))}
                  placeholder="01012345678"
                  className={inputCls}
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="recipient-postcode" className={labelCls}>
                  주소 <span className="text-signal-red">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    id="recipient-postcode"
                    type="text"
                    value={recipient.postcode}
                    readOnly
                    placeholder="우편번호"
                    className={`${readonlyCls} max-w-[140px]`}
                    onClick={() => setPostcodeOpen(true)}
                  />
                  <button
                    type="button"
                    onClick={() => setPostcodeOpen(true)}
                    className="h-12 shrink-0 border border-ink-900 px-5 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-900 hover:text-cream-50"
                  >
                    우편번호 검색
                  </button>
                </div>
                <input
                  type="text"
                  value={recipient.address1}
                  readOnly
                  placeholder="주소 (우편번호 검색 시 자동 입력)"
                  aria-label="기본 주소"
                  className={`${readonlyCls} mt-2`}
                  onClick={() => setPostcodeOpen(true)}
                />
                <input
                  type="text"
                  value={recipient.address2}
                  onChange={(e) => setRecipient((r) => ({ ...r, address2: e.target.value }))}
                  placeholder="상세 주소 (동/호수 등)"
                  aria-label="상세 주소"
                  className={`${inputCls} mt-2`}
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="delivery-memo" className={labelCls}>
                  배송 메모
                </label>
                <select
                  id="delivery-memo"
                  value={memoChoice}
                  onChange={(e) => setMemoChoice(e.target.value)}
                  className={`${inputCls} appearance-none`}
                >
                  <option value="">배송 메모를 선택해 주세요</option>
                  {MEMO_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                  <option value={MEMO_CUSTOM}>{MEMO_CUSTOM}</option>
                </select>
                {memoChoice === MEMO_CUSTOM && (
                  <input
                    type="text"
                    value={customMemo}
                    onChange={(e) => setCustomMemo(e.target.value)}
                    maxLength={200}
                    placeholder="배송 시 요청하실 내용을 적어 주세요"
                    aria-label="배송 메모 직접 입력"
                    className={`${inputCls} mt-2`}
                  />
                )}
              </div>
            </div>
          </section>

          {/* ---------- 쿠폰 ---------- */}
          <section>
            <h2 className={sectionTitleCls}>쿠폰</h2>
            {coupon ? (
              <div className="mt-6 flex items-center justify-between gap-4 border border-forest-600/40 bg-forest-50 px-5 py-4">
                <div>
                  <p className="text-sm font-medium text-ink-900">{coupon.name}</p>
                  <p className="krw mt-0.5 text-xs text-forest-700">
                    {coupon.code} · {krw(couponDiscount)}원 할인
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCoupon(null);
                    setCouponError(null);
                  }}
                  className="link-line shrink-0 text-xs text-ink-500"
                >
                  적용 해제
                </button>
              </div>
            ) : (
              <div className="mt-6 flex gap-2">
                <input
                  type="text"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      applyCoupon();
                    }
                  }}
                  placeholder="쿠폰 코드를 입력해 주세요"
                  aria-label="쿠폰 코드"
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={applyCoupon}
                  disabled={couponLoading}
                  className="h-12 shrink-0 border border-ink-900 px-6 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-900 hover:text-cream-50 disabled:opacity-40"
                >
                  {couponLoading ? "확인 중" : "적용"}
                </button>
              </div>
            )}
            {couponError && <p className="mt-2 text-xs text-signal-red">{couponError}</p>}
          </section>
        </div>

        {/* ==================== 우측: 결제 금액 요약 (모바일에서는 결제 수단 앞) ==================== */}
        <aside className="lg:sticky lg:top-28 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div className="border border-ink-200 bg-cream-100/60 p-6 md:p-7">
            <h2 className="headline-serif text-lg text-ink-900">결제 금액</h2>
            <dl className="mt-6 space-y-3 text-sm">
              <div className="flex items-baseline justify-between">
                <dt className="text-ink-500">상품 금액</dt>
                <dd className="krw text-ink-900">{krw(originalTotal)}원</dd>
              </div>
              {productDiscount > 0 && (
                <div className="flex items-baseline justify-between">
                  <dt className="text-ink-500">상품 할인</dt>
                  <dd className="krw text-forest-700">−{krw(productDiscount)}원</dd>
                </div>
              )}
              {couponDiscount > 0 && (
                <div className="flex items-baseline justify-between">
                  <dt className="text-ink-500">쿠폰 할인</dt>
                  <dd className="krw text-forest-700">−{krw(couponDiscount)}원</dd>
                </div>
              )}
              <div className="flex items-baseline justify-between">
                <dt className="text-ink-500">배송비</dt>
                <dd className="krw text-ink-900">
                  {shippingFee === 0 ? "무료" : `${krw(shippingFee)}원`}
                </dd>
              </div>
            </dl>
            <div className="mt-6 flex items-baseline justify-between border-t border-ink-200 pt-5">
              <p className="text-sm font-medium text-ink-900">총 결제 금액</p>
              <p className="krw text-xl font-semibold text-ink-900">{krw(total)}원</p>
            </div>
            {shippingFee > 0 && (
              <p className="mt-4 text-xs leading-relaxed text-ink-400">
                {krw(shipping.free_threshold)}원 이상 주문 시 배송비가 무료입니다.
              </p>
            )}
          </div>
        </aside>

        {/* ==================== 좌측 하단: 결제 수단 (토스 결제위젯) ==================== */}
        <section className="min-w-0 lg:col-start-1 lg:row-start-2">
          <h2 className={sectionTitleCls}>결제 수단</h2>
          {widgetError ? (
            <p className="mt-6 border border-signal-red/30 px-5 py-4 text-sm text-signal-red">
              {widgetError}
            </p>
          ) : (
            <div className="relative mt-6 border border-ink-200">
              {/* 로딩 중에도 위젯 실측 높이만큼 자리를 잡아 레이아웃 점프를 없앤다 */}
              <div className={widgetReady ? undefined : "min-h-[600px] sm:min-h-[560px]"}>
                <div id="toss-payment-methods" />
                <div id="toss-agreement" />
              </div>
              {!widgetReady && (
                <div className="absolute inset-0 bg-cream-50 p-6" aria-hidden>
                  <Skeleton className="h-5 w-24" />
                  <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="hidden h-16 w-full sm:block" />
                    <Skeleton className="hidden h-16 w-full sm:block" />
                  </div>
                  <Skeleton className="mt-5 h-12 w-full" />
                  <Skeleton className="mt-8 h-5 w-2/3" />
                </div>
              )}
            </div>
          )}

          <label className="mt-7 flex cursor-pointer items-start gap-3 py-1 text-sm leading-relaxed text-ink-600">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-forest-600"
            />
            <span>
              주문할 상품의 내용과 결제 정보를 확인하였으며, 구매 진행 및 개인정보
              수집·이용(주문 처리 목적)에 동의합니다.{" "}
              <span className="font-medium text-ink-900">(필수)</span>
            </span>
          </label>

          {error && (
            <p
              role="alert"
              className="mt-5 border border-signal-red/30 bg-cream-100 px-5 py-3.5 text-sm text-signal-red"
            >
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handlePay}
            disabled={paying || !widgetReady}
            className="mt-6 w-full bg-forest-600 py-4 text-center text-[15px] font-semibold text-cream-50 transition-colors duration-500 hover:bg-forest-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {paying ? "결제 준비 중…" : `${krw(total)}원 결제하기`}
          </button>
          <p className="mt-4 text-center text-xs text-ink-400">
            최종 결제 금액은 서버에서 다시 한번 검증됩니다.
          </p>
        </section>
      </div>

      {/* ---------- 모달 ---------- */}
      <PostcodeModal
        open={postcodeOpen}
        onClose={() => setPostcodeOpen(false)}
        onComplete={({ postcode, address1 }) =>
          setRecipient((r) => ({ ...r, postcode, address1, address2: "" }))
        }
      />
      <AddressPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        addresses={addresses}
        onSelect={handleSelectAddress}
      />
    </div>
  );
}

/** 마운트 전 스켈레톤 */
function CheckoutSkeleton() {
  return (
    <div className="container-hall pb-24 pt-10 md:pt-16">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-4 h-9 w-48" />
      <div className="mt-12 grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-16">
        <div className="space-y-10">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    </div>
  );
}
