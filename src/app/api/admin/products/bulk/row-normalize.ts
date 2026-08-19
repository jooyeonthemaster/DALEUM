/* ============================================================
   일괄 등록 행 해석 — 화면이 보낸 한 줄을 상품 저장 모양으로 바꾼다

   route.ts 에서 떼어 냈다. 한 파일에 해석 규칙과 저장 흐름이 같이 있으면
   "세로로 긴 사진을 어떻게 처리하나" 를 확인하려고 insert 코드까지 읽어야 한다.
   해석 규칙은 순수 함수라 따로 두는 편이 검증하기 쉽다.
   ============================================================ */

import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanStr } from "@/lib/orders";
import { slugify } from "@/lib/format";
import { serializeDetailDoc, type DetailBlock } from "@/lib/detail-doc";
import {
  InputError,
  PRODUCT_STATUSES,
  STORAGE_TYPES,
  assertSellablePrice,
  parseImages,
  parseProductFields,
  parseVariants,
  type ParsedImage,
  type ParsedVariant,
} from "../shared";

export interface CategoryLookup {
  byId: Map<string, string>;
  bySlug: Map<string, string>;
  byName: Map<string, string>;
}

export interface SizedImage {
  url: string;
  width: number;
  height: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 상품 사진으로 두면 안 되는 세로 비율.
 * scripts/verify_catalog.mjs 가 사고로 판정하는 기준과 같은 값이다 —
 * 예전에 세로 18,000px 짜리 상세 통이미지가 갤러리에 들어가 상품 목록과
 * 확대 뷰가 전부 깨진 적이 있고, 등록 경로에는 검사가 한 줄도 없었다.
 */
const GALLERY_MAX_RATIO = 2.5;

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
  // 화면은 항목/값 두 칸짜리 행 편집기로 입력받아 객체로 보낸다.
  // 문자열 형태(`열량=15kcal|나트륨=10mg`)는 옛 양식 호환으로만 남긴다.
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

/** 치수를 달고 오는 새 형식 — 화면이 업로드 시 실제로 잰 값을 그대로 보낸다 */
function readSizedList(value: unknown): SizedImage[] {
  if (!Array.isArray(value)) return [];
  const out: SizedImage[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const url = typeof record.url === "string" ? record.url.trim() : "";
    if (!/^https?:\/\//.test(url)) continue;
    out.push({
      url,
      width: Number(record.width) || 0,
      height: Number(record.height) || 0,
    });
  }
  return out;
}

function urlsToSized(urls: string[]): SizedImage[] {
  return urls.map((url) => ({ url, width: 0, height: 0 }));
}

/**
 * 상세페이지 이미지 → description 마크다운.
 *
 * 반드시 lib/detail-doc 의 직렬화를 쓴다. 직접 문자열을 만들던 옛 코드는
 * `![이름 상세 이미지 1](url)` 처럼 **치수 표기를 빠뜨렸고**, 고객 화면은 치수가 없으면
 * 공칭값(1080×4000)으로 자리를 잡았다가 진짜 이미지가 뜨는 순간 레이아웃이 튀었다.
 */
function buildDetailMarkdown(images: SizedImage[], name: string): string {
  if (images.length === 0) return "";
  const blocks: DetailBlock[] = images.map((image, index) => ({
    id: `detail-${index}`,
    type: "image",
    url: image.url,
    alt: `${name} 상세 이미지 ${index + 1}`,
    width: image.width,
    height: image.height,
  }));
  return serializeDetailDoc(blocks);
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
    // 코드값을 그대로 되돌려 주지 않는다 — 관리자에게 아무 뜻이 없는 문자열이다
    if (!categories.byId.has(raw)) throw new InputError("고르신 카테고리를 찾을 수 없습니다. 다시 골라 주세요.");
    return raw;
  }
  const lowered = raw.toLowerCase();
  const bySlug = categories.bySlug.get(lowered);
  if (bySlug) return bySlug;
  const byName = categories.byName.get(raw);
  if (byName) return byName;
  throw new InputError(`'${raw}' 카테고리가 없습니다. 카테고리 관리에서 먼저 만들어 주세요.`);
}

export interface NormalizedRow {
  product: Record<string, unknown>;
  images: ParsedImage[];
  detailImages: SizedImage[];
  variants: ParsedVariant[];
  warnings: string[];
}

export function normalizeRow(row: Record<string, unknown>, categories: CategoryLookup): NormalizedRow {
  const warnings: string[] = [];
  const name = cleanStr(scalar(row, "name"), 200);
  if (!name) throw new InputError("상품명을 입력해 주세요.");

  const slug = cleanStr(scalar(row, "slug"), 200)?.toLowerCase() ?? slugify(name);

  // 사진 — 새 형식(치수 포함)을 먼저 보고, 없으면 옛 형식(URL 목록)을 받는다
  let gallery = readSizedList(row.primary_images);
  if (gallery.length === 0) {
    gallery = urlsToSized(
      splitList(
        row.primary_image_urls ??
          row.main_image_urls ??
          row.representative_image_urls ??
          row.images ??
          row.image_urls ??
          row.gallery_image_urls
      )
    );
  }
  let detail = readSizedList(row.detail_images);
  if (detail.length === 0) {
    detail = urlsToSized(splitList(row.detail_image_urls ?? row.detail_page_image_urls));
  }

  // 마지막 방어선 — 세로로 매우 긴 사진은 상품 사진 자리에서 빼 상세로 옮긴다.
  // 화면에서도 막지만, 서버에도 두는 이유는 예전에 이 사고가 실제로 났고
  // 되돌리려면 개발자가 스크립트를 돌려야 했기 때문이다.
  const tall = gallery.filter((image) => image.width > 0 && image.height / image.width > GALLERY_MAX_RATIO);
  if (tall.length > 0) {
    const tallUrls = new Set(tall.map((image) => image.url));
    gallery = gallery.filter((image) => !tallUrls.has(image.url));
    detail = [...detail, ...tall];
    warnings.push(
      `세로로 매우 긴 사진 ${tall.length}장을 상품 사진에서 상세페이지로 옮겼습니다. 상품 사진 자리에 두면 목록과 확대 화면이 깨집니다.`
    );
  }

  const detailMarkdown = buildDetailMarkdown(detail, name);
  const descriptionParts = [cleanStr(scalar(row, "description"), 20_000), detailMarkdown].filter(Boolean);

  const status = String(scalar(row, "status") ?? "draft") as (typeof PRODUCT_STATUSES)[number];
  if (!PRODUCT_STATUSES.includes(status)) {
    throw new InputError("상품 상태는 임시 저장·판매중·품절·숨김 중 하나여야 합니다.");
  }
  const storageType = String(scalar(row, "storage_type") ?? "room") as (typeof STORAGE_TYPES)[number];
  if (!STORAGE_TYPES.includes(storageType)) {
    throw new InputError("보관 방법은 실온·냉장·냉동 중 하나여야 합니다.");
  }

  const product = parseProductFields(
    {
      name,
      slug,
      subtitle: scalar(row, "subtitle") ?? null,
      category_id: resolveCategory(
        row.category ?? row.category_id ?? row.category_slug ?? row.category_name,
        categories
      ),
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

  // 판매가 0원짜리를 판매중으로 열면 결제가 불가능한 상품이 고객에게 노출된다
  assertSellablePrice(product.status, product.price);

  const images =
    parseImages(
      gallery.map((image, index) => ({
        url: image.url,
        alt: index === 0 ? name : `${name} ${index + 1}`,
      }))
    ) ?? [];

  return { product, images, detailImages: detail, variants: parseVariantList(row), warnings };
}

export async function getCategoryLookup(service: SupabaseClient): Promise<CategoryLookup> {
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
