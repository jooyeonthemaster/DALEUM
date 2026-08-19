import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { CACHE_TAGS } from "@/lib/cache";
import { isUuid } from "@/lib/orders";
import { computeHealth } from "@/app/admin/products/_list/product-health";
import type { SortKey } from "@/app/admin/products/_list/list-types";
import {
  InputError,
  PRODUCT_STATUSES,
  parseImages,
  parseProductFields,
  parseVariants,
  assertSellablePrice,
} from "./shared";

/* ============================================================
   GET  /api/admin/products — 목록 (검색/필터/정렬/페이지네이션)
   POST /api/admin/products — 신규 등록 (이미지/옵션/최초 재고 로그 포함)
   ============================================================ */

/**
 * 목록 전용 컬럼.
 *
 * 예전에는 `select("*")` 라 상세 본문(description)·브랜드 스토리·영양·스펙이 매 행마다
 * 딸려 왔다. 목록은 그중 아무것도 그리지 않는데 100개씩 보기를 켜면 그 쓸모없는 본문이
 * 응답의 대부분을 차지한다. 그래서 목록이 실제로 쓰는 컬럼만 고른다.
 * description 만 예외로 가져오는데, 상세페이지가 비었는지 판정한 다음 응답에서 뺀다.
 */
const LIST_COLUMNS = [
  "id",
  "slug",
  "name",
  "sku",
  "brand",
  "supplier",
  "category_id",
  "price",
  "compare_at_price",
  "cost_price",
  "stock",
  "low_stock_threshold",
  "status",
  "is_featured",
  "sort_order",
  "created_at",
  "description",
].join(", ");

// product_variants 에서 price_delta 까지 받는 이유: 고객이 실제로 내는 값은
// 판매가 + 옵션 추가금액이라, 가격 일괄 조정 미리보기가 "추가금액이 붙어 있어
// 이 상품은 계산한 비율대로 오르지 않는다" 를 세어 보여 주려면 이 값이 필요하다.
const LIST_SELECT = `${LIST_COLUMNS}, product_images(id, url, sort_order, is_primary), categories(id, slug, name), product_variants(id, stock, price_delta)`;

/**
 * 정렬 화이트리스트 — 화면(list-types.ts SORT_LABELS)과 같은 집합이어야 한다.
 *
 * 재고 정렬을 뺐다. 목록 화면의 재고 칸은 옵션이 있으면 **옵션 재고 합계**를 그리는데
 * 여기서는 상품 행의 stock 컬럼으로 줄을 세웠다. 두 숫자가 다른 상품에서는
 * 관리자가 보고 있는 값과 전혀 다른 순서가 나왔다(옵션만 재고를 가진 상품은
 * 상품 행 재고가 0이라 "재고 없는 순" 맨 위로 올라왔다).
 * 합계로 정렬하려면 DB 쪽에 합계 뷰/생성 컬럼이 있어야 한다 — 페이지네이션이
 * 서버 정렬을 전제로 하기 때문에 화면에서 정렬해 흉내 낼 수 없다. 스키마 건으로 보고했다.
 * 목록에 없는 값이 들어오면 아래에서 기본값(진열 순서)으로 떨어진다.
 */
const SORTABLE: Record<SortKey, string> = {
  sort_order: "sort_order",
  created_at: "created_at",
  name: "name",
  price: "price",
};

interface ListImageRow {
  id: string;
  url: string;
  sort_order: number;
  is_primary: boolean;
}

interface ListProductRow {
  id: string;
  description: string | null;
  price: number;
  product_images: ListImageRow[] | null;
  product_variants: { id: string; stock: number; price_delta: number }[] | null;
  categories: { id: string; slug: string; name: string } | null;
  [key: string]: unknown;
}

/**
 * PostgREST `or()` 안에서 뜻이 달라지는 문자를 없앤다.
 *
 * 쉼표·괄호는 or 구문 자체를 깨뜨리고, `%`·`_` 는 LIKE 와일드카드라
 * 관리자가 "50%" 로 검색하면 엉뚱한 상품이 잡혔다. 백슬래시도 이스케이프 문자다.
 */
function safeSearchTerm(q: string): string {
  return q.replace(/[,()]/g, " ").replace(/[%_\\]/g, " ").trim();
}

