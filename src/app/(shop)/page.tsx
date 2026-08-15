import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { Banner, Category, Popup, ProductWithImages } from "@/lib/types";
import ProductCard from "@/components/shop/ProductCard";
import Reveal from "@/components/shop/Reveal";
import SectionTitle from "@/components/shop/SectionTitle";
import HomeHero, { type HeroBanner } from "@/components/home/HomeHero";
import CertMarquee from "@/components/home/CertMarquee";
import CategoryShowcase from "@/components/home/CategoryShowcase";
import FermentStory from "@/components/home/FermentStory";
import NewArrivalsStrip from "@/components/home/NewArrivalsStrip";
import ReviewsSection, { type HomeReview } from "@/components/home/ReviewsSection";
import BrandClosing from "@/components/home/BrandClosing";
import PopupDisplay from "@/components/home/PopupDisplay";

export const metadata: Metadata = {
  title: "다름 DALEUM — 곤약 그 이상의 한계를, 발효로 완성하다",
  description:
    "국내 최초 효모·유산균 발효곤약. 냄새는 덜고 식감은 살린 다름의 발효곤약 식탁을 만나보세요.",
};

const PRODUCT_SELECT = "*, product_images(*), categories(id, slug, name)";

/** starts_at/ends_at 기간 유효성 */
function isWithinPeriod(
  startsAt: string | null,
  endsAt: string | null,
  now: Date
): boolean {
  if (startsAt && new Date(startsAt) > now) return false;
  if (endsAt && new Date(endsAt) < now) return false;
  return true;
}

/** 조인 결과가 배열/단일 어느 쪽으로 와도 첫 항목을 취한다 */
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

interface ReviewRow {
  id: string;
  rating: number;
  content: string;
  profiles: { name: string | null } | { name: string | null }[] | null;
  products: { name: string } | { name: string }[] | null;
}

export default async function HomePage() {
  const supabase = await createClient();
  const now = new Date();

  const [bannersRes, categoriesRes, featuredRes, latestRes, reviewsRes, popupsRes] =
    await Promise.all([
      supabase
        .from("banners")
        .select("*")
        .eq("placement", "hero")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      // 상한은 쇼케이스가 실제로 배치할 수 있는 수(8)에 맞춘다. 여기와
      // CategoryShowcase의 slice는 반드시 같이 움직여야 한다 — 한쪽만 올리면
      // 다른 쪽이 그대로 잘라서 카테고리가 소리 없이 사라진다.
      supabase
        .from("categories")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("slug", { ascending: true })
        .limit(8),
      supabase
        .from("products")
        .select(PRODUCT_SELECT)
        .eq("is_featured", true)
        .order("sort_order", { ascending: true })
        .limit(4),
      supabase
        .from("products")
        .select(PRODUCT_SELECT)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("reviews")
        .select("id, rating, content, profiles(name), products(name)")
        .eq("is_hidden", false)
        .gte("rating", 4)
        .order("created_at", { ascending: false })
        .limit(3),
      supabase
        .from("popups")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
    ]);

  // 히어로 배너 — 이미지가 있고 기간이 유효한 첫 배너만 사용
  const bannerRow =
    ((bannersRes.data ?? []) as Banner[]).find(
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

  const categories = (categoriesRes.data ?? []) as Category[];
  const latest = (latestRes.data ?? []) as unknown as ProductWithImages[];

  // 베스트 셀렉션 — is_featured 없으면 최신 4개로 대체해 빈 화면을 막는다
  let featured = (featuredRes.data ?? []) as unknown as ProductWithImages[];
  if (featured.length === 0) featured = latest.slice(0, 4);

  const reviews: HomeReview[] = (
    (reviewsRes.data ?? []) as unknown as ReviewRow[]
  ).map((row) => ({
    id: row.id,
    rating: row.rating,
    content: row.content,
    name: one(row.profiles)?.name ?? null,
    productName: one(row.products)?.name ?? null,
  }));

  // 팝업 — 활성 + 기간 유효한 첫 팝업만
  const popup =
    ((popupsRes.data ?? []) as Popup[]).find((p) =>
      isWithinPeriod(p.starts_at, p.ends_at, now)
    ) ?? null;

  return (
    <>
      {/* 1. 히어로 — 풀블리드 + 패럴랙스 */}
      <HomeHero banner={heroBanner} />

      {/* 2. 인증 마퀴 스트립 */}
      <CertMarquee />

      {/* 3. 카테고리 쇼케이스 — 비대칭 그리드 */}
      <CategoryShowcase categories={categories} />

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

      {/* 7. 리뷰/신뢰 */}
      <ReviewsSection reviews={reviews} />

      {/* 8. 브랜드 클로징 */}
      <BrandClosing />

      {/* 9. 팝업 */}
      <PopupDisplay popup={popup} />
    </>
  );
}
