"use client";

import Image from "next/image";
import Link from "next/link";
import { X } from "lucide-react";
import { useCart } from "@/store/cart";
import { krw } from "@/lib/format";
import { calcShippingFee } from "@/lib/shipping";
import type { ShippingSettings } from "@/lib/types";
import EmptyState from "@/components/shop/EmptyState";
import PriceTag from "@/components/shop/PriceTag";
import QtyStepper from "@/components/shop/QtyStepper";
import Reveal from "@/components/shop/Reveal";
import Skeleton from "@/components/shop/Skeleton";
import { useMounted } from "./useMounted";

export interface CartViewProps {
  /** 서버에서 조회한 배송비 설정 */
  shipping: ShippingSettings;
}

/** 장바구니 화면 — useCart(persist) 기반이라 마운트 후에만 실제 내용 렌더 */
export default function CartView({ shipping }: CartViewProps) {
  const lines = useCart((s) => s.lines);
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);

  const mounted = useMounted();

  // ---------- 금액 계산 (표시용 — 최종 금액은 주문 생성 시 서버가 재계산) ----------
  const originalTotal = lines.reduce((sum, l) => sum + l.originalPrice * l.qty, 0);
  const itemsTotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
  const productDiscount = Math.max(0, originalTotal - itemsTotal);
  const shippingFee = itemsTotal > 0 ? calcShippingFee(itemsTotal, shipping) : 0;
  const total = itemsTotal + shippingFee;
  const remainForFree = Math.max(0, shipping.free_threshold - itemsTotal);
  const freeProgress =
    shipping.free_threshold > 0 ? Math.min(1, itemsTotal / shipping.free_threshold) : 1;

  const hasLines = mounted && lines.length > 0;

  return (
    <div
      className={`container-hall pt-10 md:pt-16 ${
        hasLines || !mounted ? "pb-28 lg:pb-24" : "pb-16 md:pb-24"
      }`}
    >
      <Reveal as="header" variant="fade">
        <p className="label-caps text-forest-600">Cart</p>
        <h1 className="headline-serif mt-3 text-3xl text-ink-900 md:text-4xl">장바구니</h1>
      </Reveal>

      {!mounted ? (
        <CartSkeleton />
      ) : lines.length === 0 ? (
        <Reveal variant="fade" delay={0.1}>
          <EmptyState
            title="장바구니가 아직 비어 있습니다."
            description="발효가 완성한 곤약의 식탁을 천천히 둘러보세요."
            action={{ href: "/products", label: "상품 보러 가기" }}
          />
        </Reveal>
      ) : (
        <div className="mt-8 grid items-start gap-x-10 gap-y-12 md:mt-12 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-x-14 lg:gap-y-14">
          {/* ---------- 상품 라인 ---------- */}
          <div className="min-w-0 lg:col-start-1 lg:row-start-1">
            <Reveal variant="rule" className="h-px w-full bg-ink-200" />
            <ul>
              {lines.map((l, i) => {
                const stockMax = Math.min(99, Math.max(l.stock, 1));
                const capped = l.stock > 0 && l.qty >= stockMax && l.stock < 99;
                return (
                  <Reveal
                    as="li"
                    variant="fade"
                    delay={Math.min(i * 0.08, 0.32)}
                    key={`${l.productId}::${l.variantId ?? ""}`}
                    className="flex gap-4 border-b border-ink-200 py-6 md:gap-6 md:py-7"
                  >
                    <Link
                      href={`/products/${l.slug}`}
                      className="showcase-img relative block aspect-[4/5] w-20 shrink-0 overflow-hidden bg-cream-100 md:w-24"
                    >
                      {l.imageUrl && (
                        <Image
                          src={l.imageUrl}
                          alt={l.name}
                          fill
                          sizes="(min-width: 768px) 96px, 80px"
                          className="object-cover"
                        />
                      )}
                    </Link>

                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            href={`/products/${l.slug}`}
                            className="block truncate text-sm font-medium text-ink-900 md:text-[15px]"
                          >
                            {l.name}
                          </Link>
                          {l.optionName && (
                            <p className="mt-1 truncate text-xs text-ink-500">
                              옵션 · {l.optionName}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => remove(l.productId, l.variantId)}
                          aria-label={`${l.name} 삭제`}
                          className="-mr-3 -mt-3 flex h-11 w-11 shrink-0 items-center justify-center text-ink-400 transition-colors hover:text-ink-900"
                        >
                          <X size={18} strokeWidth={1.5} />
                        </button>
                      </div>

                      <PriceTag
                        price={l.price}
                        compareAt={l.originalPrice}
                        size="sm"
                        className="mt-2"
                      />

                      <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-4">
                        <QtyStepper
                          value={l.qty}
                          onChange={(v) => setQty(l.productId, l.variantId, v)}
                          max={stockMax}
                          className="[&>button]:h-11 [&>button]:w-11"
                        />
                        <p className="krw text-[15px] font-semibold text-ink-900 md:text-base">
                          {krw(l.price * l.qty)}원
                        </p>
                      </div>

                      {capped && (
                        <p className="mt-2 text-xs text-signal-amber">
                          최대 주문 가능 수량입니다 (재고 {l.stock}개)
                        </p>
                      )}
                    </div>
                  </Reveal>
                );
              })}
            </ul>
          </div>

          {/* ---------- 주문 요약 ---------- */}
          <Reveal
            as="aside"
            variant="fade"
            delay={0.12}
            className="lg:sticky lg:top-28 lg:col-start-2 lg:row-start-1 lg:row-span-2"
          >
            <div className="border border-ink-200 bg-cream-100/60 p-6 md:p-7">
              <h2 className="headline-serif text-lg text-ink-900">주문 요약</h2>

              {/* 무료배송 프로그레스 */}
              <div className="mt-5">
                {shippingFee === 0 ? (
                  <p className="text-xs font-medium text-forest-700">
                    무료배송이 적용되었습니다.
                  </p>
                ) : (
                  <p className="text-xs text-ink-500">
                    <span className="krw font-semibold text-forest-700">
                      {krw(remainForFree)}원
                    </span>{" "}
                    더 담으시면 무료배송입니다.
                  </p>
                )}
                <div className="mt-2.5 h-[2px] w-full bg-ink-200">
                  <div
                    className="h-full bg-forest-600 transition-[width] duration-700 ease-hall"
                    style={{ width: `${freeProgress * 100}%` }}
                  />
                </div>
              </div>

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

              <Link
                href="/checkout"
                className="mt-7 block w-full bg-forest-600 py-4 text-center text-sm font-semibold text-cream-50 transition-colors duration-500 hover:bg-forest-700"
              >
                주문하기
              </Link>
              <Link
                href="/products"
                className="link-line mx-auto mt-5 block w-fit text-xs text-ink-500"
              >
                계속 쇼핑하기
              </Link>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-ink-400">
              장바구니 금액은 예상 금액이며, 최종 결제 금액은 주문 단계에서 다시 확인됩니다.
            </p>
          </Reveal>

          {/* ---------- 이용 안내 (좌측 하단 — 넓은 화면의 빈 자리를 채우는 조용한 정보) ---------- */}
          <Reveal
            as="section"
            variant="fade"
            delay={0.08}
            className="lg:col-start-1 lg:row-start-2"
          >
            <p className="label-caps text-ink-400">Shopping Guide</p>
            <dl className="mt-4 border-y border-ink-200 text-sm">
              <div className="flex gap-6 border-b border-ink-100 py-4">
                <dt className="w-20 shrink-0 text-ink-400">배송</dt>
                <dd className="leading-relaxed text-ink-600">
                  <span className="krw">{krw(shipping.free_threshold)}</span>원 이상 주문 시
                  무료배송, 미만 시 배송비{" "}
                  <span className="krw">{krw(shipping.base_fee)}</span>원이 더해집니다.
                </dd>
              </div>
              <div className="flex gap-6 border-b border-ink-100 py-4">
                <dt className="w-20 shrink-0 text-ink-400">신선 포장</dt>
                <dd className="leading-relaxed text-ink-600">
                  모든 상품은 주문 확인 후 신선한 상태 그대로 포장되어 출고됩니다.
                </dd>
              </div>
              <div className="flex gap-6 py-4">
                <dt className="w-20 shrink-0 text-ink-400">교환·환불</dt>
                <dd className="leading-relaxed text-ink-600">
                  상품에 문제가 있는 경우 고객센터를 통해 교환·환불을 도와드립니다.
                </dd>
              </div>
            </dl>
          </Reveal>
        </div>
      )}

      {/* ---------- 모바일 하단 고정 CTA ---------- */}
      {mounted && lines.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-cream-50/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-4 px-5 py-3">
            <div>
              <p className="text-[11px] text-ink-500">총 결제 금액</p>
              <p className="krw text-lg font-semibold text-ink-900">{krw(total)}원</p>
            </div>
            <Link
              href="/checkout"
              className="bg-forest-600 px-9 py-3.5 text-sm font-semibold text-cream-50 transition-colors hover:bg-forest-700"
            >
              주문하기
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

/** 마운트 전 스켈레톤 (persist 하이드레이션 대기) */
function CartSkeleton() {
  return (
    <div className="mt-8 grid items-start gap-10 md:mt-12 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-14">
      <div className="hairline-t">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex gap-4 border-b border-ink-200 py-6 md:gap-6">
            <Skeleton className="aspect-[4/5] w-20 md:w-24" />
            <div className="flex-1 space-y-3 py-1">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-32" />
            </div>
          </div>
        ))}
      </div>
      <Skeleton className="h-80 w-full" />
    </div>
  );
}