/**
 * GET /api/admin/products
 * ?q=검색어 &category=uuid &status=draft|active|sold_out|hidden
 * &supplier=자체 &brand=마틴조 &sort=sort_order|created_at|name|price|stock &dir=asc|desc
 * &page=1 &limit=20
 * → { products, total, page, totalPages, facets }
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? "20", 10) || 20));
  const q = (sp.get("q") ?? "").trim();
  const category = sp.get("category");
  const status = sp.get("status");
  const supplier = (sp.get("supplier") ?? "").trim();
  const brand = (sp.get("brand") ?? "").trim();

  const sortParam = sp.get("sort") ?? "sort_order";
  const sortKey: SortKey = sortParam in SORTABLE ? (sortParam as SortKey) : "sort_order";
  const ascending = (sp.get("dir") ?? "asc") !== "desc";

  let query = service.from("products").select(LIST_SELECT, { count: "exact" });

  if (q) {
    const safe = safeSearchTerm(q);
    // SKU 가 비어 있는 상품이 절반이라 이름·SKU 만으로는 검색이 사실상 안 됐다.
    // 관리자가 실제로 치는 말(브랜드명·공급처·부제)까지 넓힌다.
    if (safe) {
      query = query.or(
        [
          `name.ilike.%${safe}%`,
          `sku.ilike.%${safe}%`,
          `subtitle.ilike.%${safe}%`,
          `slug.ilike.%${safe}%`,
          `brand.ilike.%${safe}%`,
          `supplier.ilike.%${safe}%`,
        ].join(",")
      );
    }
  }
  if (category && isUuid(category)) query = query.eq("category_id", category);
  if (status && PRODUCT_STATUSES.includes(status as (typeof PRODUCT_STATUSES)[number])) {
    query = query.eq("status", status);
  }
  if (supplier) query = query.eq("supplier", supplier);
  if (brand) query = query.eq("brand", brand);

  const from = (page - 1) * limit;
  // id 를 마지막 정렬 기준으로 덧붙인다 — 같은 값이 잔뜩 겹치는 컬럼(sort_order 는 0이 7개다)에서
  // 순서가 요청마다 흔들리면 페이지를 넘길 때 같은 상품이 두 번 나오거나 빠진다.
  const { data, count, error } = await query
    .order(SORTABLE[sortKey], { ascending })
    .order("id", { ascending: true })
    .range(from, from + limit - 1);

  if (error) {
    console.error("[admin/products] 목록 조회 실패:", error.message);
    return NextResponse.json({ error: "상품 목록을 불러오지 못했습니다." }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as ListProductRow[];
  const products = rows.map((row) => {
    const images = [...(row.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      sku: row.sku,
      brand: row.brand,
      supplier: row.supplier,
      category_id: row.category_id,
      price: row.price,
      compare_at_price: row.compare_at_price,
      cost_price: row.cost_price,
      stock: row.stock,
      low_stock_threshold: row.low_stock_threshold,
      status: row.status,
      is_featured: row.is_featured,
      sort_order: row.sort_order,
      created_at: row.created_at,
      categories: row.categories,
      product_variants: row.product_variants ?? [],
      // description 은 "상세페이지가 비었는지" 판정에만 쓰고 응답에는 싣지 않는다.
      // 목록은 본문을 한 글자도 그리지 않는데, 100개씩 보기에서는 이게 응답의 대부분이었다.
      health: computeHealth({ price: row.price, description: row.description, images }),
      thumbnail: images.find((i) => i.is_primary)?.url ?? images[0]?.url ?? null,
      image_count: images.length,
    };
  });

  /**
   * 공급처·브랜드 필터의 선택지.
   *
   * 하드코딩하면 새 공급처가 들어온 날부터 화면이 거짓말을 한다. 실제로 저장돼 있는 값만
   * 훑어 내려보낸다(두 컬럼만 읽으므로 상품이 수백 개가 돼도 가볍다).
   *
   * 상한을 명시하는 이유: 예전에는 range 없이 전체 테이블을 훑었다. 지금은 27개라
   * 아무 일도 안 생기지만, PostgREST 는 응답 행 수에 자체 상한이 있어 어느 날
   * 조용히 잘리기 시작하면 **선택지에서 빠진 공급처가 화면에서 사라진다** —
   * 필터에 없으니 관리자는 그 상품들을 찾지 못하고, 아무 오류도 뜨지 않는다.
   * 그래서 상한을 우리가 정하고, 걸렸다는 사실을 화면이 알 수 있게 함께 내려보낸다.
   */
  const FACET_SCAN_MAX = 1000;
  const { data: facetRows } = await service
    .from("products")
    .select("supplier, brand")
    .range(0, FACET_SCAN_MAX - 1);
  const scanned = (facetRows ?? []) as { supplier: string | null; brand: string | null }[];
  const suppliers = new Set<string>();
  const brands = new Set<string>();
  for (const row of scanned) {
    if (row.supplier) suppliers.add(row.supplier);
    if (row.brand) brands.add(row.brand);
  }

  const total = count ?? 0;
  return NextResponse.json({
    products,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    facets: {
      suppliers: [...suppliers].sort((a, b) => a.localeCompare(b, "ko-KR")),
      brands: [...brands].sort((a, b) => a.localeCompare(b, "ko-KR")),
      truncated: scanned.length >= FACET_SCAN_MAX,
    },
  });
}

