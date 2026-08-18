import type { Metadata } from "next";
import {
  getCachedCategories,
  getCachedFeaturedProducts,
  getCachedHeroBanners,
  getCachedHomeReviews,
  getCachedLatestProducts,
  getCachedPopups,
} from "@/lib/cache";
import ProductCard from "@/components/shop/ProductCard";
import Reveal from "@/components/shop/Reveal";
import SectionTitle from "@/components/shop/SectionTitle";
import HomeHero, { type HeroBanner } from "@/components/home/HomeHero";
import CertMarquee from "@/components/home/CertMarquee";
import CategoryShowcase from "@/components/home/CategoryShowcase";
import FermentStory from "@/components/home/FermentStory";
import NewArrivalsStrip from "@/components/home/NewArrivalsStrip";
import ReviewsSection from "@/components/home/ReviewsSection";
import BrandClosing from "@/components/home/BrandClosing";
import PopupDisplay from "@/components/home/PopupDisplay";

export const metadata: Metadata = {
  title: "다름 DALEUM — 곤약 그 이상의 한계를, 발효로 완성하다",
  description:
    "국내 최초 효모·유산균 발효곤약. 냄새는 덜고 식감은 살린 다름의 발효곤약 식탁을 만나보세요.",
};

/** 쇼케이스가 실제로 배치할 수 있는 카테고리 수 — CategoryShowcase의 MAX_TILES와 한 쌍이다 */
const SHOWCASE_LIMIT = 8;

/**
 * starts_at/ends_at 기간 유효성.
 *
 * 이 판정은 "지금"에 달렸으므로 반드시 캐시 밖(호출부)에 남는다.
 * 캐시 함수 안으로 옮기면 revalidate 주기 동안 판정이 그 시각으로 굳어,
 * 기간이 끝난 배너/팝업이 계속 노출되거나 시작된 배너가 안 뜬다.
 */
function isWithinPeriod(
  startsAt: string | null,
  endsAt: string | null,
  now: Date
): boolean {
  if (startsAt && new Date(startsAt) > now) return false;
  if (endsAt && new Date(endsAt) < now) return false;
  return true;
}

export default async function HomePage() {
  const now = new Date();

  // 홈은 전부 "누가 보든 같은" 공용 데이터라 전량 캐시 계층을 거친다.
  // (조인 정규화·필드 선별은 캐시 함수 안에서 이미 끝난 상태로 돌아온다.)
  const [banners, categories, featuredRows, latest, reviews, popups] =
    await Promise.all([
      getCachedHeroBanners(),
      getCachedCategories(),
      getCachedFeaturedProducts(4),
      getCachedLatestProducts(8),
      getCachedHomeReviews(3),
      getCachedPopups(),
    ]);

  // 히어로 배너 — 이미지가 있고 기간이 유효한 첫 배너만 사용
  const bannerRow =
    banners.find(
      (b) => b.image_url && isWithinPeriod(b.starts_at, b.ends_at, now)
    ) ?? null;
  const heroBanner: HeroBanner | null = bannerRow
    ? {
        title: bannerRow.title,
        subtitle: bannerRow.subtitle,
        imageUrl: bannerRow.image_url as string,
        linkUrl: bannerRow.link_url,
      }
    : null;

  // 상한은 쇼케이스가 실제로 배치할 수 있는 수(8)에 맞춘다. 여기와
  // CategoryShowcase의 slice는 반드시 같이 움직여야 한다 — 한쪽만 올리면
  // 다른 쪽이 그대로 잘라서 카테고리가 소리 없이 사라진다.
  const showcaseCategories = categories.slice(0, SHOWCASE_LIMIT);

  // 베스트 셀렉션 — is_featured 없으면 최신 4개로 대체해 빈 화면을 막는다
  const featured = featuredRows.length > 0 ? featuredRows : latest.slice(0, 4);

  // 팝업 — 활성 + 기간 유효한 첫 팝업만
  const popup =
    popups.find((p) => isWithinPeriod(p.starts_at, p.ends_at, now)) ?? null;

  return (
    <>
      {/* 1. 히어로 — 풀블리드 + 패럴랙스 */}
      <HomeHero banner={heroBanner} />

      {/* 2. 인증 마퀴 스트립 */}
      <CertMarquee />

      {/* 3. 카테고리 쇼케이스 — 비대칭 그리드 */}
      <CategoryShowcase categories={showcaseCategories} />

      {/* 4. 베스트 셀렉션 */}
      {featured.length > 0 && (
        <section className="hairline-t">
          <div className="container-hall py-16 md:py-28">
            <Reveal>
              <SectionTitle
                overline="Seasonal Selection"
                title="이 계절의 식탁"
                action={{ href: "/products", label: "전체 보기" }}
                className="mb-8 md:mb-12"
              />
            </Reveal>
            <div className="grid grid-cols-2 gap-x-3 gap-y-10 md:grid-cols-4 md:gap-x-4">
              {featured.map((product, i) => (
                <Reveal key={product.id} delay={i * 0.08}>
                  <ProductCard product={product} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 5. 발효 이야기 — 다크 풀블리드 */}
      <FermentStory />

      {/* 6. 신상품 가로 스크롤 스트립 */}
      <NewArrivalsStrip products={latest} />

      {/* 7. 리뷰/신뢰 — 이름은 캐시 계층이 적재 전에 홈 규칙(김지현 → 김*현)으로 마스킹해 둔다 */}
      <ReviewsSection reviews={reviews} />

      {/* 8. 브랜드 클로징 */}
      <BrandClosing />

      {/* 9. 팝업 */}
      <PopupDisplay popup={popup} />
    </>
  );
}
