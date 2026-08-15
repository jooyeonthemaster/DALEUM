import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolvePrice } from "@/lib/pricing";
import { getShippingSettings } from "@/lib/shipping";
import { COMPANY, STORAGE_TYPE_LABELS } from "@/lib/constants";
import { krw } from "@/lib/format";
import type {
  ProductVariant,
  ProductWithImages,
  StorageType,
} from "@/lib/types";
import ProductCard from "@/components/shop/ProductCard";
import SectionTitle from "@/components/shop/SectionTitle";
import Reveal from "@/components/shop/Reveal";
import RevealText from "@/components/shop/RevealText";
import Gallery from "@/components/catalog/Gallery";
import DescriptionBlock, {
  hasDescriptionImages,
} from "@/components/catalog/DescriptionBlock";
import Expandable from "@/components/catalog/Expandable";
import AddToCart, {
  type PurchaseOption,
  type SpecRow,
} from "@/components/catalog/AddToCart";
import WishlistButton from "@/components/catalog/WishlistButton";
import StoryBlock from "@/components/catalog/StoryBlock";
import SpecTable from "@/components/catalog/SpecTable";
import ReviewsSection, {
  type ReviewItem,
} from "@/components/catalog/ReviewsSection";
import InquiriesSection, {
  type InquiryItem,
} from "@/components/catalog/InquiriesSection";
import ProductViewTracker from "@/components/catalog/ProductViewTracker";
import {
  PRODUCT_CARD_SELECT,
  VISIBLE_STATUSES,
  getRequestVipPricing,
  toPricedProducts,
} from "@/components/catalog/queries";

type Params = Promise<{ slug: string }>;

const PAID_STATUSES = ["paid", "preparing", "shipped", "delivered", "confirmed"];

/**
 * 라우트 params.slug 를 DB에 저장된 형태로 정규화한다.
 * 같은 요청 안에서도 generateMetadata 는 디코딩된 값("맛있는여주발효곤약밥")을,
 * 페이지 컴포넌트는 퍼센트 인코딩된 원문("%EB%A7%9B…")을 받기 때문에
 * 인코딩 원문을 그대로 조회하면 non-ASCII slug 상품이 404가 된다.
 * ASCII slug 에는 '%' 가 없으므로 그대로 통과하며 동작이 달라지지 않는다.
 */
function normalizeSlug(slug: string): string {
  if (!slug.includes("%")) return slug;
  try {
    return decodeURIComponent(slug);
  } catch {
    // 잘못된 퍼센트 시퀀스는 URIError 를 던진다 — 원문 그대로 조회해 404로 흘려보낸다.
    return slug;
  }
}

const fetchProductBySlug = cache(async (slug: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("*, product_images(*), product_variants(*), categories(id, slug, name)")
    .eq("slug", slug)
    .in("status", [...VISIBLE_STATUSES])
    .maybeSingle();
  return data as unknown as ProductWithImages | null;
});

/**
 * 정규화된 slug 로만 cache() 키가 잡히므로 generateMetadata 와 페이지 컴포넌트가
 * 서로 다른 형태(디코딩/인코딩)를 받아도 같은 상품을 얻고, 요청당 조회는 1회로 유지된다.
 */
function getProduct(slug: string) {
  return fetchProductBySlug(normalizeSlug(slug));
}

function maskName(name: string | null | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) return "익명";
  return `${trimmed[0]}**`;
}

const STORAGE_SHIPPING_NOTES: Record<StorageType, string> = {
  room: "일반 택배로 안전하게 포장해 보내드립니다.",
  chilled: "신선함을 지키는 냉장 전용 택배로 보내드립니다.",
  frozen: "드라이아이스와 함께 냉동 전용 택배로 보내드립니다.",
};

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return { title: "상품을 찾을 수 없습니다" };

  const images = [...(product.product_images ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order
  );
  const primary = images.find((img) => img.is_primary) ?? images[0];
  const description =
    product.subtitle ??
    product.description?.slice(0, 160) ??
    "발효로 완성한 다름의 곤약 식탁.";

  return {
    title: product.name,
    description,
    openGraph: {
      title: product.name,
      description,
      type: "website",
      ...(primary ? { images: [{ url: primary.url, alt: product.name }] } : {}),
    },
  };
}

