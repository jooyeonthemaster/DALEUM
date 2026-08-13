import type { Metadata } from "next";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getShippingSettings } from "@/lib/shipping";
import type { Address } from "@/lib/types";
import CheckoutForm, {
  type CheckoutProfile,
  type CheckoutUser,
} from "@/components/checkout/CheckoutForm";

export const metadata: Metadata = {
  title: "주문 / 결제",
  robots: { index: false },
};

/**
 * 주문/결제 — 로그인 유저면 프로필/배송지를 프리필용으로 조회해 내려준다.
 * 비회원 주문 허용.
 */
export default async function CheckoutPage() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  let user: CheckoutUser | null = null;
  let profile: CheckoutProfile | null = null;
  let addresses: Address[] = [];

  if (authUser) {
    user = { id: authUser.id, email: authUser.email ?? null };
    const [profileResult, addressesResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("name, phone, email")
        .eq("id", authUser.id)
        .maybeSingle(),
      supabase
        .from("addresses")
        .select("*")
        .eq("user_id", authUser.id)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);
    profile = (profileResult.data as CheckoutProfile | null) ?? null;
    addresses = (addressesResult.data ?? []) as Address[];
  }

  const shipping = await getShippingSettings(supabase as unknown as SupabaseClient);

  return (
    <CheckoutForm user={user} profile={profile} addresses={addresses} shipping={shipping} />
  );
}
