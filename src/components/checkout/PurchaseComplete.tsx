"use client";

import { useEffect, useRef } from "react";
import { useCart } from "@/store/cart";
import { track } from "@/lib/analytics";

export interface PurchaseCompleteProps {
  orderId: string;
  orderNo: string;
  amount: number;
}

/**
 * 결제 완료 부수효과 — 장바구니 클리어 + purchase 이벤트 1회 전송.
 * 새로고침으로 confirm이 재호출(멱등)되어도 sessionStorage 가드로 이벤트는 한 번만 남긴다.
 */
export default function PurchaseComplete({ orderId, orderNo, amount }: PurchaseCompleteProps) {
  const clear = useCart((s) => s.clear);
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    clear();

    const guardKey = `daleum_purchased_${orderId}`;
    try {
      if (sessionStorage.getItem(guardKey)) return;
      sessionStorage.setItem(guardKey, "1");
    } catch {
      // sessionStorage 불가 환경이면 그냥 1회 전송
    }
    track("purchase", { orderId, meta: { order_no: orderNo, amount } });
  }, [clear, orderId, orderNo, amount]);

  return null;
}
