import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { CACHE_TAGS, PRODUCT_CARD_SELECT, TTL, VISIBLE_STATUSES } from "@/lib/cache";
import { createPublicClient } from "@/lib/supabase/public";
import type { PricedProductCard, ProductCardRow } from "@/lib/types";
import ProductCard from "@/components/shop/ProductCard";
import EmptyState from "@/components/shop/EmptyState";
import Reveal from "@/components/shop/Reveal";
import RevealText from "@/components/shop/RevealText";
import PaginationNav from "@/components/catalog/PaginationNav";
import SearchTracker from "@/components/catalog/SearchTracker";
import { toPricedProducts } from "@/components/catalog/queries";

const PAGE_SIZE = 24;

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** ilike or() 필터에 안전하게 넣을 수 있도록 정제 */
function cleanQuery(raw: string | undefined): string {
  return (raw ?? "").replace(/[,()]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

/**
 * 검색 or() 필터 문자열.
 * 캐시 콜백 두 곳이 **완전히 동일한 문자열**을 써야 개수와 목록이 어긋나지 않으므로
 * 한 곳에서만 만든다. 입력은 항상 cleanQuery() 를 통과한 값이다.
 */
function buildOrFilter(q: string): string {
  const pattern = `%${q}%`;
  return `name.ilike.${pattern},subtitle.ilike.${pattern},description.ilike.${pattern}`;
}

/* ============================================================
   검색 캐시 — 검색어에만 의존하는 공용 데이터.

   검색 결과 자체는 로그인 여부와 무관하다(노출 상태 필터가 고정이다).
   사용자마다 달라지는 것은 VIP 가격뿐이라, 그 해석(toPricedProducts)만
   캐시 밖 요청 스코프에 남긴다.

   전용 캐시 함수를 @/lib/cache 가 아니라 이 파일에 두는 이유는
   orFilter 생성 규칙(cleanQuery + ilike 3컬럼)이 검색 라우트에만 속하기 때문이다.
   캐시 키에는 keyParts 뿐 아니라 인자도 함께 들어가므로 검색어·페이지 조합마다
   별도 엔트리가 생긴다.
   ============================================================ */

/** 검색 결과 개수 — 페이지 클램프에 필요하다. 빈 검색어로는 호출되지 않는다. */
const getCachedSearchCount = unstable_cache(
  async (q: string): Promise<number> => {
    const supabase = createPublicClient();
    const { count } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .in("status", [...VISIBLE_STATUSES])
      .or(buildOrFilter(q));
    return count ?? 0;
  },
  ["storefront:search:count"],
  { tags: [CACHE_TAGS.products], revalidate: TTL.products }
);

/** 검색 결과 한 페이지. 정렬은 조회수 → 최신순 고정(검색에는 정렬 선택이 없다). */
const getCachedSearchCards = unstable_cache(
  async (q: string, page: number, pageSize: number): Promise<ProductCardRow[]> => {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("products")
      .select(PRODUCT_CARD_SELECT)
      .in("status", [...VISIBLE_STATUSES])
      .or(buildOrFilter(q))
      .order("view_count", { ascending: false })
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    return (data ?? []) as unknown as ProductCardRow[];
  },
  ["storefront:search:cards"],
  { tags: [CACHE_TAGS.products], revalidate: TTL.products }
);

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

  // ---------- 개수 → 페이지 클램프 → 결과 조회 ----------
  // 페이지 번호가 총 개수에 걸려 클램프되므로 두 조회는 순서를 지켜야 한다.
  // 다만 둘 다 캐시 계층을 거치므로 통상적으로는 DB 왕복이 발생하지 않는다.
  const total = await getCachedSearchCount(q);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rawPage = Number.parseInt(first(sp.page) ?? "1", 10);
  const page = Math.min(
    Math.max(Number.isNaN(rawPage) ? 1 : rawPage, 1),
    totalPages
  );

  // toPricedProducts 는 입력 타입을 보존하는 제네릭이라, 타입 인자를 명시하지 않으면
  // 제약({id, price})으로만 좁혀져 카드 렌더에 필요한 필드가 사라진다.
  let products: PricedProductCard[] = [];
  if (total > 0) {
    const rows = await getCachedSearchCards(q, page, PAGE_SIZE);
    // VIP 가격만 요청마다 새로 해석한다 — 사용자별로 다르므로 캐시 대상이 아니다.
    products = await toPricedProducts(rows);
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
