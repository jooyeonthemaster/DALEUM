import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth";
import { CACHE_TAGS } from "@/lib/cache";
import { cleanStr } from "@/lib/orders";
import { slugify } from "@/lib/format";
import {
  InputError,
  PRODUCT_STATUSES,
  STORAGE_TYPES,
  parseImages,
  parseProductFields,
  parseVariants,
  type ParsedImage,
  type ParsedVariant,
} from "../shared";

type BulkMode = "validate" | "create";

interface CategoryLookup {
  byId: Map<string, string>;
  bySlug: Map<string, string>;
  byName: Map<string, string>;
}

interface BulkResult {
  row_no: number;
  name: string | null;
  slug: string | null;
  ok: boolean;
  product_id?: string;
  warnings: string[];
  errors: string[];
}

interface PreparedProduct {
  rowNo: number;
  product: Record<string, unknown>;
  images: ParsedImage[];
  variants: ParsedVariant[];
}

const MAX_ROWS = 200;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function scalar(raw: Record<string, unknown>, key: string): unknown {
  const value = raw[key];
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }
  return value ?? undefined;
}

function splitList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : String(item ?? "").trim()))
      .filter(Boolean);
  }
  if (typeof value !== "string") return [];
  return value
    .split(/[|,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "y", "active", "on", "노출", "추천"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "inactive", "off", "숨김", "미추천"].includes(normalized)) return false;
  return fallback;
}

function parseKeyValues(value: unknown): Record<string, string | number> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, string | number>;
  }
  if (typeof value !== "string") return {};

  const out: Record<string, string | number> = {};
  for (const pair of value.split(/[|\n]/)) {
    const [rawKey, ...rest] = pair.split(/[:=]/);
    const key = rawKey?.trim();
    const rawValue = rest.join(":").trim();
    if (!key || !rawValue) continue;
    const numeric = Number(rawValue);
    out[key] = Number.isFinite(numeric) && /^-?\d+(\.\d+)?$/.test(rawValue) ? numeric : rawValue;
  }
  return out;
}

function parseImageList(raw: Record<string, unknown>, name: string): ParsedImage[] {
  const explicit = raw.images ?? raw.image_urls ?? raw.gallery_image_urls;
  const primary = splitList(raw.primary_image_urls ?? raw.main_image_urls ?? raw.representative_image_urls);
  const gallery = splitList(explicit);
  const merged = [...primary, ...gallery].filter((url, index, arr) => arr.indexOf(url) === index);
  const images = parseImages(
    merged.map((url, index) => ({
      url,
      alt: index === 0 ? name : `${name} ${index + 1}`,
    }))
  );
  return images ?? [];
}

function detailImagesMarkdown(raw: Record<string, unknown>, name: string): string {
  const detailUrls = splitList(raw.detail_image_urls ?? raw.detail_page_image_urls);
  if (detailUrls.length === 0) return "";
  return detailUrls
    .map((url, index) => `![${name} 상세 이미지 ${index + 1}](${url})`)
    .join("\n\n");
}

function parseVariantList(raw: Record<string, unknown>): ParsedVariant[] {
  const value = raw.variants ?? raw.options;
  if (!value) return [];
  if (Array.isArray(value)) {
    const parsed = parseVariants(value);
    return parsed ?? [];
  }
  if (typeof value !== "string") return [];

  const rows = value
    .split(/[|\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [name, priceDelta = "0", stock = "0", sku = "", active = "true"] = item
        .split(":")
        .map((part) => part.trim());
      return {
        name,
        price_delta: Number(priceDelta || 0),
        stock: Number(stock || 0),
        sku: sku || null,
        is_active: parseBool(active, true),
      };
    });
  const parsed = parseVariants(rows);
  return parsed ?? [];
}

function resolveCategory(value: unknown, categories: CategoryLookup): string | null {
  if (value == null || value === "") return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (UUID_RE.test(raw)) {
    if (!categories.byId.has(raw)) throw new InputError(`존재하지 않는 카테고리 ID입니다: ${raw}`);
    return raw;
  }
  const lowered = raw.toLowerCase();
  const bySlug = categories.bySlug.get(lowered);
  if (bySlug) return bySlug;
  const byName = categories.byName.get(raw);
  if (byName) return byName;
  throw new InputError(`카테고리를 찾을 수 없습니다: ${raw}`);
}

