"use client";

import { useEffect, useRef, useState } from "react";
import { useCart } from "@/store/cart";
import { track } from "@/lib/analytics";

export interface VipAddToCartButtonProps {
  productId: string;
  slug: string;
  name: string;
  /** 담을 당시 표시 단가 (VIP/캠페인 반영가 — 결제 시 서버가 재계산) */
  price: number;
  /** 정가 */
  originalPrice: number;
  imageUrl: string | null;
  stock: number;
  /** 시크릿 캠페인 경유 담기면 캠페인 id — 체크아웃까지 라인에 유지된다 */
  campaignId?: string;
  soldOut?: boolean;
  className?: string;
}

/**
 * VIP 다크 화면 전용 "담기" 버튼.
 * 옵션 없는 상품을 기본 구성으로 장바구니에 담는다 (variantId: null).
 * 캠페인 페이지에서는 campaignId를 함께 실어 서버 가격 재계산 근거를 남긴다.
 */
export default function VipAddToCartButton({
  productId,
  slug,
  name,
  price,
  originalPrice,
  imageUrl,
  stock,
  campaignId,
  soldOut = false,
  className = "",
}: VipAddToCartButtonProps) {
  const add = useCart((s) => s.add);
  const [added, setAdded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const disabled = soldOut || stock <= 0;

  const handleAdd = () => {
    if (disabled) return;
    add({
      productId,
      variantId: null,
      slug,
      name,
      optionName: null,
      price,
      originalPrice,
      imageUrl,
      stock,
      qty: 1,
      ...(campaignId ? { campaignId } : {}),
    });
    track("add_to_cart", {
      productId,
      meta: campaignId ? { campaignId, from: "vip" } : { from: "vip" },
    });
    setAdded(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setAdded(false), 1800);
  };

  return (
    <button
      type="button"
      onClick={handleAdd}
      disabled={disabled}
      className={`flex h-10 w-full items-center justify-center border text-[13px] transition-colors duration-300 ease-hall ${
        disabled
          ? "cursor-not-allowed border-cream-50/10 text-cream-50/30"
          : added
            ? "border-brass-500/60 text-brass-300"
            : "border-cream-50/20 text-cream-100 hover:border-brass-300 hover:text-brass-300"
      } ${className}`}
    >
      {disabled ? "일시품절" : added ? "장바구니에 담았습니다" : "담기"}
    </button>
  );
}
