import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { createServiceClient } from "@/lib/supabase/service";
import { DEFAULT_SHIPPING } from "@/lib/shipping";
import type {
  Banner,
  Category,
  Notice,
  Popup,
  ProductCardRow,
  ProductWithImages,
  ShippingSettings,
} from "@/lib/types";
import type { SortKey } from "@/components/catalog/sort";

/* ============================================================
   스토어프론트 공용 데이터 캐시 계층.

   왜 필요한가 — 실측 근거:
   스토어프론트 라우트는 전부 동적이라 요청마다 DB를 처음부터 다시 조회했다.
   여기에 Next의 <Link> 프리페치가 겹치면서, /products 한 번 열 때
   RSC 프리페치 요청이 35건 발생하고 각각 0.5~4.3초가 걸렸다
   (10건 동시 프리페치 = 8.5초 실측). 프리페치도 레이아웃을 실제로 실행하기
   때문에, 캐시가 없으면 페이지 한 장이 수십 번의 풀 렌더 + DB 왕복을 유발한다.

   이 계층을 거치면 같은 조회가 revalidate 주기당 1회로 접힌다.

   ── 경계 규칙 (반드시 지킬 것) ────────────────────────────────
   여기 담기는 것은 "로그아웃한 방문자에게 보이는 것과 동일한" 공용 데이터뿐이다.
   아래는 절대 이 파일에 들어오면 안 된다 (전 사용자 공유 캐시라 곧 유출이다):
     - 위시리스트, 주문/구매 이력, 내 리뷰 작성 여부
     - VIP 가격 (vip_members / vip_access_codes / vip_product_prices)
     - 비공개 문의의 본문
   위 항목은 캐시 밖에서 세션 클라이언트로 요청마다 조회한다.
   (components/catalog/queries.ts 의 getRequestVipPricing 이 그 자리다.)
   ============================================================ */

/** revalidateTag 로 무효화할 때 쓰는 태그. 관리자 쓰기 경로에서 호출한다. */
export const CACHE_TAGS = {
  categories: "categories",
  products: "products",
  reviews: "reviews",
  inquiries: "inquiries",
  settings: "settings",
  /** 배너 / 팝업 / 공지 */
  content: "content",
} as const;

/**
 * 태그 무효화가 한 군데라도 누락됐을 때를 대비한 안전망 TTL(초).
 * 태그가 정상 동작하면 이 값이 만료되기 전에 갱신된다.
 */
export const TTL = {
  categories: 300,
  products: 60,
  reviews: 180,
  // 앱 안에 관리자 답변 쓰기 경로가 없어 이 태그를 비워 줄 지점이 고객 등록 경로뿐이다.
  // 관리자 문의 답변 라우트가 생기면 다시 180 으로 올릴 것.
  inquiries: 60,
  settings: 600,
  content: 300,
} as const;

/**
 * 스토어에 노출되는 상품 상태.
 *
 * 규칙: 상품을 읽는 캐시 함수는 예외 없이 이 필터를 건다. anon 클라이언트라
 * RLS(products_public_read)가 이미 같은 조건을 걸지만, 나중에 service 클라이언트로
 * 바뀌어도 계약이 코드에 남아 있도록 명시한다.
 * 유일한 예외는 getCachedBulkProducts 이며 그 이유는 해당 함수 주석에 있다.
 */
export const VISIBLE_STATUSES = ["active", "sold_out"] as const;

/**
 * 카드 표시에 필요한 컬럼만. `select("*")` 대비 응답의 절반 이상을 덜어낸다.
 * (실측: 20개 목록 응답 120KB 중 description 28.6% + specs 13.1% + story 13.0%
 *  + nutrition 3.4% = 58%가 카드에서 전혀 쓰이지 않았다.)
 * 원가(cost_price)와 공급 라인(supplier)은 고객 화면에 나갈 이유가 없어 함께 뺀다.
 */
