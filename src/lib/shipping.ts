import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShippingSettings } from "./types";

export const DEFAULT_SHIPPING: ShippingSettings = {
  base_fee: 3500,
  free_threshold: 40000,
  island_extra: 3000,
};

export async function getShippingSettings(client: SupabaseClient): Promise<ShippingSettings> {
  const { data } = await client.from("settings").select("value").eq("key", "shipping").maybeSingle();
  if (!data?.value) return DEFAULT_SHIPPING;
  return { ...DEFAULT_SHIPPING, ...(data.value as Partial<ShippingSettings>) };
}

/** 배송비 계산 — 할인 반영된 상품 합계 기준 */
export function calcShippingFee(subtotalAfterDiscount: number, settings: ShippingSettings): number {
  if (subtotalAfterDiscount <= 0) return 0;
  return subtotalAfterDiscount >= settings.free_threshold ? 0 : settings.base_fee;
}
