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
import RevealText from "@/components/shop/RevealText";
import Parallax from "@/components/shop/Parallax";
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
    <section className="relative flex flex-1 flex-col items-center justify-center bg-forest-950 px-6 py-20 text-center md:py-32">
      <div aria-hidden className="pointer-events-none absolute inset-3 border border-cream-50/10 md:inset-5" />
      <div className="relative w-full max-w-md">
        <Reveal>
          <span aria-hidden className="mx-auto mb-8 block h-10 w-px bg-brass-500/60" />
        </Reveal>
        <Reveal delay={0.12}>
          <p className="label-caps text-brass-300/90">Private Invitation</p>
        </Reveal>
        <RevealText
          as="h1"
          delay={0.28}
          stagger={0.08}
          text={title}
          className="headline-serif mt-5 block text-balance text-2xl leading-snug text-cream-50 md:text-3xl"
        />
        <Reveal variant="blur" delay={0.7}>
          <p className="mt-5 text-sm leading-relaxed text-cream-200/55">{description}</p>
        </Reveal>
        <Reveal delay={0.9}>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {children}
          </div>
        </Reveal>
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

      {/* 히어로 — 풀블리드, 커튼이 걷히고 스크롤에 은은히 흐르는 패럴랙스 */}
      {campaign.hero_image_url && (
        <Reveal variant="clip">
          <div className="relative h-[52vh] min-h-80 w-full overflow-hidden bg-forest-900 md:h-[64vh]">
            <Parallax speed={50} className="absolute inset-0">
              <Image
                src={campaign.hero_image_url}
                alt=""
                fill
                priority
                sizes="100vw"
                className="scale-110 object-cover"
              />
            </Parallax>
            {/* 다크 살롱으로 가라앉는 스크림 */}
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-b from-forest-950/25 via-forest-950/10 to-forest-950"
            />
          </div>
        </Reveal>
      )}

      {/* 초대장 본문 — 봉투가 열리듯: 오너먼트 → 라벨 → 타이틀 어절 → 헤어라인 → 인사말 블러 */}
      <section className="container-hall">
        <div className={`mx-auto max-w-2xl text-center ${campaign.hero_image_url ? "pt-12 md:pt-16" : "pt-16 md:pt-28"} pb-14 md:pb-20`}>
          <Reveal>
            <span aria-hidden className="mx-auto mb-8 block h-10 w-px bg-brass-500/60" />
          </Reveal>
          <Reveal delay={0.12}>
            <p className="label-caps text-brass-300">Private Invitation</p>
          </Reveal>
          <RevealText
            as="h1"
            delay={0.3}
            stagger={0.09}
            text={campaign.title}
            className="headline-serif mt-6 block text-balance text-3xl leading-snug text-cream-50 md:text-[2.75rem]"
          />

          {campaign.message && (
            <div className="mx-auto mt-12 max-w-xl px-2">
              <Reveal variant="rule" delay={0.55} className="h-px w-full bg-cream-50/10" />
              <Reveal variant="blur" delay={0.7}>
                <div className="py-10 md:py-12">
                  {/* 줄 단위로 나눠 각 줄을 text-balance — pre-line 강제 개행이 있으면
                      Chromium이 balance를 포기해 한 단어 고아가 생긴다 */}
                  <p className="font-serif text-[15px] font-normal leading-loose text-cream-100/85 [word-break:keep-all] md:text-base">
                    {campaign.message.split("\n").map((line, i) =>
                      line.trim() ? (
                        <span key={i} className="block text-balance">
                          {line}
                        </span>
                      ) : (
                        <span key={i} aria-hidden className="block h-4" />
                      )
                    )}
                  </p>
                  <p className="label-caps mt-10 text-cream-50/35">Daleum</p>
                </div>
              </Reveal>
              <Reveal variant="rule" delay={0.85} className="h-px w-full bg-cream-50/10" />
            </div>
          )}

          {campaign.expires_at && (
            <Reveal delay={campaign.message ? 1.0 : 0.6}>
              <p className="krw mt-8 text-xs tracking-wide text-cream-50/50">
                {formatDate(campaign.expires_at)}까지 유효한 초대입니다.
              </p>
            </Reveal>
          )}
        </div>
      </section>

      {/* 헤어라인 — 초대장과 셀렉션 사이 */}
      <div className="container-hall">
        <Reveal variant="rule" className="h-px w-full bg-cream-50/10" />
      </div>

      {/* 큐레이션 상품 */}
      <section className="container-hall pb-24 pt-12 md:pb-32 md:pt-16">
        {items.length === 0 ? (
          <Reveal className="py-16 text-center md:py-20">
            <h2 className="headline-serif text-xl text-cream-50 md:text-2xl">
              셀렉션을 준비하고 있습니다.
            </h2>
            <p className="mt-4 text-sm text-cream-200/55">
              잠시 후 다시 열어봐 주세요.
            </p>
          </Reveal>
        ) : (
          <>
            <div className="mb-10 md:mb-14">
              <Reveal>
                <p className="label-caps text-brass-300">Curated For You</p>
              </Reveal>
              <RevealText
                as="h2"
                delay={0.15}
                stagger={0.07}
                text="이번 초대를 위해 준비한 셀렉션"
                className="headline-serif mt-4 block text-balance text-2xl text-cream-50 md:text-3xl"
              />
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-12 md:grid-cols-3 md:gap-x-4">
              {items.map((item, i) => {
                const product = item.products!;
                // 서버 과금 규칙과 동일하게 표시가도 정상가를 넘지 않도록
                const price = Math.min(item.custom_price, product.price);
                const delay = (i % 3) * 0.08;
                return (
                  <Reveal key={item.id} delay={delay}>
                    <VipProductCard
                      product={product}
                      price={price}
                      vipApplied={price < product.price}
                      markLabel="Invitation"
                      campaignId={campaign.id}
                      priority={!campaign.hero_image_url && i < 3}
                      revealImage
                      revealDelay={delay + 0.1}
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