export const PRODUCT_CARD_COLUMNS = [
  "id",
  "slug",
  "name",
  "subtitle",
  "category_id",
  "brand",
  "price",
  "compare_at_price",
  "sku",
  "stock",
  "low_stock_threshold",
  "status",
  "storage_type",
  "origin",
  "weight",
  "units_per_pack",
  "badges",
  "tags",
  "is_featured",
  "sort_order",
  "view_count",
  "created_at",
  "updated_at",
].join(", ");

/** 카드용 조인 셀렉트 — 이미지도 표시에 쓰는 4개 컬럼만 가져온다 */
export const PRODUCT_CARD_SELECT = `${PRODUCT_CARD_COLUMNS}, product_images(url, alt, sort_order, is_primary), categories(id, slug, name)`;

/** 상세 페이지용 — 본문 컬럼까지 전부 필요하다 */
export const PRODUCT_DETAIL_SELECT =
  "*, product_images(*), product_variants(*), categories(id, slug, name)";

/* ---------------- 카테고리 ---------------- */

/**
 * 활성 카테고리 — 헤더/카테고리 탭/홈이 전부 같은 목록을 쓴다.
 * 캐시 이전에는 (shop)/layout 과 products/page 가 같은 테이블을 요청마다 각각 조회했다.
 */
export const getCachedCategories = unstable_cache(
  async (): Promise<Category[]> => {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("categories")
      .select("*")
      .eq("is_active", true)
      // sort_order 동점 시 순서가 요청마다 흔들리지 않도록 2차 키를 고정한다
      .order("sort_order", { ascending: true })
      .order("slug", { ascending: true });
    return (data ?? []) as Category[];
  },
  ["storefront:categories:active"],
  { tags: [CACHE_TAGS.categories], revalidate: TTL.categories }
);

/* ---------------- 상품 개수 ---------------- */

export interface ProductCounts {
  /** 전체 노출 상품 수 */
  total: number;
  /** category_id → 개수 */
  byCategory: Record<string, number>;
}

/**
 * 카테고리 탭에 붙는 개수.
 *
 * category_id 한 컬럼만 훑는 것은 PostgREST 로 GROUP BY 를 표현할 수 없어서다.
 * 캐시 덕에 revalidate 주기당 1회만 돌고 행당 40바이트 수준이라 현재 규모에서는
 * 충분하다. 상품이 수천 개로 늘면 집계 RPC(뷰)로 옮길 것.
 */
export const getCachedProductCounts = unstable_cache(
  async (): Promise<ProductCounts> => {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("products")
      .select("category_id")
      .in("status", [...VISIBLE_STATUSES]);

    const byCategory: Record<string, number> = {};
    for (const row of (data ?? []) as { category_id: string | null }[]) {
      if (row.category_id) {
        byCategory[row.category_id] = (byCategory[row.category_id] ?? 0) + 1;
      }
    }
    return { total: (data ?? []).length, byCategory };
  },
  ["storefront:products:counts"],
  { tags: [CACHE_TAGS.products], revalidate: TTL.products }
);

/* ---------------- 상품 목록 ---------------- */

export interface ProductListQuery {
  categoryId: string | null;
  sort: SortKey;
  page: number;
  pageSize: number;
}

/** 인자는 자동으로 캐시 키에 포함되므로 카테고리·정렬·페이지 조합마다 별도 엔트리가 생긴다. */
export const getCachedProductCards = unstable_cache(
  async ({
    categoryId,
    sort,
    page,
    pageSize,
  }: ProductListQuery): Promise<ProductCardRow[]> => {
    const supabase = createPublicClient();
    let query = supabase
      .from("products")
      .select(PRODUCT_CARD_SELECT)
      .in("status", [...VISIBLE_STATUSES]);
    if (categoryId) query = query.eq("category_id", categoryId);

    switch (sort) {
      case "price_asc":
        query = query
          .order("price", { ascending: true })
          .order("created_at", { ascending: false });
        break;
      case "price_desc":
        query = query
          .order("price", { ascending: false })
          .order("created_at", { ascending: false });
        break;
      case "popular":
        query = query
          .order("view_count", { ascending: false })
          .order("created_at", { ascending: false });
        break;
      default:
        query = query.order("created_at", { ascending: false });
    }

    const { data } = await query.range((page - 1) * pageSize, page * pageSize - 1);
    return (data ?? []) as unknown as ProductCardRow[];
  },
  ["storefront:products:cards"],
  { tags: [CACHE_TAGS.products], revalidate: TTL.products }
);

