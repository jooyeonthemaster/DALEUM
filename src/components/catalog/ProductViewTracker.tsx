"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";

/** 상품 상세 진입 시 product_view 이벤트 + view_count 증가 (렌더 없음) */
export default function ProductViewTracker({ productId }: { productId: string }) {
  useEffect(() => {
    track("product_view", { productId });
    fetch("/api/products/view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId }),
      keepalive: true,
    }).catch(() => {
      // 조회 집계 실패는 조용히 무시
    });
  }, [productId]);

  return null;
}
