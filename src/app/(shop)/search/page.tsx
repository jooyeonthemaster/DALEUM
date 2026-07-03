import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { ProductWithImages } from "@/lib/types";
import ProductCard from "@/components/shop/ProductCard";
import EmptyState from "@/components/shop/EmptyState";
import Reveal from "@/components/shop/Reveal";
import RevealText from "@/components/shop/RevealText";
import PaginationNav from "@/components/catalog/PaginationNav";
import SearchTracker from "@/components/catalog/SearchTracker";
import {
  PRODUCT_CARD_SELECT,
  VISIBLE_STATUSES,
  toPricedProducts,
} from "@/components/catalog/queries";

const PAGE_SIZE = 24;

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** ilike or() 필터에 안전하게 넣을 수 있도록 정제 */
function cleanQuery(raw: string | undefined): string {
  return (raw ?? "").replace(/[,()]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const sp = await searchParams;
  const q = cleanQuery(first(sp.q));
  return {
    title: q ? `‘${q}’ 검색 결과` : "검색",
    description: "다름의 발효곤약 상품을 검색해 보세요.",
  };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const q = cleanQuery(first(sp.q));
  const supabase = await createClient();

  if (!q) {
    return (
      <div className="container-hall pb-16 pt-10 md:pb-28 md:pt-16">
        <Reveal variant="fade">
          <p className="label-caps text-forest-600">Search</p>
        </Reveal>
        <RevealText
          as="h1"
          delay={0.06}
          className="headline-serif mt-3 block text-3xl text-ink-900 md:text-4xl"
          text="검색"
        />
        <Reveal variant="fade" delay={0.15}>
          <EmptyState
            title="찾고 싶은 상품을 검색해 보세요."
            description="상단의 검색 버튼을 눌러 상품명이나 키워드를 입력하시면 됩니다."
            action={{ href: "/products", label: "전체 상품 보기" }}
          />
        </Reveal>
      </div>
    );
  }

  const pattern = `%${q}%`;
  const orFilter = `name.ilike.${pattern},subtitle.ilike.${pattern},description.ilike.${pattern}`;

  // ---------- 개수 → 페이지 클램프 → 결과 조회 ----------
  const { count } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .in("status", [...VISIBLE_STATUSES])
    .or(orFilter);

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rawPage = Number.parseInt(first(sp.page) ?? "1", 10);
  const page = Math.min(
    Math.max(Number.isNaN(rawPage) ? 1 : rawPage, 1),
    totalPages
  );

  let products: Awaited<ReturnType<typeof toPricedProducts>> = [];
  if (total > 0) {
    const { data } = await supabase
      .from("products")
      .select(PRODUCT_CARD_SELECT)
      .in("status", [...VISIBLE_STATUSES])
      .or(orFilter)
      .order("view_count", { ascending: false })
      .order("created_at", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    products = await toPricedProducts(
      (data ?? []) as unknown as ProductWithImages[]
    );
  }

  return (
    <div className="container-hall pb-16 pt-10 md:pb-28 md:pt-16">
      <SearchTracker query={q} resultCount={total} />

      <Reveal variant="fade">
        <p className="label-caps text-forest-600">Search</p>
      </Reveal>
      <RevealText
        as="h1"
        delay={0.06}
        className="headline-serif mt-3 block text-3xl text-ink-900 md:text-4xl"
        text={`‘${q}’ 검색 결과`}
      />
      <Reveal variant="fade" delay={0.14}>
        <p className="krw hairline-b mt-6 pb-5 text-[13px] text-ink-500">
          총 {total}개의 상품을 찾았습니다
        </p>
      </Reveal>

      {products.length === 0 ? (
        <Reveal variant="fade" delay={0.2}>
          <EmptyState
            title={`‘${q}’에 꼭 맞는 상품을 찾지 못했습니다.`}
            description="다른 검색어로 다시 시도하시거나, 전체 상품에서 천천히 둘러보세요."
            action={{ href: "/products", label: "전체 상품 보기" }}
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

      <PaginationNav
        page={page}
        totalPages={totalPages}
        basePath="/search"
        query={{ q }}
        className="mt-16 md:mt-20"
      />
    </div>
  );
}