function normalizeRow(row: Record<string, unknown>, categories: CategoryLookup): PreparedProduct {
  const rowNoRaw = Number(row.row_no ?? row.rowNo ?? 0);
  const rowNo = Number.isInteger(rowNoRaw) && rowNoRaw > 0 ? rowNoRaw : 0;
  const name = cleanStr(scalar(row, "name"), 200);
  if (!name) throw new InputError("상품명을 입력해 주세요.");

  const slug = cleanStr(scalar(row, "slug"), 200)?.toLowerCase() ?? slugify(name);
  const detailMarkdown = detailImagesMarkdown(row, name);
  const descriptionParts = [cleanStr(scalar(row, "description"), 20_000), detailMarkdown].filter(Boolean);

  const status = String(scalar(row, "status") ?? "draft") as (typeof PRODUCT_STATUSES)[number];
  if (!PRODUCT_STATUSES.includes(status)) {
    throw new InputError("상품 상태는 draft, active, sold_out, hidden 중 하나여야 합니다.");
  }
  const storageType = String(scalar(row, "storage_type") ?? "room") as (typeof STORAGE_TYPES)[number];
  if (!STORAGE_TYPES.includes(storageType)) {
    throw new InputError("보관 방법은 room, chilled, frozen 중 하나여야 합니다.");
  }

  const product = parseProductFields(
    {
      name,
      slug,
      subtitle: scalar(row, "subtitle") ?? null,
      category_id: resolveCategory(row.category ?? row.category_id ?? row.category_slug ?? row.category_name, categories),
      description: descriptionParts.join("\n\n") || null,
      story: scalar(row, "story") ?? null,
      price: row.price,
      compare_at_price: scalar(row, "compare_at_price") ?? null,
      cost_price: scalar(row, "cost_price") ?? null,
      sku: scalar(row, "sku") ?? null,
      stock: row.stock ?? 0,
      low_stock_threshold: row.low_stock_threshold ?? 10,
      status,
      storage_type: storageType,
      origin: scalar(row, "origin") ?? null,
      weight: scalar(row, "weight") ?? null,
      units_per_pack: row.units_per_pack ?? 1,
      badges: splitList(row.badges),
      tags: splitList(row.tags),
      nutrition: parseKeyValues(row.nutrition),
      specs: parseKeyValues(row.specs),
      is_featured: parseBool(row.is_featured, false),
      sort_order: row.sort_order ?? 0,
    },
    { partial: false }
  );

  return {
    rowNo,
    product,
    images: parseImageList(row, name),
    variants: parseVariantList(row),
  };
}

async function getCategoryLookup(service: SupabaseClient): Promise<CategoryLookup> {
  const { data, error } = await service.from("categories").select("id, slug, name");
  if (error) throw new Error(`카테고리 조회 실패: ${error.message}`);

  const byId = new Map<string, string>();
  const bySlug = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const category of (data ?? []) as { id: string; slug: string; name: string }[]) {
    byId.set(category.id, category.id);
    bySlug.set(category.slug.toLowerCase(), category.id);
    byName.set(category.name, category.id);
  }
  return { byId, bySlug, byName };
}

async function validateUnique(
  service: SupabaseClient,
  prepared: PreparedProduct[],
  results: BulkResult[]
) {
  const slugMap = new Map<string, number[]>();
  const skuMap = new Map<string, number[]>();

  for (const item of prepared) {
    const slug = String(item.product.slug);
    slugMap.set(slug, [...(slugMap.get(slug) ?? []), item.rowNo]);
    const sku = item.product.sku;
    if (typeof sku === "string" && sku.trim()) {
      skuMap.set(sku, [...(skuMap.get(sku) ?? []), item.rowNo]);
    }
  }

  const addError = (rowNo: number, message: string) => {
    const result = results.find((r) => r.row_no === rowNo);
    if (result) {
      result.ok = false;
      result.errors.push(message);
    }
  };

  for (const [slug, rows] of slugMap) {
    if (rows.length > 1) rows.forEach((row) => addError(row, `양식 안에서 URL 슬러그가 중복됩니다: ${slug}`));
  }
  for (const [sku, rows] of skuMap) {
    if (rows.length > 1) rows.forEach((row) => addError(row, `양식 안에서 SKU가 중복됩니다: ${sku}`));
  }

  const slugs = [...slugMap.keys()];
  if (slugs.length > 0) {
    const { data } = await service.from("products").select("slug").in("slug", slugs);
    const existing = new Set(((data ?? []) as { slug: string }[]).map((row) => row.slug));
    for (const slug of existing) {
      for (const rowNo of slugMap.get(slug) ?? []) addError(rowNo, `이미 등록된 URL 슬러그입니다: ${slug}`);
    }
  }

  const skus = [...skuMap.keys()];
  if (skus.length > 0) {
    const { data } = await service.from("products").select("sku").in("sku", skus);
    const existing = new Set(((data ?? []) as { sku: string | null }[]).map((row) => row.sku).filter(Boolean));
    for (const sku of existing) {
      for (const rowNo of skuMap.get(sku as string) ?? []) addError(rowNo, `이미 등록된 SKU입니다: ${sku}`);
    }
  }
}

