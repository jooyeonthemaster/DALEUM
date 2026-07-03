import { cache } from "react";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveVipContext, resolvePrices, type VipContext } from "@/lib/pricing";
import { VIP_CODE_COOKIE } from "@/lib/constants";
import type { PricedProduct, ProductWithImages } from "@/lib/types";

/* ============================================================
   카탈로그 서버 전용 헬퍼 — 목록/상세/검색 페이지 공용.
   (server component에서만 import할 것 — cookies() 사용)
   ============================================================ */

/** 상품 카드 표시에 필요한 조인 셀렉트 (COMPONENTS_SHOP.md 권장 형태) */
export const PRODUCT_CARD_SELECT = "*, product_images(*), categories(id, slug, name)";

/** 스토어에 노출되는 상품 상태 */
export const VISIBLE_STATUSES = ["active", "sold_out"] as const;

export interface RequestVipPricing {
  service: SupabaseClient;
  ctx: VipContext;
}

/**
 * 현재 요청의 로그인 유저 + VIP 코드 쿠키로 VIP 가격 컨텍스트를 확보한다.
 * 로그인도 VIP 코드도 없으면 null (VIP 가격 해석 불필요).
 * React cache로 요청당 1회만 해석된다.
 */
export const getRequestVipPricing = cache(async (): Promise<RequestVipPricing | null> => {
  const cookieStore = await cookies();
  const vipCode = cookieStore.get(VIP_CODE_COOKIE)?.value ?? null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !vipCode) return null;

  const service = createServiceClient();
  const ctx = await resolveVipContext(service, { userId: user?.id ?? null, vipCode });
  if (!ctx.userId && !ctx.groupId) return null;

  return { service, ctx };
});

/**
 * 상품 목록에 VIP 가격을 해석해 PricedProduct로 변환한다.
 * VIP 컨텍스트가 없으면 정가 그대로 반환.
 */
export async function toPricedProducts(products: ProductWithImages[]): Promise<PricedProduct[]> {
  if (products.length === 0) return [];

  const vip = await getRequestVipPricing();
  if (!vip) {
    return products.map((p) => ({ ...p, effective_price: p.price, vip_applied: false }));
  }

  const priceMap = await resolvePrices(vip.service, products, vip.ctx);
  return products.map((p) => {
    const resolved = priceMap.get(p.id) ?? { effective: p.price, vipApplied: false };
    return {
      ...p,
      effective_price: Math.min(resolved.effective, p.price),
      vip_applied: resolved.vipApplied && resolved.effective < p.price,
    };
  });
}
