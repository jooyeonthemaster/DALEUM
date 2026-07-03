import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getShippingSettings } from "@/lib/shipping";
import CartView from "@/components/checkout/CartView";

export const metadata: Metadata = {
  title: "장바구니",
  robots: { index: false },
};

/** 장바구니 — 배송비 설정만 서버에서 읽어 클라이언트 뷰에 전달 */
export default async function CartPage() {
  const supabase = await createClient();
  const shipping = await getShippingSettings(supabase);

  return <CartView shipping={shipping} />;
}
