import type { Metadata } from "next";
import { getCachedCategories, getCachedProductCards, getCachedProductCounts } from "@/lib/cache";
import ProductCard from "@/components/shop/ProductCard";
import EmptyState from "@/components/shop/EmptyState";
import Reveal from "@/components/shop/Reveal";
import RevealText from "@/components/shop/RevealText";
import CategoryTabs, { type CategoryTabItem } from "@/components/catalog/CategoryTabs";
import SortSelect from "@/components/catalog/SortSelect";
import { parseSortKey, type SortKey } from "@/components/catalog/sort";
import PaginationNav from "@/components/catalog/PaginationNav";
import { toPricedProducts } from "@/components/catalog/queries";

const PAGE_SIZE = 24;

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const sp = await searchParams;
  const categories = await getCachedCategories();
  const active = categories.find((c) => c.slug === first(sp.category));
  return {
    title: active ? active.name : "전체 상품",
    description: active?.description
      ? active.description
      : "발효로 완성한 다름의 곤약 식탁 — 전체 상품을 둘러보세요.",
  };
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const sort: SortKey = parseSortKey(first(sp.sort));

  // 카테고리 목록과 개수는 서로 의존하지 않으므로 함께 띄운다.
  // 둘 다 캐시 계층을 거치므로 통상적으로는 DB 왕복이 발생하지 않는다.
  const [categories, counts] = await Promise.all([
    getCachedCategories(),
    getCachedProductCounts(),
  ]);

  const activeCategory =
    categories.find((c) => c.slug === first(sp.category)) ?? null;

  const total = activeCategory
    ? counts.byCategory[activeCategory.id] ?? 0
    : counts.total;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const rawPage = Number.parseInt(first(sp.page) ?? "1", 10);
  const page = Math.min(
    Math.max(Number.isNaN(rawPage) ? 1 : rawPage, 1),
    totalPages
  );

  // ---------- 상품 조회 ----------
  // 캐시 계층은 로그아웃 방문자 시야(anon)로만 읽으므로 노출 상태 필터가 항상 동일하다.
  const rows = await getCachedProductCards({
    categoryId: activeCategory?.id ?? null,
    sort,
    page,
    pageSize: PAGE_SIZE,
  });
  // VIP 가격만 요청마다 새로 해석한다 — 사용자별로 다르므로 캐시 대상이 아니다.
  const products = await toPricedProducts(rows);

  const tabItems: CategoryTabItem[] = [
    { slug: null, name: "전체", count: counts.total },
    ...categories.map((c) => ({
      slug: c.slug,
      name: c.name,
      count: counts.byCategory[c.id] ?? 0,
    })),
  ];

  return (
    <div className="container-hall pb-16 pt-10 md:pb-28 md:pt-16">
      {/* 타이틀 */}
      <Reveal variant="fade">
        <p className="label-caps text-forest-600">Fermented Konjac Collection</p>
      </Reveal>
      <RevealText
        as="h1"
        delay={0.06}
        className="headline-serif mt-3 block text-3xl text-ink-900 md:text-4xl"
        text={activeCategory ? activeCategory.name : "전체 상품"}
      />
      {activeCategory?.description && (
        <Reveal variant="fade" delay={0.14}>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-500">
            {activeCategory.description}
          </p>
        </Reveal>
      )}

      {/* 카테고리 탭 */}
      <Reveal variant="fade" delay={0.18} className="hairline-b mt-8 md:mt-10">
        <CategoryTabs
          items={tabItems}
          activeSlug={activeCategory?.slug ?? null}
          sort={sort}
        />
      </Reveal>

      {/* 개수 + 정렬 */}
      <Reveal
        variant="fade"
        delay={0.24}
        className="mt-3 flex items-center justify-between gap-4"
      >
        <p className="krw text-[13px] text-ink-500">총 {total}개의 상품</p>
        <SortSelect sort={sort} category={activeCategory?.slug ?? null} />
      </Reveal>

      {/* 상품 그리드 */}
      {products.length === 0 ? (
        <Reveal variant="fade" delay={0.2}>
          <EmptyState
            title="아직 준비된 상품이 없습니다."
            description="곧 새로운 상품으로 찾아뵙겠습니다. 다른 카테고리도 둘러보세요."
            action={
              activeCategory
                ? { href: "/products", label: "전체 상품 보기" }
                : undefined
            }
          />
        </Reveal>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-x-3 gap-y-10 md:grid-cols-3 md:gap-x-4 xl:grid-cols-4">
          {products.map((product, i) => (
            <Reveal key={product.id} delay={(i % 4) * 0.07}>
              <ProductCard product={product} priority={page === 1 && i < 4} />
            </Reveal>
          ))}
        </div>
      )}

      {/* 페이지네이션 */}
      <PaginationNav
        page={page}
        totalPages={totalPages}
        basePath="/products"
        query={{
          category: activeCategory?.slug,
          sort: sort !== "latest" ? sort : undefined,
        }}
        className="mt-16 md:mt-20"
      />
    </div>
  );
}
