import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { CACHE_TAGS } from "@/lib/cache";
import { isUuid } from "@/lib/orders";
import {
  InputError,
  PRODUCT_STATUSES,
  parseImages,
  parseProductFields,
  parseVariants,
} from "./shared";

/* ============================================================
   GET  /api/admin/products — 목록 (검색/필터/페이지네이션)
   POST /api/admin/products — 신규 등록 (이미지/옵션/최초 재고 로그 포함)
   ============================================================ */

const PRODUCT_SELECT =
  "*, product_images(id, url, alt, sort_order, is_primary), categories(id, slug, name), product_variants(id, name, price_delta, stock, sku, is_active, sort_order)";

/**
 * GET /api/admin/products
 * ?q=검색어(이름/SKU) &category=uuid &status=draft|active|sold_out|hidden
 * &page=1 &limit=20
 * → { products, total, page, totalPages }
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

  let query = service.from("products").select(PRODUCT_SELECT, { count: "exact" });

  if (q) {
    // or 필터 구문을 깨뜨리는 문자 제거
    const safe = q.replace(/[,()]/g, " ").trim();
    if (safe) query = query.or(`name.ilike.%${safe}%,sku.ilike.%${safe}%`);
  }
  if (category && isUuid(category)) query = query.eq("category_id", category);
  if (status && PRODUCT_STATUSES.includes(status as (typeof PRODUCT_STATUSES)[number])) {
    query = query.eq("status", status);
  }

  const from = (page - 1) * limit;
  const { data, count, error } = await query
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .range(from, from + limit - 1);

  if (error) {
    console.error("[admin/products] 목록 조회 실패:", error.message);
    return NextResponse.json({ error: "상품 목록을 불러오지 못했습니다." }, { status: 500 });
  }

  const total = count ?? 0;
  return NextResponse.json({
    products: data ?? [],
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
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
    return NextResponse.json({ error: "이미 사용 중인 URL 슬러그입니다." }, { status: 400 });
  }
  if (fields.sku) {
    const { data: dupSku } = await service
      .from("products")
      .select("id")
      .eq("sku", fields.sku as string)
      .maybeSingle();
    if (dupSku) {
      return NextResponse.json({ error: "이미 사용 중인 SKU입니다." }, { status: 400 });
    }
  }

  const { data: created, error: insertError } = await service
    .from("products")
    .insert(fields)
    .select("*")
    .single();

  if (insertError || !created) {
    if (insertError?.code === "23505") {
      return NextResponse.json({ error: "이미 사용 중인 슬러그 또는 SKU입니다." }, { status: 400 });
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