/* ---------------- 상품 상세 ---------------- */

export const getCachedProductBySlug = unstable_cache(
  async (slug: string): Promise<ProductWithImages | null> => {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("products")
      .select(PRODUCT_DETAIL_SELECT)
      .eq("slug", slug)
      .in("status", [...VISIBLE_STATUSES])
      .maybeSingle();
    return (data ?? null) as unknown as ProductWithImages | null;
  },
  ["storefront:product:by-slug"],
  { tags: [CACHE_TAGS.products], revalidate: TTL.products }
);

/** 관련 상품 — 같은 카테고리 우선, 모자라면 최신순으로 채운다 */
export const getCachedRelatedProducts = unstable_cache(
  async (
    productId: string,
    categoryId: string | null,
    limit: number
  ): Promise<ProductCardRow[]> => {
    const supabase = createPublicClient();
    let rows: ProductCardRow[] = [];

    if (categoryId) {
      const { data } = await supabase
        .from("products")
        .select(PRODUCT_CARD_SELECT)
        .in("status", [...VISIBLE_STATUSES])
        .eq("category_id", categoryId)
        .neq("id", productId)
        .order("view_count", { ascending: false })
        .limit(limit);
      rows = (data ?? []) as unknown as ProductCardRow[];
    }

    if (rows.length < limit) {
      const excludeIds = [productId, ...rows.map((p) => p.id)];
      const { data } = await supabase
        .from("products")
        .select(PRODUCT_CARD_SELECT)
        .in("status", [...VISIBLE_STATUSES])
        .not("id", "in", `(${excludeIds.join(",")})`)
        .order("created_at", { ascending: false })
        .limit(limit - rows.length);
      rows = [...rows, ...((data ?? []) as unknown as ProductCardRow[])];
    }

    return rows;
  },
  ["storefront:products:related"],
  { tags: [CACHE_TAGS.products], revalidate: TTL.products }
);

/* ---------------- 리뷰 ---------------- */

/** 이름은 캐시에 담기 전에 마스킹한다 — 원본 이름이 캐시에 남지 않는다. */
function maskName(name: string | null | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) return "익명";
  return `${trimmed[0]}**`;
}

/**
 * 홈 전용 마스킹 — 상세 페이지 규칙("김**")과 다르다. 홈은 "김지현" → "김*현".
 * ReviewsSection 이 쓰던 규칙을 그대로 옮겨 왔다. 표기가 바뀌지 않도록 원문 로직을 보존한다.
 */
function maskHomeName(name: string | null | undefined): string {
  const t = name?.trim() ?? "";
  if (t.length === 0) return "다름 고객";
  if (t.length === 1) return t;
  if (t.length === 2) return `${t[0]}*`;
  return `${t[0]}${"*".repeat(t.length - 2)}${t[t.length - 1]}`;
}

export interface CachedReview {
  id: string;
  maskedName: string;
  rating: number;
  content: string;
  imageUrls: string[];
  isBuyer: boolean;
  adminReply: string | null;
  createdAt: string;
}

/**
 * 공개 리뷰 — 누가 보든 동일하다.
 * profiles(name) 조인이 필요해 service 클라이언트를 쓰지만, 캐시에 담기 전에
 * 마스킹과 필드 선별을 끝내므로 원본 이름·user_id 는 캐시에 저장되지 않는다.
 */