export default async function ProductDetailPage({ params }: { params: Params }) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const images = [...(product.product_images ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
  const primaryImageUrl = images[0]?.url ?? null;

  const variants: ProductVariant[] = [...(product.product_variants ?? [])]
    .filter((v) => v.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);

  // ---------- VIP 가격 해석 (상품 + 옵션별) ----------
  const vip = await getRequestVipPricing();
  let effectivePrice = product.price;
  let vipApplied = false;
  const options: PurchaseOption[] = [];

  if (vip) {
    const base = await resolvePrice(
      vip.service,
      { id: product.id, price: product.price },
      vip.ctx
    );
    effectivePrice = Math.min(base.effective, product.price);
    vipApplied = base.vipApplied && effectivePrice < product.price;
  }
  for (const v of variants) {
    const original = product.price + v.price_delta;
    let effective = original;
    if (vip) {
      const resolved = await resolvePrice(
        vip.service,
        { id: product.id, price: original },
        vip.ctx
      );
      effective = Math.min(resolved.effective, original);
    }
    options.push({
      id: v.id,
      name: v.name,
      priceDelta: v.price_delta,
      stock: v.stock,
      effectivePrice: effective,
      originalPrice: original,
    });
  }

  // ---------- 위시리스트 / 리뷰 작성 가능 여부 (로그인 시) ----------
  let wished = false;
  let orderItemId: string | null = null;
  let alreadyReviewed = false;
  if (user) {
    const [wishResult, orderItemResult, myReviewResult] = await Promise.all([
      supabase
        .from("wishlists")
        .select("id")
        .eq("user_id", user.id)
        .eq("product_id", product.id)
        .maybeSingle(),
      supabase
        .from("order_items")
        .select("id, orders!inner(user_id, status)")
        .eq("product_id", product.id)
        .eq("orders.user_id", user.id)
        .in("orders.status", PAID_STATUSES)
        .limit(1),
      supabase
        .from("reviews")
        .select("id")
        .eq("product_id", product.id)
        .eq("user_id", user.id)
        .limit(1),
    ]);
    wished = wishResult.data != null;
    orderItemId = orderItemResult.data?.[0]?.id ?? null;
    alreadyReviewed = (myReviewResult.data?.length ?? 0) > 0;
  }

  // ---------- 리뷰/문의 (작성자 이름 마스킹을 위해 service client) ----------
  const service = createServiceClient();
  const [reviewsResult, inquiriesResult, shippingSettings] = await Promise.all([
    service
      .from("reviews")
      .select("id, user_id, order_item_id, rating, content, image_urls, admin_reply, created_at, profiles(name)")
      .eq("product_id", product.id)
      .eq("is_hidden", false)
      .order("created_at", { ascending: false })
      .limit(200),
    service
      .from("product_inquiries")
      .select("id, user_id, question, answer, is_private, answered_at, created_at, profiles(name)")
      .eq("product_id", product.id)
      .order("created_at", { ascending: false })
      .limit(100),
    getShippingSettings(supabase as unknown as SupabaseClient),
  ]);

  const reviews: ReviewItem[] = (
    (reviewsResult.data ?? []) as unknown as {
      id: string;
      user_id: string;
      order_item_id: string | null;
      rating: number;
      content: string;
      image_urls: string[];
      admin_reply: string | null;
      created_at: string;
      profiles: { name: string | null } | null;
    }[]
  ).map((r) => ({
    id: r.id,
    maskedName: maskName(r.profiles?.name),
    rating: r.rating,
    content: r.content,
    imageUrls: r.image_urls ?? [],
    isBuyer: r.order_item_id != null,
    adminReply: r.admin_reply,
    createdAt: r.created_at,
  }));

  const inquiries: InquiryItem[] = (
    (inquiriesResult.data ?? []) as unknown as {
      id: string;
      user_id: string;
      question: string;
      answer: string | null;
      is_private: boolean;
      answered_at: string | null;
      created_at: string;
      profiles: { name: string | null } | null;
    }[]
  ).map((q) => {
    const isMine = user != null && q.user_id === user.id;
    const locked = q.is_private && !isMine;
    return {
      id: q.id,
      maskedName: maskName(q.profiles?.name),
      question: locked ? null : q.question,
      answer: locked ? null : q.answer,
      isPrivate: q.is_private,
      isMine,
      answered: q.answer != null,
      createdAt: q.created_at,
    };
  });

  // ---------- 관련 상품 (같은 카테고리 4개) ----------
  let relatedRows: ProductWithImages[] = [];
  if (product.category_id) {
    const { data } = await supabase
      .from("products")
      .select(PRODUCT_CARD_SELECT)
      .in("status", [...VISIBLE_STATUSES])
      .eq("category_id", product.category_id)
      .neq("id", product.id)
      .order("view_count", { ascending: false })
      .limit(4);
    relatedRows = (data ?? []) as unknown as ProductWithImages[];
  }
  if (relatedRows.length < 4) {
    const excludeIds = [product.id, ...relatedRows.map((p) => p.id)];
    const { data } = await supabase
      .from("products")
      .select(PRODUCT_CARD_SELECT)
      .in("status", [...VISIBLE_STATUSES])
      .not("id", "in", `(${excludeIds.join(",")})`)
      .order("created_at", { ascending: false })
      .limit(4 - relatedRows.length);
    relatedRows = [
      ...relatedRows,
      ...((data ?? []) as unknown as ProductWithImages[]),
    ];
  }
  const related = await toPricedProducts(relatedRows);

  // ---------- 구매 박스 스펙 행 ----------
  const specRows: SpecRow[] = [
    { label: "보관 방법", value: STORAGE_TYPE_LABELS[product.storage_type] },
    ...(product.origin ? [{ label: "원산지", value: product.origin }] : []),
    ...(product.weight ? [{ label: "중량", value: product.weight }] : []),
    ...(product.units_per_pack > 1
      ? [{ label: "구성", value: `${product.units_per_pack}개입` }]
      : []),
  ];

  const detailSpecs: Record<string, string | number> = {
    ...(product.brand ? { 브랜드: product.brand } : {}),
    "보관 방법": STORAGE_TYPE_LABELS[product.storage_type],
    ...(product.origin ? { 원산지: product.origin } : {}),
    ...(product.weight ? { 중량: product.weight } : {}),
    ...(product.units_per_pack > 1
      ? { 구성: `${product.units_per_pack}개입` }
      : {}),
    ...product.specs,
  };

  const hasNutrition = Object.keys(product.nutrition ?? {}).length > 0;
  const loginNext = `/products/${product.slug}`;
  const soldOut = product.status === "sold_out" || product.stock <= 0;

  return (
    <div className="pb-24 lg:pb-0">
      <ProductViewTracker productId={product.id} />

      <div className="container-hall pt-8 md:pt-12">
        {/* ---------- 갤러리 + 구매 박스 ---------- */}
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16 xl:gap-24">
          <Gallery
            images={images.map((img) => ({ url: img.url, alt: img.alt }))}
            name={product.name}
          />

          <div className="lg:sticky lg:top-28 lg:self-start">
            {(product.brand || product.categories) && (
              <Reveal variant="fade">
                <p className="label-caps flex flex-wrap items-center gap-x-2 gap-y-1 text-forest-600">
                  {/* 다름은 자체 상품과 납품처 상품(수다락·곤약닷컴)을 함께 판다.
                      패키지 브랜드가 상품명과 다를 수 있어 카테고리 앞에 브랜드를 밝힌다. */}
                  {product.brand && <span className="text-ink-500">{product.brand}</span>}
                  {product.brand && product.categories && (
                    <span aria-hidden className="text-ink-300">
                      ·
                    </span>
                  )}
                  {product.categories && (
                    <Link
                      href={`/products?category=${product.categories.slug}`}
                      className="transition-colors hover:text-forest-800"
                    >
                      {product.categories.name}
                    </Link>
                  )}
                </p>
              </Reveal>
            )}
            <RevealText
              as="h1"
              delay={0.06}
              className="headline-serif mt-3 block text-[1.7rem] text-ink-900 md:text-3xl"
              text={product.name}
            />
            <Reveal variant="fade" delay={0.16}>
              {product.subtitle && (
                <p className="mt-2.5 text-[15px] text-ink-500">{product.subtitle}</p>
              )}
              {product.badges.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {product.badges.map((badge) => (
                    <span
                      key={badge}
                      className="label-caps rounded-full border border-ink-200 px-2.5 py-1 text-[9px] text-ink-600"
                    >
                      {badge}
                    </span>
                  ))}
                </div>
              )}
              {/* 설명이 긴 상품은 구매 박스가 통째로 밀려 장바구니 버튼이 화면 밖으로
                  나간다. 앞부분만 보여주고 나머지는 "자세히 보기"로 넘긴다. */}
              {product.description && (
                <Expandable lines={7} className="mt-5">
                  <DescriptionBlock text={product.description} only="text" />
                </Expandable>
              )}
            </Reveal>

            <AddToCart
              className="mt-8"
              product={{
                id: product.id,
                slug: product.slug,
                name: product.name,
                stock: product.stock,
                soldOut,
                effectivePrice,
                price: product.price,
                compareAtPrice: product.compare_at_price,
                vipApplied,
                imageUrl: primaryImageUrl,
              }}
              options={options}
              specs={specRows}
              wishlistSlot={
                <WishlistButton
                  productId={product.id}
                  initialWished={wished}
                  isLoggedIn={user != null}
                  next={loginNext}
                />
              }
            />
          </div>
        </div>

        {/* ---------- 상세 섹션 ---------- */}
        <div className="mx-auto mt-20 max-w-3xl md:mt-28">
          {/* 상품 상세 이미지 — 세로 수천 px 이라 구매 박스가 아니라 여기서 전체폭으로 편다 */}
          {product.description && hasDescriptionImages(product.description) && (
            <section>
              <Reveal as="div" variant="rule" className="h-px bg-ink-200" />
              <div className="py-14 md:py-16">
                <Reveal variant="fade">
                  <SectionTitle
                    overline="Detail"
                    title="상품 상세"
                    className="mb-8"
                  />
                </Reveal>
                <DescriptionBlock text={product.description} only="images" />
              </div>
            </section>
          )}

          {/* 에디토리얼 스토리 */}
          {product.story && (
            <section>
              <Reveal as="div" variant="rule" className="h-px bg-ink-200" />
              <div className="py-14 md:py-16">
                <Reveal variant="fade">
                  <p className="label-caps text-center text-forest-600">Story</p>
                </Reveal>
                <RevealText
                  as="h2"
                  delay={0.08}
                  className="headline-serif mt-3 block text-center text-2xl text-ink-900"
                  text="다름이 빚은 이야기"
                />
                <Reveal variant="blur" delay={0.18}>
                  <StoryBlock story={product.story} className="mt-10" />
                </Reveal>
              </div>
            </section>
          )}

          {/* 영양 정보 */}
          {hasNutrition && (
            <section>
              <Reveal as="div" variant="rule" className="h-px bg-ink-200" />
              <div className="py-14 md:py-16">
                <Reveal variant="fade">
                  <SectionTitle
                    overline="Nutrition"
                    title="영양 정보"
                    className="mb-8"
                  />
                </Reveal>
                <Reveal variant="fade" delay={0.12}>
                  <SpecTable data={product.nutrition} columns={2} />
                </Reveal>
              </div>
            </section>
          )}

          {/* 상세 스펙 */}
          <section>
            <Reveal as="div" variant="rule" className="h-px bg-ink-200" />
            <div className="py-14 md:py-16">
              <Reveal variant="fade">
                <SectionTitle
                  overline="Details"
                  title="상세 정보"
                  className="mb-8"
                />
              </Reveal>
              <Reveal variant="fade" delay={0.12}>
                {/* 원재료·원산지·인증은 길이가 제각각이라 두 줄만 두고 접는다 */}
                <SpecTable data={detailSpecs} clampLines={2} />
              </Reveal>
            </div>
          </section>

          {/* 배송 안내 */}
          <section>
            <Reveal as="div" variant="rule" className="h-px bg-ink-200" />
            <div className="py-14 md:py-16">
              <Reveal variant="fade">
                <SectionTitle
                  overline="Delivery"
                  title="배송 안내"
                  className="mb-8"
                />
              </Reveal>
              <Reveal variant="fade" delay={0.12}>
              <dl className="hairline-t">
              <div className="flex items-baseline justify-between gap-6 border-b border-ink-100 py-3">
                <dt className="shrink-0 text-sm text-ink-500">배송비</dt>
                <dd className="krw text-right text-sm text-ink-900">
                  {krw(shippingSettings.base_fee)}원 —{" "}
                  {krw(shippingSettings.free_threshold)}원 이상 무료 배송
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-6 border-b border-ink-100 py-3">
                <dt className="shrink-0 text-sm text-ink-500">배송 방법</dt>
                <dd className="text-right text-sm text-ink-900">
                  {STORAGE_SHIPPING_NOTES[product.storage_type]}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-6 border-b border-ink-100 py-3">
                <dt className="shrink-0 text-sm text-ink-500">출고</dt>
                <dd className="text-right text-sm text-ink-900">
                  평일 기준 1–2일 내 출고됩니다.
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-6 border-b border-ink-100 py-3">
                <dt className="shrink-0 text-sm text-ink-500">도서산간</dt>
                <dd className="krw text-right text-sm text-ink-900">
                  추가 배송비 {krw(shippingSettings.island_extra)}원이 발생할 수
                  있습니다.
                </dd>
              </div>
              </dl>
              <p className="mt-5 text-[13px] leading-relaxed text-ink-400">
                배송 관련 문의는 고객센터 {COMPANY.tel} ({COMPANY.csHours})로
                연락해 주세요.
              </p>
              </Reveal>
            </div>
          </section>

          {/* 리뷰 */}
          <section id="reviews">
            <Reveal as="div" variant="rule" className="h-px bg-ink-200" />
            <div className="py-14 md:py-16">
              <Reveal variant="fade">
                <SectionTitle
                  overline="Reviews"
                  title={`고객 리뷰${reviews.length > 0 ? ` (${reviews.length})` : ""}`}
                  className="mb-10"
                />
              </Reveal>
              <ReviewsSection
                productId={product.id}
                reviews={reviews}
                isLoggedIn={user != null}
                alreadyReviewed={alreadyReviewed}
                orderItemId={orderItemId}
                loginNext={loginNext}
              />
            </div>
          </section>

          {/* 상품 문의 */}
          <section id="inquiries">
            <Reveal as="div" variant="rule" className="h-px bg-ink-200" />
            <div className="py-14 md:py-16">
              <Reveal variant="fade">
                <SectionTitle
                  overline="Q&amp;A"
                  title={`상품 문의${inquiries.length > 0 ? ` (${inquiries.length})` : ""}`}
                  className="mb-10"
                />
              </Reveal>
              <Reveal variant="fade" delay={0.1}>
                <InquiriesSection
                  productId={product.id}
                  inquiries={inquiries}
                  isLoggedIn={user != null}
                  loginNext={loginNext}
                />
              </Reveal>
            </div>
          </section>
        </div>

        {/* ---------- 관련 상품 ---------- */}
        {related.length > 0 && (
          <section className="mt-4">
            <Reveal as="div" variant="rule" className="h-px bg-ink-200" />
            <div className="py-16 md:py-20">
              <Reveal variant="fade">
                <SectionTitle
                  overline="More From Daleum"
                  title="함께 보면 좋은 상품"
                  action={{ href: "/products", label: "전체 보기" }}
                  className="mb-10"
                />
              </Reveal>
              <div className="grid grid-cols-2 gap-x-3 gap-y-10 md:grid-cols-4 md:gap-x-4">
                {related.map((p, i) => (
                  <Reveal key={p.id} delay={(i % 4) * 0.08}>
                    <ProductCard product={p} />
                  </Reveal>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
