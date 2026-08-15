"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronDown } from "lucide-react";
import PriceTag from "@/components/shop/PriceTag";
import QtyStepper from "@/components/shop/QtyStepper";
import Expandable from "./Expandable";
import { useCart } from "@/store/cart";
import { track } from "@/lib/analytics";
import { krw } from "@/lib/format";

export interface PurchaseOption {
  id: string;
  name: string;
  priceDelta: number;
  stock: number;
  /** VIP 반영 단가 (정가+추가금 기준으로 서버에서 해석됨) */
  effectivePrice: number;
  /** 정가 + 옵션 추가금 */
  originalPrice: number;
}

export interface PurchaseProduct {
  id: string;
  slug: string;
  name: string;
  /** 옵션이 없을 때 사용하는 상품 재고 */
  stock: number;
  /** status === "sold_out" 등 서버에서 판정된 품절 여부 */
  soldOut: boolean;
  /** VIP 반영 단가 (옵션 미포함) */
  effectivePrice: number;
  /** 정가 */
  price: number;
  compareAtPrice: number | null;
  vipApplied: boolean;
  imageUrl: string | null;
}

export interface SpecRow {
  label: string;
  value: string;
}

export interface AddToCartProps {
  product: PurchaseProduct;
  options?: PurchaseOption[];
  /** 가격 아래에 헤어라인 행으로 표시할 스펙 (보관/원산지/중량 등) */
  specs?: SpecRow[];
  /** 버튼 행 좌측 슬롯 — 위시리스트 토글 버튼 */
  wishlistSlot?: ReactNode;
  className?: string;
}

const LOW_STOCK_THRESHOLD = 10;

/**
 * 상품 상세 구매 박스 — 옵션/수량/합계/담기·바로구매.
 * 모바일에서는 하단 고정 CTA 바가 함께 렌더된다.
 */
