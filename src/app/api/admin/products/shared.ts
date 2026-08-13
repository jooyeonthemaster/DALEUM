import { isUuid, cleanStr } from "@/lib/orders";

/* ============================================================
   관리자 상품 API 공용 — 입력 정제/검증
   route.ts(목록/생성)와 [id]/route.ts(조회/수정/삭제)가 공유한다.
   ============================================================ */

export const PRODUCT_STATUSES = ["draft", "active", "sold_out", "hidden"] as const;
export const STORAGE_TYPES = ["room", "chilled", "frozen"] as const;

/** 검증 실패 — 메시지는 그대로 사용자에게 노출 가능한 한국어 */
export class InputError extends Error {}

// 한글 slug 는 라우트에서 퍼센트 인코딩된 채 조회돼 상세페이지가 404 가 된다 — ASCII 만 허용한다.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function intField(
  v: unknown,
  label: string,
  { min = 0, max = 100_000_000 }: { min?: number; max?: number } = {}
): number {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isInteger(n)) {
    throw new InputError(`${label} 값이 올바르지 않습니다.`);
  }
  if (n < min || n > max) throw new InputError(`${label} 값이 허용 범위를 벗어났습니다.`);
  return n;
}

function nullableIntField(
  v: unknown,
  label: string,
  opts?: { min?: number; max?: number }
): number | null {
  if (v === null || v === undefined || v === "") return null;
  return intField(v, label, opts);
}

function strArray(v: unknown, label: string, maxItems: number, maxLen: number): string[] {
  if (v === null || v === undefined) return [];
  if (!Array.isArray(v)) throw new InputError(`${label} 형식이 올바르지 않습니다.`);
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== "string") continue;
    const t = item.trim().slice(0, maxLen);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= maxItems) break;
  }
  return out;
}

/** nutrition/specs 키-값 정제 — 키 40자, 값 200자, 최대 30개 */
function kvRecord(v: unknown, label: string): Record<string, string | number> {
  if (v === null || v === undefined) return {};
  if (typeof v !== "object" || Array.isArray(v)) {
    throw new InputError(`${label} 형식이 올바르지 않습니다.`);
  }
  const out: Record<string, string | number> = {};
  let n = 0;
  for (const [rawKey, rawVal] of Object.entries(v as Record<string, unknown>)) {
    const key = rawKey.trim().slice(0, 40);
    if (!key) continue;
    if (typeof rawVal === "number" && Number.isFinite(rawVal)) {
      out[key] = rawVal;
    } else if (typeof rawVal === "string") {
      const s = rawVal.trim().slice(0, 200);
      if (s) out[key] = s;
    }
    if (++n >= 30) break;
  }
  return out;
}

/**
 * 상품 본문 필드 정제.
 * @param partial true면 전달된 필드만 반환(PATCH), false면 필수값 검증(POST)
 * @throws InputError
 */
