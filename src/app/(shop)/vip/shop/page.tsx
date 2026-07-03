import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveVipContext, resolvePrices } from "@/lib/pricing";
import { VIP_CODE_COOKIE } from "@/lib/constants";
import type { ProductWithImages } from "@/lib/types";
import Reveal from "@/components/shop/Reveal";
import VipProductCard from "@/components/vip/VipProductCard";

export const metadata: Metadata = {
  title: "프라이빗 셀렉션",
  description: "초대받은 분들만을 위한 다름의 프라이빗 셀렉션.",
  robots: { index: false, follow: false },
};

/**
 * /vip/shop — VIP 상품관 (프라이빗 살롱).
 * VIP 컨텍스트(로그인 멤버십 또는 코드 쿠키)가 없으면 /vip 로 돌려보낸다.
 * 전 상품에 resolvePrices 로 우대가를 해석해 표시한다 (결제 시 서버 재계산).
 */
export default async function VipShopPage() {
  const supabase = await createClient();
  const [userResult, cookieStore] = await Promise.all([supabase.auth.getUser(), cookies()]);
  const user = userResult.data.user;
  const vipCode = cookieStore.get(VIP_CODE_COOKIE)?.value ?? null;

  const service = createServiceClient();
  const ctx = await resolveVipContext(service, { userId: user?.id ?? null, vipCode });
  if (!ctx.groupId) redirect("/vip");

  const [groupResult, productsResult] = await Promise.all([
    service
      .from("vip_groups")
      .select("name, discount_rate")
      .eq("id", ctx.groupId)
      .maybeSingle(),
    service
      .from("products")
      .select("*, product_images(*), product_variants(*), categories(id, slug, name)")
      .eq("status", "active")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false }),
  ]);

  const group = groupResult.data as { name: string; discount_rate: number } | null;
  const products = (productsResult.data ?? []) as ProductWithImages[];
  const priceMap = await resolvePrices(service, products, ctx);

  const groupName = group?.name ?? "VIP";
  const discountRate = Number(group?.discount_rate) || 0;

  return (
    <div className="flex-1 bg-forest-950">
      {/* 인사 — 프라이빗 살롱 헤더 */}
      <section className="container-hall pb-12 pt-14 md:pb-16 md:pt-24">
        <Reveal>
          <p className="label-caps text-brass-300">Private Selection</p>
          <h1 className="headline-serif mt-5 max-w-3xl text-3xl leading-tight text-cream-50 md:text-5xl">
            {groupName}을 위한
            <br />
            프라이빗 셀렉션
          </h1>
          <p className="mt-6 max-w-xl text-sm leading-relaxed text-cream-200/55">
            {discountRate > 0
              ? `모든 상품에 기본 ${discountRate}% 멤버 우대가가 적용되어 있습니다. 일부 품목은 더 깊은 우대가로 준비했습니다.`
              : "회원님만을 위한 우대가가 적용되어 있습니다."}{" "}
            표시된 가격은 결제 시 자동으로 반영됩니다.
          </p>
        </Reveal>
      </section>

      {/* 상품 그리드 */}
      <section className="container-hall border-t border-cream-50/10 pb-24 pt-12 md:pb-32 md:pt-16">
        {products.length === 0 ? (
          <div className="py-24 text-center">
            <h2 className="headline-serif text-xl text-cream-50 md:text-2xl">
              셀렉션을 준비하고 있습니다.
            </h2>
            <p className="mt-4 text-sm text-cream-200/55">
              곧 초대받은 분들만을 위한 상품을 선보일 예정입니다.
            </p>
            <Link
              href="/products"
              className="label-caps mt-10 inline-flex h-12 items-center border border-cream-50/25 px-8 text-cream-100 transition-colors duration-500 ease-hall hover:border-brass-300 hover:text-brass-300"
            >
              스토어 둘러보기
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-12 md:grid-cols-3 md:gap-x-4 xl:grid-cols-4">
            {products.map((product, i) => {
              const resolved = priceMap.get(product.id) ?? {
                effective: product.price,
                vipApplied: false,
              };
              return (
                <Reveal key={product.id} delay={(i % 4) * 0.06}>
                  <VipProductCard
                    product={product}
                    price={resolved.effective}
                    vipApplied={resolved.vipApplied}
                    priority={i < 4}
                  />
                </Reveal>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