async function createOne(
  service: SupabaseClient,
  userId: string,
  item: PreparedProduct,
  result: BulkResult
) {
  const { data: created, error: insertError } = await service
    .from("products")
    .insert(item.product)
    .select("id")
    .single();

  if (insertError || !created) {
    result.ok = false;
    result.errors.push(insertError?.code === "23505" ? "이미 사용 중인 슬러그 또는 SKU입니다." : "상품 등록에 실패했습니다.");
    return;
  }

  result.product_id = created.id as string;

  if (item.images.length > 0) {
    const { error } = await service.from("product_images").insert(
      item.images.map((img, index) => ({
        product_id: created.id,
        url: img.url,
        alt: img.alt ?? item.product.name,
        sort_order: index,
        is_primary: index === 0,
      }))
    );
    if (error) result.warnings.push("이미지 저장에 실패했습니다.");
  } else {
    result.warnings.push("이미지가 없습니다. PG 심사 전 대표 이미지를 추가해 주세요.");
  }

  let insertedVariants: { id: string; name: string; stock: number }[] = [];
  if (item.variants.length > 0) {
    const { data, error } = await service
      .from("product_variants")
      .insert(
        item.variants.map((variant, index) => ({
          product_id: created.id,
          name: variant.name,
          price_delta: variant.price_delta,
          stock: variant.stock,
          sku: variant.sku,
          is_active: variant.is_active,
          sort_order: index,
        }))
      )
      .select("id, name, stock");
    if (error) result.warnings.push("옵션 저장에 실패했습니다.");
    insertedVariants = (data ?? []) as { id: string; name: string; stock: number }[];
  }

  const logs: Record<string, unknown>[] = [];
  const stock = Number(item.product.stock ?? 0);
  if (stock > 0) {
    logs.push({
      product_id: created.id,
      variant_id: null,
      delta: stock,
      reason: "initial",
      memo: "일괄 상품 등록",
      created_by: userId,
    });
  }
  for (const variant of insertedVariants) {
    if (variant.stock > 0) {
      logs.push({
        product_id: created.id,
        variant_id: variant.id,
        delta: variant.stock,
        reason: "initial",
        memo: `일괄 옵션 등록 (${variant.name})`,
        created_by: userId,
      });
    }
  }
  if (logs.length > 0) {
    const { error } = await service.from("inventory_logs").insert(logs);
    if (error) result.warnings.push("초기 재고 이력 기록에 실패했습니다.");
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service, user } = auth;

  const body = (await req.json().catch(() => null)) as
    | { mode?: BulkMode; products?: Record<string, unknown>[] }
    | null;
  const mode = body?.mode === "create" ? "create" : "validate";
  const rows = body?.products;
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "등록할 상품 행이 없습니다." }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `한 번에 최대 ${MAX_ROWS}개 상품까지 처리할 수 있습니다.` }, { status: 400 });
  }

  let categories: CategoryLookup;
  try {
    categories = await getCategoryLookup(service);
  } catch (e) {
    console.error("[admin/products/bulk] category lookup failed:", e);
    return NextResponse.json({ error: "카테고리 정보를 불러오지 못했습니다." }, { status: 500 });
  }

  const prepared: PreparedProduct[] = [];
  const results: BulkResult[] = [];

  rows.forEach((row, index) => {
    const rowNo = Number(row.row_no ?? row.rowNo ?? index + 2);
    try {
      const item = normalizeRow({ ...row, row_no: rowNo }, categories);
      const result: BulkResult = {
        row_no: item.rowNo || rowNo,
        name: String(item.product.name ?? ""),
        slug: String(item.product.slug ?? ""),
        ok: true,
        warnings: [],
        errors: [],
      };
      if (item.images.length === 0) result.warnings.push("대표 이미지가 없습니다.");
      prepared.push(item);
      results.push(result);
    } catch (e) {
      results.push({
        row_no: rowNo,
        name: typeof row.name === "string" ? row.name : null,
        slug: typeof row.slug === "string" ? row.slug : null,
        ok: false,
        warnings: [],
        errors: [e instanceof InputError || e instanceof Error ? e.message : "행을 해석하지 못했습니다."],
      });
    }
  });

  await validateUnique(service, prepared, results);

  if (mode === "create") {
    for (const item of prepared) {
      const result = results.find((r) => r.row_no === item.rowNo);
      if (!result || !result.ok) continue;
      await createOne(service, user.id, item, result);
    }

    // 실제로 insert 된 행이 하나라도 있을 때만 무효화한다.
    // mode==="validate" 는 SELECT 뿐이고, create 여도 전 행이 검증에서 걸리면 쓰기가 없다.
    // product_id 는 createOne 이 상품 insert 에 성공했을 때만 채운다.
    if (results.some((r) => r.product_id)) {
      revalidateTag(CACHE_TAGS.products, { expire: 0 });
    }
  }

  const okCount = results.filter((row) => row.ok).length;
  const failedCount = results.length - okCount;
  return NextResponse.json({
    mode,
    okCount,
    failedCount,
    results,
  });
}