export default function AddToCart({
  product,
  options = [],
  specs = [],
  wishlistSlot,
  className = "",
}: AddToCartProps) {
  const router = useRouter();
  const addLine = useCart((s) => s.add);

  const hasOptions = options.length > 0;
  const [optionId, setOptionId] = useState<string | null>(() => {
    if (!hasOptions) return null;
    return (options.find((o) => o.stock > 0) ?? options[0]).id;
  });
  const selected = hasOptions
    ? options.find((o) => o.id === optionId) ?? null
    : null;

  const unitPrice = selected ? selected.effectivePrice : product.effectivePrice;
  const unitOriginal = selected ? selected.originalPrice : product.price;
  const compareAt =
    unitOriginal > unitPrice
      ? unitOriginal
      : product.compareAtPrice != null
        ? product.compareAtPrice + (selected?.priceDelta ?? 0)
        : null;

  const stock = selected ? selected.stock : product.stock;
  const soldOut = product.soldOut || stock <= 0;
  const maxQty = Math.min(99, Math.max(stock, 1));

  // 옵션 변경으로 재고가 줄어도 렌더 시점에 자동 클램프
  const [rawQty, setRawQty] = useState(1);
  const qty = Math.max(1, Math.min(rawQty, maxQty));

  // ---------- 담김 토스트 ----------
  const [toastMounted, setToastMounted] = useState(false);
  const [toastShown, setToastShown] = useState(false);
  const toastTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const timers = toastTimers.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  function showToast() {
    toastTimers.current.forEach(clearTimeout);
    toastTimers.current = [];
    setToastMounted(true);
    setToastShown(false);
    toastTimers.current.push(
      setTimeout(() => setToastShown(true), 30),
      setTimeout(() => setToastShown(false), 2800),
      setTimeout(() => setToastMounted(false), 3400)
    );
  }

  function handleAdd(goCheckout: boolean) {
    if (soldOut) return;
    addLine({
      productId: product.id,
      variantId: selected?.id ?? null,
      slug: product.slug,
      name: product.name,
      optionName: selected?.name ?? null,
      price: unitPrice,
      originalPrice: unitOriginal,
      imageUrl: product.imageUrl,
      qty,
      stock,
    });
    track("add_to_cart", {
      productId: product.id,
      meta: { qty, option: selected?.name ?? null, buyNow: goCheckout },
    });
    if (goCheckout) {
      router.push("/checkout");
    } else {
      showToast();
    }
  }

  const secondaryBtn =
    "flex h-12 flex-1 items-center justify-center border border-ink-900 text-sm font-medium text-ink-900 transition-colors duration-300 hover:bg-ink-900 hover:text-cream-50 disabled:cursor-not-allowed disabled:border-ink-200 disabled:text-ink-300 disabled:hover:bg-transparent";
  const primaryBtn =
    "flex h-12 flex-1 items-center justify-center bg-forest-700 text-sm font-medium text-cream-50 transition-colors duration-300 hover:bg-forest-800 disabled:cursor-not-allowed disabled:bg-ink-200 disabled:text-cream-50 disabled:hover:bg-ink-200";

  return (
    <div className={className}>
      {/* 가격 */}
      <PriceTag
        price={unitPrice}
        compareAt={compareAt}
        vipApplied={product.vipApplied || unitPrice < unitOriginal}
        size="lg"
      />

      {/* 스펙 헤어라인 행 */}
      {specs.length > 0 && (
        <dl className="hairline-t mt-6 divide-y divide-ink-100">
          {specs.map((row) => (
            <div key={row.label} className="flex justify-between gap-6 py-2.5">
              <dt className="shrink-0 text-[13px] text-ink-500">{row.label}</dt>
              <dd className="min-w-0 text-right text-[13px] text-ink-800">
                {/* 원산지처럼 긴 값이 구매 박스를 밀어내지 않게 두 줄만 둔다 */}
                <Expandable lines={2}>{row.value}</Expandable>
              </dd>
            </div>
          ))}
        </dl>
      )}

      {/* 옵션 셀렉트 */}
      {hasOptions && (
        <div className="hairline-t mt-1 pt-5">
          <label className="mb-2 block text-[13px] text-ink-500" htmlFor="purchase-option">
            옵션
          </label>
          <span className="relative block">
            <select
              id="purchase-option"
              value={optionId ?? ""}
              onChange={(e) => setOptionId(e.target.value)}
              className="h-11 w-full cursor-pointer appearance-none border border-ink-200 bg-cream-50 px-3 pr-9 text-sm text-ink-900 outline-none transition-colors focus:border-forest-600"
            >
              {options.map((o) => (
                <option key={o.id} value={o.id} disabled={o.stock <= 0}>
                  {o.name}
                  {o.priceDelta !== 0
                    ? ` (${o.priceDelta > 0 ? "+" : "-"}${krw(Math.abs(o.priceDelta))}원)`
                    : ""}
                  {o.stock <= 0 ? " — 품절" : ""}
                </option>
              ))}
            </select>
            <ChevronDown
              size={16}
              strokeWidth={1.5}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400"
            />
          </span>
        </div>
      )}

      {/* 수량 */}
      <div className={`${hasOptions ? "mt-5" : "hairline-t mt-1 pt-5"} flex items-center justify-between`}>
        <span className="text-[13px] text-ink-500">수량</span>
        <QtyStepper value={qty} onChange={setRawQty} max={maxQty} />
      </div>

      {/* 합계 */}
      <div className="hairline-t mt-6 flex items-baseline justify-between pt-5">
        <span className="text-sm text-ink-600">총 상품 금액</span>
        <span className="krw text-xl font-semibold text-ink-900">
          {krw(unitPrice * qty)}원
          <span className="krw ml-1.5 text-[13px] font-normal text-ink-400">
            ({qty}개)
          </span>
        </span>
      </div>

      {/* 재고 임박 */}
      {!soldOut && stock < LOW_STOCK_THRESHOLD && (
        <p className="mt-3 text-[13px] text-signal-amber">
          지금 남은 수량 {stock}개
        </p>
      )}

      {/* 액션 버튼 */}
      <div className="mt-6 flex gap-2">
        {wishlistSlot}
        <button
          type="button"
          onClick={() => handleAdd(false)}
          disabled={soldOut}
          className={secondaryBtn}
        >
          장바구니 담기
        </button>
        <button
          type="button"
          onClick={() => handleAdd(true)}
          disabled={soldOut}
          className={primaryBtn}
        >
          {soldOut ? "일시 품절" : "바로 구매"}
        </button>
      </div>
      {soldOut && (
        <p className="mt-3 text-[13px] text-ink-400">
          재입고 준비 중입니다. 조금만 기다려 주세요.
        </p>
      )}

      {/* 모바일 하단 고정 CTA */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-cream-50/95 backdrop-blur-md lg:hidden">
        <div className="flex items-center gap-2.5 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="min-w-0 flex-1">
            <p className="label-caps text-[10px] text-ink-400">총 금액</p>
            <p className="krw truncate text-lg font-semibold text-ink-900">
              {krw(unitPrice * qty)}원
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleAdd(false)}
            disabled={soldOut}
            className="h-11 shrink-0 border border-ink-900 px-4 text-[13px] font-medium text-ink-900 transition-colors disabled:cursor-not-allowed disabled:border-ink-200 disabled:text-ink-300"
          >
            담기
          </button>
          <button
            type="button"
            onClick={() => handleAdd(true)}
            disabled={soldOut}
            className="h-11 shrink-0 bg-forest-700 px-5 text-[13px] font-medium text-cream-50 transition-colors hover:bg-forest-800 disabled:cursor-not-allowed disabled:bg-ink-200"
          >
            {soldOut ? "일시 품절" : "바로 구매"}
          </button>
        </div>
      </div>

      {/* 담김 토스트 */}
      {toastMounted && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 lg:bottom-10">
          <div
            role="status"
            className={`pointer-events-auto flex items-center gap-5 bg-ink-900 px-5 py-3.5 text-sm text-cream-50 transition-all duration-500 ease-hall ${
              toastShown ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
            }`}
          >
            <span>장바구니에 담았습니다.</span>
            <Link
              href="/cart"
              className="link-line shrink-0 font-medium text-cream-50"
            >
              장바구니 보기
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
