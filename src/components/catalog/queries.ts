import { cache } from "react";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveVipContext, resolvePrices, type VipContext } from "@/lib/pricing";
import { VIP_CODE_COOKIE } from "@/lib/constants";

/* ============================================================
   카탈로그 서버 전용 헬퍼 — 목록/상세/검색 페이지 공용.
   (server component에서만 import할 것 — cookies() 사용)

   공용(전 방문자 동일) 데이터 조회는 전부 `@/lib/cache` 로 옮겼다.
   이 파일에 남은 것은 **요청마다 새로 풀어야 하는 사용자 종속 로직**뿐이다.
   ============================================================ */

export interface RequestVipPricing {
  service: SupabaseClient;
  ctx: VipContext;
}

/**
 * 현재 요청의 로그인 유저 + VIP 코드 쿠키로 VIP 가격 컨텍스트를 확보한다.
 * 로그인도 VIP 코드도 없으면 null (VIP 가격 해석 불필요).
 * React cache로 요청당 1회만 해석된다.
 *
 * 절대 `unstable_cache` 로 감싸지 말 것 — 결과가 사용자마다 다르므로
 * 전역 공유 캐시에 담기면 다른 사람의 VIP 우대가가 그대로 노출된다.
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
 * 상품 목록에 VIP 가격을 해석해 붙인다.
 * VIP 컨텍스트가 없으면 정가 그대로 반환.
 *
 * 입력 타입을 그대로 보존하는 제네릭이라, 전체 행(ProductWithImages)과
 * 카드용 축약 행(ProductCardRow) 양쪽에 같은 함수를 쓸 수 있다.
 */
export async function toPricedProducts<T extends { id: string; price: number }>(
  products: T[]
): Promise<(T & { effective_price: number; vip_applied: boolean })[]> {
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