export const getCachedReviews = unstable_cache(
  async (productId: string): Promise<CachedReview[]> => {
    const service = createServiceClient();
    const { data } = await service
      .from("reviews")
      .select(
        "id, order_item_id, rating, content, image_urls, admin_reply, created_at, profiles(name)"
      )
      .eq("product_id", productId)
      .eq("is_hidden", false)
      .order("created_at", { ascending: false })
      .limit(200);

    return ((data ?? []) as unknown as {
      id: string;
      order_item_id: string | null;
      rating: number;
      content: string;
      image_urls: string[] | null;
      admin_reply: string | null;
      created_at: string;
      profiles: { name: string | null } | null;
    }[]).map((r) => ({
      id: r.id,
      maskedName: maskName(r.profiles?.name),
      rating: r.rating,
      content: r.content,
      imageUrls: r.image_urls ?? [],
      isBuyer: r.order_item_id != null,
      adminReply: r.admin_reply,
      createdAt: r.created_at,
    }));
  },
  ["storefront:reviews:by-product"],
  { tags: [CACHE_TAGS.reviews], revalidate: TTL.reviews }
);

/* ---------------- 상품 문의 ---------------- */

/**
 * 문의 목록.
 *
 * 주의: 비공개 문의의 본문 공개 여부는 "보는 사람이 작성자인가"에 달렸다 —
 * 즉 사용자 종속이다. 그래서 여기서는 잠그지 않은 원본과 작성자 id 를 담아 두고,
 * 잠금 판정(locked / isMine)은 반드시 **호출부에서 요청마다** 수행한다.
 * userId 는 서버 캐시에만 머물고 클라이언트로 내려가는 InquiryItem 에는 포함되지 않는다.
 */
export interface CachedInquiry {
  id: string;
  userId: string;
  maskedName: string;
  question: string;
  answer: string | null;
  isPrivate: boolean;
  answeredAt: string | null;
  createdAt: string;
}

export const getCachedInquiries = unstable_cache(
  async (productId: string): Promise<CachedInquiry[]> => {
    const service = createServiceClient();
    const { data } = await service
      .from("product_inquiries")
      .select(
        "id, user_id, question, answer, is_private, answered_at, created_at, profiles(name)"
      )
      .eq("product_id", productId)
      .order("created_at", { ascending: false })
      .limit(100);

    return ((data ?? []) as unknown as {
      id: string;
      user_id: string;
      question: string;
      answer: string | null;
      is_private: boolean;
      answered_at: string | null;
      created_at: string;
      profiles: { name: string | null } | null;
    }[]).map((q) => ({
      id: q.id,
      userId: q.user_id,
      maskedName: maskName(q.profiles?.name),
      question: q.question,
      answer: q.answer,
      isPrivate: q.is_private,
      answeredAt: q.answered_at,
      createdAt: q.created_at,
    }));
  },
  ["storefront:inquiries:by-product"],
  { tags: [CACHE_TAGS.inquiries], revalidate: TTL.inquiries }
);

/* ---------------- 배송 설정 ---------------- */

export const getCachedShippingSettings = unstable_cache(
  async (): Promise<ShippingSettings> => {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "shipping")
      .maybeSingle();
    if (!data?.value) return DEFAULT_SHIPPING;
    return { ...DEFAULT_SHIPPING, ...(data.value as Partial<ShippingSettings>) };
  },
  ["storefront:settings:shipping"],
  { tags: [CACHE_TAGS.settings], revalidate: TTL.settings }
);

/* ---------------- 홈 ---------------- */

/** 히어로 배너 후보 — 기간 유효성 판정은 "지금"에 달렸으므로 호출부에서 한다 */
export const getCachedHeroBanners = unstable_cache(
  async (): Promise<Banner[]> => {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("banners")
      .select("*")
      .eq("placement", "hero")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    return (data ?? []) as Banner[];
  },
  ["storefront:banners:hero"],
  { tags: [CACHE_TAGS.content], revalidate: TTL.content }
);

export const getCachedPopups = unstable_cache(
  async (): Promise<Popup[]> => {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("popups")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    return (data ?? []) as Popup[];
  },
  ["storefront:popups:active"],
  { tags: [CACHE_TAGS.content], revalidate: TTL.content }
);