export function parseProductFields(
  raw: unknown,
  { partial }: { partial: boolean }
): Record<string, unknown> {
  if (!raw || typeof raw !== "object") {
    if (partial) return {};
    throw new InputError("상품 정보가 없습니다.");
  }
  const p = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(p, k);

  if (has("name") || !partial) {
    const name = cleanStr(p.name, 200);
    if (!name) throw new InputError("상품명을 입력해 주세요.");
    out.name = name;
  }
  if (has("slug") || !partial) {
    const slug = cleanStr(p.slug, 200)?.toLowerCase() ?? null;
    if (!slug || !SLUG_RE.test(slug)) {
      throw new InputError("URL 슬러그는 영문 소문자·숫자·한글·하이픈만 사용할 수 있습니다.");
    }
    out.slug = slug;
  }
  if (has("price") || !partial) out.price = intField(p.price, "판매가");
  if (has("subtitle")) out.subtitle = cleanStr(p.subtitle, 300);
  if (has("category_id")) {
    const cid = p.category_id;
    if (cid === null || cid === "" || cid === undefined) out.category_id = null;
    else if (isUuid(cid)) out.category_id = cid;
    else throw new InputError("카테고리 정보가 올바르지 않습니다.");
  }
  if (has("description")) out.description = cleanStr(p.description, 20_000);
  if (has("story")) out.story = cleanStr(p.story, 20_000);
  if (has("compare_at_price")) out.compare_at_price = nullableIntField(p.compare_at_price, "정가");
  if (has("cost_price")) out.cost_price = nullableIntField(p.cost_price, "원가");
  if (has("sku")) out.sku = cleanStr(p.sku, 100);
  // stock은 신규 등록에서만 사용 (수정은 재고 관리 화면 경유) — 호출부에서 분기
  if (has("stock")) out.stock = intField(p.stock, "재고", { max: 1_000_000 });
  if (has("low_stock_threshold")) {
    out.low_stock_threshold = intField(p.low_stock_threshold, "재고 임계치", { max: 1_000_000 });
  }
  if (has("status")) {
    if (!PRODUCT_STATUSES.includes(p.status as (typeof PRODUCT_STATUSES)[number])) {
      throw new InputError("상품 상태 값이 올바르지 않습니다.");
    }
    out.status = p.status;
  }
  if (has("storage_type")) {
    if (!STORAGE_TYPES.includes(p.storage_type as (typeof STORAGE_TYPES)[number])) {
      throw new InputError("보관 방법 값이 올바르지 않습니다.");
    }
    out.storage_type = p.storage_type;
  }
  if (has("origin")) out.origin = cleanStr(p.origin, 100);
  if (has("weight")) out.weight = cleanStr(p.weight, 100);
  if (has("units_per_pack")) {
    out.units_per_pack = intField(p.units_per_pack, "구성 수량", { min: 1, max: 1000 });
  }
  if (has("badges")) out.badges = strArray(p.badges, "뱃지", 10, 20);
  if (has("tags")) out.tags = strArray(p.tags, "태그", 20, 30);
  if (has("nutrition")) out.nutrition = kvRecord(p.nutrition, "영양 정보");
  if (has("specs")) out.specs = kvRecord(p.specs, "스펙 정보");
  if (has("is_featured")) out.is_featured = Boolean(p.is_featured);
  if (has("sort_order")) out.sort_order = intField(p.sort_order, "노출 순서", { min: -100_000 });

  return out;
}

export interface ParsedImage {
  url: string;
  alt: string | null;
}

/** 이미지 배열 정제 — http(s) URL만, 최대 20장 */
export function parseImages(raw: unknown): ParsedImage[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) throw new InputError("이미지 형식이 올바르지 않습니다.");
  const out: ParsedImage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const url = cleanStr((item as Record<string, unknown>).url, 1000);
    if (!url || !/^https?:\/\//.test(url)) continue;
    out.push({ url, alt: cleanStr((item as Record<string, unknown>).alt, 200) });
    if (out.length >= 20) break;
  }
  return out;
}

export interface ParsedVariant {
  id: string | null;
  name: string;
  price_delta: number;
  stock: number;
  sku: string | null;
  is_active: boolean;
}

/** 옵션 배열 정제 — 최대 20개 */
export function parseVariants(raw: unknown): ParsedVariant[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) throw new InputError("옵션 형식이 올바르지 않습니다.");
  if (raw.length > 20) throw new InputError("옵션은 최대 20개까지 등록할 수 있습니다.");
  const out: ParsedVariant[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const v = item as Record<string, unknown>;
    const name = cleanStr(v.name, 100);
    if (!name) throw new InputError("옵션명을 입력해 주세요.");
    out.push({
      id: isUuid(v.id) ? v.id : null,
      name,
      price_delta: intField(v.price_delta ?? 0, "옵션 가격 차액", { min: -100_000_000 }),
      stock: intField(v.stock ?? 0, "옵션 재고", { max: 1_000_000 }),
      sku: cleanStr(v.sku, 100),
      is_active: v.is_active === undefined ? true : Boolean(v.is_active),
    });
  }
  return out;
}
