import { isUuid, cleanStr } from "@/lib/orders";
import { docToLegacyMarkdown, parseDetailDocJson } from "@/lib/detail-doc-v2";

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

/**
 * 뱃지·태그 같은 문자열 목록 정제.
 *
 * 옛 코드는 `slice(0, maxLen)` 으로 긴 항목을 말없이 자르고, 개수가 넘치면 나머지를
 * 조용히 버렸다. 영양·스펙에서 같은 방식이 실제로 법정 표시사항을 잘라 먹은 적이 있어
 * (아래 KV_VALUE_MAX 주석 참고) 여기도 같은 원칙으로 바꾼다 — **자르지 말고 거절한다.**
 * 관리자가 뭘 잃었는지 모르는 것보다 저장이 한 번 막히는 편이 낫다.
 */
function strArray(v: unknown, label: string, maxItems: number, maxLen: number): string[] {
  if (v === null || v === undefined) return [];
  if (!Array.isArray(v)) throw new InputError(`${label} 형식이 올바르지 않습니다.`);
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== "string") continue;
    const t = item.trim();
    if (!t) continue;
    if (t.length > maxLen) {
      throw new InputError(
        `${label} '${t.slice(0, 12)}…' 이(가) 너무 깁니다. ${maxLen}자 이내로 줄여 주세요.`
      );
    }
    if (!out.includes(t)) out.push(t);
    if (out.length > maxItems) {
      throw new InputError(`${label}은(는) 최대 ${maxItems}개까지 넣을 수 있습니다.`);
    }
  }
  return out;
}

/* ------------------------------------------------------------
   영양·스펙 키-값의 한도.

   옛 한도(값 200자)는 실제 데이터를 담지 못했다. 운영 중인 27개 상품 가운데
   9개 값이 200자를 넘고(최장 386자 — 냉면인데곤약의 원재료명), 옛 코드는 그것을
   `slice(0, 200)` 으로 **말없이 잘라** 저장했다. 관리자가 그 상품을 열어 아무것도
   바꾸지 않고 저장만 눌러도 원재료명·인증번호 뒤쪽이 영구히 사라졌다는 뜻이다.
   식품 표시사항은 법정 정보라 소리 없는 절단이 가장 나쁜 실패다.

   그래서 한도를 실데이터가 들어갈 만큼 올리고, 그래도 넘치면 **자르지 말고 거절**한다.
   ------------------------------------------------------------ */
/** 상세페이지 문서 JSON 한 건의 상한(byte). 사진 100장 + 긴 본문도 넉넉히 들어간다. */
const DOC_MAX_BYTES = 400 * 1024;

const KV_KEY_MAX = 60;
const KV_VALUE_MAX = 2_000;
const KV_MAX_ITEMS = 60;