export const getCachedFeaturedProducts = unstable_cache(
  async (limit: number): Promise<ProductCardRow[]> => {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("products")
      .select(PRODUCT_CARD_SELECT)
      .in("status", [...VISIBLE_STATUSES])
      .eq("is_featured", true)
      .order("sort_order", { ascending: true })
      .limit(limit);
    return (data ?? []) as unknown as ProductCardRow[];
  },
  ["storefront:products:featured"],
  { tags: [CACHE_TAGS.products], revalidate: TTL.products }
);

export const getCachedLatestProducts = unstable_cache(
  async (limit: number): Promise<ProductCardRow[]> => {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("products")
      .select(PRODUCT_CARD_SELECT)
      .in("status", [...VISIBLE_STATUSES])
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data ?? []) as unknown as ProductCardRow[];
  },
  ["storefront:products:latest"],
  { tags: [CACHE_TAGS.products], revalidate: TTL.products }
);

export interface CachedHomeReview {
  id: string;
  rating: number;
  content: string;
  /**
   * 홈 규칙("김지현" → "김*현")으로 **캐시 적재 전에** 마스킹을 끝낸 이름.
   * 원본 이름이 전 방문자 공유 캐시에 남지 않게 하려는 것이며,
   * 상세 페이지용 CachedReview 의 "김**" 규칙과는 형식이 다르다(원래 화면이 그렇다).
   */
  maskedName: string;
  productName: string | null;
}

export const getCachedHomeReviews = unstable_cache(
  async (limit: number): Promise<CachedHomeReview[]> => {
    // profiles RLS(profiles_select_own: auth.uid() = id or is_admin())가 anon 을 막으므로
    // public 클라이언트로는 profiles(name) 임베드가 에러 없이 null 만 돌려준다
    // (PostgREST 는 막힌 임베드를 조용히 null 로 준다 — 로그도 남지 않는다).
    // 상세용 getCachedReviews 와 같은 이유로 service 를 쓰되, 아래에서 캐시에 담기 전에
    // 마스킹을 끝내므로 원본 이름은 캐시에 저장되지 않는다.
    const service = createServiceClient();
    const { data } = await service
      .from("reviews")
      .select("id, rating, content, profiles(name), products(name)")
      .eq("is_hidden", false)
      .gte("rating", 4)
      .order("created_at", { ascending: false })
      .limit(limit);

    const one = <T,>(v: T | T[] | null): T | null =>
      Array.isArray(v) ? (v[0] ?? null) : v;

    return ((data ?? []) as unknown as {
      id: string;
      rating: number;
      content: string;
      profiles: { name: string | null } | { name: string | null }[] | null;
      products: { name: string } | { name: string }[] | null;
    }[]).map((row) => ({
      id: row.id,
      rating: row.rating,
      content: row.content,
      maskedName: maskHomeName(one(row.profiles)?.name),
      productName: one(row.products)?.name ?? null,
    }));
  },
  ["storefront:reviews:home"],
  { tags: [CACHE_TAGS.reviews], revalidate: TTL.reviews }
);

/* ---------------- 공지 ---------------- */

export const getCachedNotices = unstable_cache(
  async (limit: number): Promise<Notice[]> => {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("notices")
      .select("*")
      .eq("is_active", true)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data ?? []) as Notice[];
  },
  ["storefront:notices:active"],
  { tags: [CACHE_TAGS.content], revalidate: TTL.content }
);

/* ---------------- B2B 벌크 상품 ---------------- */

/**
 * 업소용·OEM 목록은 draft 상태로 두고 사양만 공개한다 — RLS 로 익명에게 가려지므로
 * 여기서만 service 클라이언트를 쓴다. 쿠키/유저와 무관한 고정 목록이라 캐시해도 안전하다.
 */
export const getCachedBulkProducts = unstable_cache(
  async (): Promise<ProductWithImages[]> => {
    const service = createServiceClient();
    const { data } = await service
      .from("products")
      .select("*, product_images(*)")
      .contains("tags", ["B2B"])
      .order("sort_order", { ascending: true });
    return (data ?? []) as unknown as ProductWithImages[];
  },
  ["storefront:products:bulk-b2b"],
  { tags: [CACHE_TAGS.products], revalidate: TTL.products }
);