/**
 * POST /api/admin/products
 * body: { product: {...}, images?: [{url, alt?}], variants?: [{name, price_delta, stock, sku, is_active}] }
 * - 신규 재고(상품/옵션)는 inventory_logs에 'initial'로 기록
 * → 201 { product, warning? }
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service, user } = auth;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  let fields: Record<string, unknown>;
  let images: ReturnType<typeof parseImages>;
  let variants: ReturnType<typeof parseVariants>;
  try {
    fields = parseProductFields(body.product, { partial: false });
    assertSellablePrice(fields.status, fields.price);
    images = parseImages(body.images);
    variants = parseVariants(body.variants);
  } catch (e) {
    if (e instanceof InputError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  // slug/SKU 중복 사전 확인 (친절한 메시지)
  const { data: dupSlug } = await service
    .from("products")
    .select("id")
    .eq("slug", fields.slug as string)
    .maybeSingle();
  if (dupSlug) {
    return NextResponse.json(
      { error: "이미 다른 상품이 쓰고 있는 상품 주소입니다." },
      { status: 400 }
    );
  }
  if (fields.sku) {
    const { data: dupSku } = await service
      .from("products")
      .select("id")
      .eq("sku", fields.sku as string)
      .maybeSingle();
    if (dupSku) {
      return NextResponse.json(
        { error: "이미 다른 상품이 쓰고 있는 상품 코드입니다." },
        { status: 400 }
      );
    }
  }

  const { data: created, error: insertError } = await service
    .from("products")
    .insert(fields)
    .select("*")
    .single();

  if (insertError || !created) {
    if (insertError?.code === "23505") {
      return NextResponse.json(
        { error: "이미 쓰고 있는 상품 주소 또는 상품 코드입니다." },
        { status: 400 }
      );
    }
    console.error("[admin/products] 등록 실패:", insertError?.message);
    return NextResponse.json({ error: "상품 등록에 실패했습니다." }, { status: 500 });
  }

  const warnings: string[] = [];

  // ---------- 이미지 ----------
  if (images && images.length > 0) {
    const { error } = await service.from("product_images").insert(
      images.map((img, i) => ({
        product_id: created.id,
        url: img.url,
        alt: img.alt ?? (fields.name as string),
        sort_order: i,
        is_primary: i === 0,
      }))
    );
    if (error) warnings.push("이미지 저장에 실패했습니다. 편집 화면에서 다시 등록해 주세요.");
  }

  // ---------- 옵션 ----------
  let insertedVariants: { id: string; name: string; stock: number }[] = [];
  if (variants && variants.length > 0) {
    const { data, error } = await service
      .from("product_variants")
      .insert(
        variants.map((v, i) => ({
          product_id: created.id,
          name: v.name,
          price_delta: v.price_delta,
          stock: v.stock,
          sku: v.sku,
          is_active: v.is_active,
          sort_order: i,
        }))
      )
      .select("id, name, stock");
    if (error) warnings.push("옵션 저장에 실패했습니다. 편집 화면에서 다시 등록해 주세요.");
    insertedVariants = (data ?? []) as { id: string; name: string; stock: number }[];
  }

  // ---------- 최초 재고 로그 ----------
  const logs: Record<string, unknown>[] = [];
  const initialStock = (fields.stock as number | undefined) ?? 0;
  if (initialStock > 0) {
    logs.push({
      product_id: created.id,
      variant_id: null,
      delta: initialStock,
      reason: "initial",
      memo: "신규 상품 등록",
      created_by: user.id,
    });
  }
  for (const v of insertedVariants) {
    if (v.stock > 0) {
      logs.push({
        product_id: created.id,
        variant_id: v.id,
        delta: v.stock,
        reason: "initial",
        memo: `옵션 신규 등록 (${v.name})`,
        created_by: user.id,
      });
    }
  }
  if (logs.length > 0) {
    const { error } = await service.from("inventory_logs").insert(logs);
    if (error) warnings.push("최초 재고 이력 기록에 실패했습니다.");
  }

  // 상품 행이 실제로 insert 된 뒤이므로 카탈로그 캐시를 무효화한다.
  // (이미지/옵션/재고 로그는 실패해도 warning 으로만 남고 상품 자체는 이미 존재한다.)
  revalidateTag(CACHE_TAGS.products, { expire: 0 });

  return NextResponse.json(
    { product: created, ...(warnings.length ? { warning: warnings.join(" ") } : {}) },
    { status: 201 }
  );
}
