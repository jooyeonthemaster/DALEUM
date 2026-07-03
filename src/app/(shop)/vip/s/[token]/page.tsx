import { createHash } from "node:crypto";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { formatDate } from "@/lib/format";
import type { VipCampaign, VipCampaignItem } from "@/lib/types";
import Reveal from "@/components/shop/Reveal";
import VipProductCard from "@/components/vip/VipProductCard";
import CampaignGate from "@/components/vip/CampaignGate";
import CampaignViewTracker from "@/components/vip/CampaignViewTracker";

export const metadata: Metadata = {
  title: "프라이빗 초대장",
  description: "다름이 보내드린 프라이빗 초대장.",
  robots: { index: false, follow: false },
};

/* ---------- 상태 안내 화면 (마감/로그인/대상 불일치) ---------- */

function StatusScreen({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <section className="relative flex flex-1 flex-col items-center justify-center bg-forest-950 px-6 py-32 text-center">
      <div aria-hidden className="pointer-events-none absolute inset-3 border border-cream-50/10 md:inset-5" />
      <div className="relative w-full max-w-md">
        <span aria-hidden className="mx-auto mb-8 block h-10 w-px bg-brass-500/60" />
        <p className="label-caps text-brass-300/90">Private Invitation</p>
        <h1 className="headline-serif mt-5 text-2xl leading-snug text-cream-50 md:text-3xl">
          {title}
        </h1>
        <p className="mt-5 text-sm leading-relaxed text-cream-200/55">{description}</p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {children}
        </div>
      </div>
    </section>
  );
}

function StatusLink({
  href,
  label,
  accent = false,
}: {
  href: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`label-caps inline-flex h-12 min-w-44 items-center justify-center border px-8 transition-colors duration-500 ease-hall ${
        accent
          ? "border-brass-500/60 text-brass-300 hover:bg-brass-500/10"
          : "border-cream-50/25 text-cream-100 hover:border-brass-300 hover:text-brass-300"
      }`}
    >
      {label}
    </Link>
  );
}

/* ---------- 페이지 ---------- */

/**
 * /vip/s/[token] — 시크릿 캠페인 초대장.
 * 없음/비활성/만료 → 마감 안내, target_user_id 불일치 → 로그인/접근 안내,
 * require_code → 코드 게이트(해시 비교, 세션 스토리지 기억).
 * 유효 열람 시 view_count 증가 + vip_campaign_view 트래킹.
 */