/** nutrition/specs 키-값 정제 — 한도를 넘으면 자르지 않고 InputError 로 알린다 */
function kvRecord(v: unknown, label: string): Record<string, string | number> {
  if (v === null || v === undefined) return {};
  if (typeof v !== "object" || Array.isArray(v)) {
    throw new InputError(`${label} 형식이 올바르지 않습니다.`);
  }
  const out: Record<string, string | number> = {};
  let n = 0;
  for (const [rawKey, rawVal] of Object.entries(v as Record<string, unknown>)) {
    const key = rawKey.trim().slice(0, KV_KEY_MAX);
    if (!key) continue;
    if (typeof rawVal === "number" && Number.isFinite(rawVal)) {
      out[key] = rawVal;
    } else if (typeof rawVal === "string") {
      const trimmed = rawVal.trim();
      if (trimmed.length > KV_VALUE_MAX) {
        // 조용히 자르면 법정 표시사항이 소리 없이 사라진다 — 저장을 막고 어디가 문제인지 알린다.
        throw new InputError(
          `${label}의 '${key}' 항목이 너무 깁니다. ${KV_VALUE_MAX.toLocaleString(
            "ko-KR"
          )}자 이내로 줄여 주세요. (현재 ${trimmed.length.toLocaleString("ko-KR")}자)`
        );
      }
      if (trimmed) out[key] = trimmed;
    }
    if (++n > KV_MAX_ITEMS) {
      throw new InputError(
        `${label} 항목은 최대 ${KV_MAX_ITEMS}개까지 넣을 수 있습니다. 일부를 지우고 다시 저장해 주세요.`
      );
    }
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
      // 옛 문구는 "한글도 된다"고 안내했지만 SLUG_RE 는 ASCII 만 받는다 —
      // 한글 주소는 라우트에서 퍼센트 인코딩된 채 조회돼 상세페이지가 404 가 되기 때문이다.
      // 안내와 검증이 어긋나 있어 관리자가 원인을 알 수 없는 거절을 당했다.
      throw new InputError(
        "상품 주소에는 영문 소문자·숫자·하이픈(-)만 쓸 수 있습니다. 한글은 사용할 수 없습니다."
      );
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

  /* 상세페이지 문서 v2 — 진실은 이쪽이고, description 은 여기서 파생한 미러다.
     미러를 함께 쓰는 이유: 메타데이터(160자 발췌)·b2b 페이지·상품 건강도·
     verify_catalog·일괄등록 시트가 전부 description 을 읽는다. 미러가 있으면
     그 어느 것도 손대지 않아도 된다. 미러를 나중에 따로 계산하게 두면 반드시 어긋나므로
     문서를 받는 바로 이 자리에서 같이 만든다. */
  if (has("description_doc")) {
    if (p.description_doc === null) {
      out.description_doc = null;
    } else {
      const raw = JSON.stringify(p.description_doc);
      if (raw.length > DOC_MAX_BYTES) {
        throw new InputError(
          `상세페이지 내용이 너무 깁니다. 사진이나 글을 조금 줄여 주세요. (${Math.round(
            raw.length / 1024
          ).toLocaleString("ko-KR")}KB / 최대 ${DOC_MAX_BYTES / 1024}KB)`
        );
      }
      const doc = parseDetailDocJson(p.description_doc);
      if (!doc) throw new InputError("상세페이지 내용을 읽을 수 없습니다. 다시 저장해 주세요.");
      out.description_doc = doc;
      // 미러는 문서에서 만든다 — 클라이언트가 보낸 description 이 있어도 덮어쓴다.
      out.description = docToLegacyMarkdown(doc).slice(0, 20_000) || null;
    }
  }
  if (has("story")) out.story = cleanStr(p.story, 20_000);
  // 0003 마이그레이션으로 들어온 컬럼인데 폼과 API 어디에도 없어서, 관리자 화면만으로는
  // 영원히 채울 수 없었다. brand 는 고객 화면 표기용, supplier 는 관리자 식별용이다.
  if (has("brand")) out.brand = cleanStr(p.brand, 100);
  if (has("supplier")) out.supplier = cleanStr(p.supplier, 100);
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

/**
 * 판매가 0원인 상품이 스토어에 노출되는 것을 막는다.
 *
 * 목록 화면의 상태 드롭다운은 확인 절차 없이 곧바로 상태를 바꾼다. 그런데 대용량·업소용
 * 상품 7종은 가격 협의 대상이라 판매가가 0원인 채로 임시저장돼 있다 —
 * 드롭다운을 한 번 잘못 누르면 0원짜리 주문을 받게 된다.
 * 그래서 "노출" 판정을 값이 바뀌는 지점(API)에서 막는다.
 */
export function assertSellablePrice(status: unknown, price: unknown): void {
  if (status !== "active") return;
  if (typeof price === "number" && price > 0) return;
  throw new InputError(
    "판매가가 0원인 상품은 판매중으로 바꿀 수 없습니다. 판매가를 먼저 입력해 주세요."
  );
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
  /**
   * 폼을 열었을 때 화면이 보고 있던 재고. 저장 시 DB 의 현재 값과 비교하는 데 쓴다.
   *
   * 이게 없으면 재고가 되살아난다: 편집 화면을 연 뒤 주문이 들어와 재고가 줄면,
   * 저장할 때 `delta = 화면값 - 현재값` 이 양수가 되어 팔린 수량이 그대로 복구된다
   * (전형적인 lost update — 그대로 초과판매로 이어진다).
   * 폼은 옵션 탭을 건드리지 않아도 항상 옵션 전체를 보내므로, 저장 버튼만 눌러도 일어났다.
   */
  expected_stock: number | null;
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
      expected_stock: nullableIntField(v.expected_stock, "옵션 재고", { max: 1_000_000 }),
      sku: cleanStr(v.sku, 100),
      is_active: v.is_active === undefined ? true : Boolean(v.is_active),
    });
  }
  return out;
}
