import type { Metadata } from "next";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { ProductWithImages } from "@/lib/types";
import ProductCard from "@/components/shop/ProductCard";
import EmptyState from "@/components/shop/EmptyState";
import Reveal from "@/components/shop/Reveal";
import RevealText from "@/components/shop/RevealText";
import CategoryTabs, { type CategoryTabItem } from "@/components/catalog/CategoryTabs";
import SortSelect from "@/components/catalog/SortSelect";
import { parseSortKey, type SortKey } from "@/components/catalog/sort";
import PaginationNav from "@/components/catalog/PaginationNav";
import {
  PRODUCT_CARD_SELECT,
  VISIBLE_STATUSES,
  toPricedProducts,
} from "@/components/catalog/queries";

const PAGE_SIZE = 24;

interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

const getCategories = cache(async (): Promise<CategoryRow[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("categories")
    .select("id, slug, name, description")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  return (data ?? []) as CategoryRow[];
});

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const sp = await searchParams;
  const categories = await getCategories();
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
  const supabase = await createClient();

  const categories = await getCategories();
  const activeCategory =
    categories.find((c) => c.slug === first(sp.category)) ?? null;

  // ---------- 카테고리별 개수 (탭 표시 + 전체 카운트) ----------
  const { data: countRows } = await supabase
    .from("products")
    .select("category_id")
    .in("status", [...VISIBLE_STATUSES]);
  const counts = new Map<string, number>();
  for (const row of countRows ?? []) {
    if (row.category_id) {
      counts.set(row.category_id, (counts.get(row.category_id) ?? 0) + 1);
    }
  }
  const totalAll = (countRows ?? []).length;
  const total = activeCategory ? counts.get(activeCategory.id) ?? 0 : totalAll;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const rawPage = Number.parseInt(first(sp.page) ?? "1", 10);
  const page = Math.min(
    Math.max(Number.isNaN(rawPage) ? 1 : rawPage, 1),
    totalPages
  );

  // ---------- 상품 조회 (RLS: active + sold_out만 보임) ----------
  let query = supabase
    .from("products")
    .select(PRODUCT_CARD_SELECT)
    .in("status", [...VISIBLE_STATUSES]);
  if (activeCategory) query = query.eq("category_id", activeCategory.id);

  switch (sort) {
    case "price_asc":
      query = query.order("price", { ascending: true }).order("created_at", { ascending: false });
      break;
    case "price_desc":
      query = query.order("price", { ascending: false }).order("created_at", { ascending: false });
      break;
    case "popular":
      query = query.order("view_count", { ascending: false }).order("created_at", { ascending: false });
      break;
    default:
      query = query.order("created_at", { ascending: false });
  }

  const { data } = await query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const products = await toPricedProducts(
    (data ?? []) as unknown as ProductWithImages[]
  );

  const tabItems: CategoryTabItem[] = [
    { slug: null, name: "전체", count: totalAll },
    ...categories.map((c) => ({
      slug: c.slug,
      name: c.name,
      count: counts.get(c.id) ?? 0,
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