export default async function CampaignPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const closed = (
    <StatusScreen
      title="이 초대장은 마감되었습니다."
      description="유효 기간이 지났거나 이미 종료된 초대입니다. 다름의 스토어에서 다른 상품들을 만나보세요."
    >
      <StatusLink href="/products" label="스토어 둘러보기" accent />
      <StatusLink href="/vip" label="프라이빗 라운지" />
    </StatusScreen>
  );

  if (!token || token.length > 120) return closed;

  const service = createServiceClient();
  const { data: campaignRow } = await service
    .from("vip_campaigns")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  const campaign = campaignRow as VipCampaign | null;

  const expired = Boolean(campaign?.expires_at && new Date(campaign.expires_at) < new Date());
  if (!campaign || !campaign.is_active || expired) return closed;

  // 지정 고객 전용 캠페인 — 본인 확인
  if (campaign.target_user_id) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return (
        <StatusScreen
          title="본인 확인이 필요한 초대장입니다."
          description="이 초대장은 지정된 고객님께만 열립니다. 로그인 후 다시 열어봐 주세요."
        >
          <StatusLink
            href={`/login?next=${encodeURIComponent(`/vip/s/${token}`)}`}
            label="로그인하고 열기"
            accent
          />
          <StatusLink href="/products" label="스토어 둘러보기" />
        </StatusScreen>
      );
    }
    if (user.id !== campaign.target_user_id) {
      return (
        <StatusScreen
          title="다른 고객님을 위한 초대장입니다."
          description="지금 로그인된 계정으로는 열 수 없는 초대장입니다. 초대받으신 계정으로 다시 로그인해 주세요."
        >
          <StatusLink href="/products" label="스토어 둘러보기" accent />
        </StatusScreen>
      );
    }
  }

  // 열람 수 증가 (경합은 허용 — 통계 목적)
  await service
    .from("vip_campaigns")
    .update({ view_count: campaign.view_count + 1 })
    .eq("id", campaign.id);

  // 큐레이션 상품
  const { data: itemRows } = await service
    .from("vip_campaign_items")
    .select("*, products(*, product_images(*), product_variants(*), categories(id, slug, name))")
    .eq("campaign_id", campaign.id)
    .order("sort_order", { ascending: true });

  const items = ((itemRows ?? []) as VipCampaignItem[]).filter(
    (it) =>
      it.products && (it.products.status === "active" || it.products.status === "sold_out")
  );

  const content = (
    <>
      <CampaignViewTracker campaignId={campaign.id} token={token} />

      {/* 히어로 — 풀블리드 */}
      {campaign.hero_image_url && (
        <div className="relative h-[52vh] min-h-80 w-full md:h-[64vh]">
          <Image
            src={campaign.hero_image_url}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          {/* 다크 살롱으로 가라앉는 스크림 */}
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-b from-forest-950/25 via-forest-950/10 to-forest-950"
          />
        </div>
      )}

      {/* 초대장 본문 — 손편지 레이아웃 */}
      <section className="container-hall">
        <Reveal className={`mx-auto max-w-2xl text-center ${campaign.hero_image_url ? "pt-12 md:pt-16" : "pt-20 md:pt-28"} pb-14 md:pb-20`}>
          <span aria-hidden className="mx-auto mb-8 block h-10 w-px bg-brass-500/60" />
          <p className="label-caps text-brass-300">Private Invitation</p>
          <h1 className="headline-serif mt-6 text-3xl leading-snug text-cream-50 md:text-[2.75rem]">
            {campaign.title}
          </h1>

          {campaign.message && (
            <div className="mx-auto mt-12 max-w-xl border-y border-cream-50/10 px-2 py-10 md:py-12">
              <p className="whitespace-pre-line font-serif text-[15px] font-normal leading-loose text-cream-100/85 [word-break:keep-all] md:text-base">
                {campaign.message}
              </p>
              <p className="label-caps mt-10 text-cream-50/35">Daleum</p>
            </div>
          )}

          {campaign.expires_at && (
            <p className="krw mt-8 text-xs tracking-wide text-cream-50/40">
              {formatDate(campaign.expires_at)}까지 유효한 초대입니다.
            </p>
          )}
        </Reveal>
      </section>

      {/* 큐레이션 상품 */}
      <section className="container-hall border-t border-cream-50/10 pb-24 pt-12 md:pb-32 md:pt-16">
        {items.length === 0 ? (
          <div className="py-20 text-center">
            <h2 className="headline-serif text-xl text-cream-50 md:text-2xl">
              셀렉션을 준비하고 있습니다.
            </h2>
            <p className="mt-4 text-sm text-cream-200/55">
              잠시 후 다시 열어봐 주세요.
            </p>
          </div>
        ) : (
          <>
            <Reveal className="mb-10 md:mb-14">
              <p className="label-caps text-brass-300">Curated For You</p>
              <h2 className="headline-serif mt-4 text-2xl text-cream-50 md:text-3xl">
                이번 초대를 위해 준비한 셀렉션
              </h2>
            </Reveal>
            <div className="grid grid-cols-2 gap-x-3 gap-y-12 md:grid-cols-3 md:gap-x-4">
              {items.map((item, i) => {
                const product = item.products!;
                // 서버 과금 규칙과 동일하게 표시가도 정상가를 넘지 않도록
                const price = Math.min(item.custom_price, product.price);
                return (
                  <Reveal key={item.id} delay={(i % 3) * 0.06}>
                    <VipProductCard
                      product={product}
                      price={price}
                      vipApplied={price < product.price}
                      markLabel="Invitation"
                      campaignId={campaign.id}
                      priority={!campaign.hero_image_url && i < 3}
                    />
                  </Reveal>
                );
              })}
            </div>
          </>
        )}
      </section>
    </>
  );

  // 코드 게이트 — 평문 대신 해시만 클라이언트로 내린다
  if (campaign.require_code) {
    const codeHash = createHash("sha256")
      .update(campaign.require_code.trim().toUpperCase())
      .digest("hex");
    return (
      <div className="flex flex-1 flex-col bg-forest-950">
        <CampaignGate token={token} codeHash={codeHash}>
          {content}
        </CampaignGate>
      </div>
    );
  }

  return <div className="flex flex-1 flex-col bg-forest-950">{content}</div>;
}
