import type { Metadata } from "next";
import { getCachedShippingSettings } from "@/lib/cache";
import CartView from "@/components/checkout/CartView";

export const metadata: Metadata = {
  title: "장바구니",
  robots: { index: false },
};

/**
 * 장바구니 — 배송비 설정만 서버에서 읽어 클라이언트 뷰에 전달.
 * 배송비 설정은 전 방문자 공통이라 캐시 계층에서 받는다(요청마다 DB를 읽지 않는다).
 * 장바구니 담긴 항목 자체는 클라이언트(CartView)가 보관하므로 서버 조회가 없다.
 */
export default async function CartPage() {
  const shipping = await getCachedShippingSettings();

  return <CartView shipping={shipping} />;
}
