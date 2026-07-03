"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CartLine {
  productId: string;
  variantId: string | null;
  slug: string;
  name: string;
  optionName: string | null;
  /** 담을 당시 단가 (표시용 — 결제 시 서버가 재검증) */
  price: number;
  originalPrice: number;
  imageUrl: string | null;
  qty: number;
  stock: number;
  /**
   * VIP 시크릿 캠페인(/vip/s/[token]) 경유로 담긴 라인이면 캠페인 id.
   * 체크아웃에서 POST /api/orders items[].campaignId 로 그대로 전달해야
   * 서버가 캠페인 지정가를 적용한다. (옵셔널 — 기존 저장분과 하위호환)
   */
  campaignId?: string | null;
}

interface CartState {
  lines: CartLine[];
  add: (line: Omit<CartLine, "qty"> & { qty?: number }) => void;
  remove: (productId: string, variantId: string | null) => void;
  setQty: (productId: string, variantId: string | null, qty: number) => void;
  clear: () => void;
  count: () => number;
  subtotal: () => number;
}

const keyOf = (productId: string, variantId: string | null) => `${productId}::${variantId ?? ""}`;

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],
      add: (line) =>
        set((s) => {
          const k = keyOf(line.productId, line.variantId);
          const existing = s.lines.find((l) => keyOf(l.productId, l.variantId) === k);
          if (existing) {
            return {
              lines: s.lines.map((l) =>
                keyOf(l.productId, l.variantId) === k
                  ? { ...l, qty: Math.min(l.qty + (line.qty ?? 1), Math.max(l.stock, 1)) }
                  : l
              ),
            };
          }
          return { lines: [...s.lines, { ...line, qty: line.qty ?? 1 }] };
        }),
      remove: (productId, variantId) =>
        set((s) => ({
          lines: s.lines.filter((l) => keyOf(l.productId, l.variantId) !== keyOf(productId, variantId)),
        })),
      setQty: (productId, variantId, qty) =>
        set((s) => ({
          lines: s.lines.map((l) =>
            keyOf(l.productId, l.variantId) === keyOf(productId, variantId)
              ? { ...l, qty: Math.max(1, Math.min(qty, Math.max(l.stock, 1))) }
              : l
          ),
        })),
      clear: () => set({ lines: [] }),
      count: () => get().lines.reduce((n, l) => n + l.qty, 0),
      subtotal: () => get().lines.reduce((n, l) => n + l.price * l.qty, 0),
    }),
    { name: "daleum-cart" }
  )
);
