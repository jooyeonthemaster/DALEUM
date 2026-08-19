/* ============================================================
   일괄 등록 초안 모델 — 화면 · 엑셀 해석 · 폴더 배정이 공유하는 자료형

   왜 파일을 나눴는가:
   전에는 이 화면 전체가 한 파일(788줄)이었다. 엑셀 해석·폴더 순회·카드 렌더가
   한 덩어리라 "엑셀 헤더 규칙"을 고치려면 렌더 코드를 함께 읽어야 했고,
   그 결합이 곧 BULK-01(헤더 못 찾음)·BULK-05(결과 배지 밀림) 같은 결함으로 남았다.
   자료형과 순수 함수를 먼저 떼어 내면 각 규칙을 따로 검증할 수 있다.

   ── 화면에 코드값을 보이지 않는다 ──
   draft/active, room/chilled/frozen 같은 저장용 코드값은 이 파일 안에서만 쓰고,
   화면에는 반드시 아래 LABELS 를 거쳐 한국어로 내보낸다.
   ============================================================ */

import { PRODUCT_STATUS_LABELS, STORAGE_TYPE_LABELS, STORAGE_TYPE_ORDER } from "@/lib/admin-labels";
import type { StorageType } from "@/lib/types";
import type { KvRow } from "../form-types";

/** 한 번에 카드로 둘 수 있는 상품 수 — 화면에 항상 드러내야 한다(BULK-08) */
export const MAX_PRODUCTS = 50;

/**
 * 엑셀에서 한 번에 읽어 들이는 최대 데이터 행 수.
 * 서버 route.ts 의 MAX_ROWS 와 같은 값이어야 한다 — 예전에는 클라 50 / 서버 200 으로
 * 어긋나 있어서, 화면이 "70개 불러왔습니다" 라고 하고 실제로는 50개만 등록됐다.
 */
export const MAX_SHEET_ROWS = 200;

/** 한 상품에 붙일 수 있는 옵션 수 — 서버 parseVariants 의 상한과 같다 */
export const MAX_VARIANTS = 20;

export interface DraftImage {
  url: string;
  width: number;
  height: number;
  /** 원본 파일명 — 업로드 경로는 UUID 라, 이걸 잃으면 어느 사진인지 알 길이 없다 */
  name: string;
}

export interface VariantDraft {
  id: string;
  name: string;
  /** 대표 가격 대비 차액. 문자열로 두는 이유는 입력 중 "-" 한 글자 상태를 허용하기 위해서다 */
  priceDelta: string;
  stock: string;
  sku: string;
}

export type DraftStatus = "draft" | "active";

export interface ProductDraft {
  id: string;
  name: string;
  /** 고객이 보는 주소. 화면에서는 "상품 주소" 라고만 부른다 */
  slug: string;
  /**
   * 사람이 주소를 직접 손봤는가.
   * true 면 상품명을 바꿔도 제안값으로 덮어쓰지 않는다 — 공들여 정한 주소가
   * 오타 수정 한 번에 날아가면 안 되기 때문이다.
   */
  slugTouched: boolean;
  category: string;
  price: string;
  comparePrice: string;
  costPrice: string;
  stock: string;
  storage: StorageType;
  origin: string;
  weight: string;
  unitsPerPack: string;
  subtitle: string;
  sku: string;
  description: string;
  badges: string[];
  tags: string[];
  nutrition: KvRow[];
  specs: KvRow[];
  variants: VariantDraft[];
  galleryImages: DraftImage[];
  detailImages: DraftImage[];
  status: DraftStatus;
  /** 카드 접힘 — 27행을 불러오면 펼친 채로는 1만 3천 px 짜리 폼이 된다 */
  collapsed: boolean;
  /** 카드 안쪽 '추가 정보' 펼침 */
  showMore: boolean;
  /**
   * 등록에 성공해 실제 상품이 된 경우의 상품 id.
   * 이 값이 있으면 카드를 잠그고 재전송 대상에서 뺀다 — 30개 중 22개가 들어간 뒤
   * 8개를 고치려다 22개를 중복 등록하던 사고(BULK-07)를 막는다.
   */
  registeredId: string | null;
  /** 엑셀·폴더 해석 중 생긴 한국어 안내 (보관 방법 추정 실패 등) */
  notes: string[];
}

/** 서버가 행마다 돌려주는 결과 */
export interface BulkResult {
  /** 초안 고유 id. 배열 순번이 아니라 이 값으로 카드를 찾는다(BULK-05) */
  client_id: string | null;
  row_no: number;
  name: string | null;
  ok: boolean;
  /** 이미 같은 주소로 등록돼 있어 건너뛴 행 — 재시도를 안전하게 만든다 */
  skipped?: boolean;
  product_id?: string;
  warnings: string[];
  errors: string[];
}

export interface BulkResponse {
  /** 이번에 실제로 등록되는(된) 수 — 이미 있어 건너뛴 행은 빠져 있다 */
  okCount: number;
  /** 이미 같은 주소로 등록돼 있어 건너뛴 수 */
  skippedCount?: number;
  failedCount: number;
  results: BulkResult[];
  error?: string;
}

/** 한 곳에서 걸린 입력 문제 — 요약 목록과 칸 밑 문구가 같은 자료를 본다 */
export interface DraftIssue {
  draftId: string;
  field: "name" | "slug" | "price" | "stock" | "gallery" | "variants";
  message: string;
}

/**
 * 보관 방법 고르기 — 라벨을 여기서 짓지 않는다.
 *
 * 이 화면만 room 을 "상온" 이라 불렀고, 상품 폼과 고객 화면은 "실온"(lib/constants.ts)이었다.
 * 같은 값이 화면마다 다른 이름으로 불리면 대표가 두 개를 다른 것으로 읽는다.
 * 더 나쁜 것은 '빈 양식 받기' 로 내려가는 엑셀의 예시값과 '적는 방법' 시트에까지
 * 그 말이 박혀 나갔다는 점이다 — 사람은 그 양식을 그대로 베껴 쓴다.
 * 그래서 용어는 admin-labels 한 곳에서만 가져온다.
 */
export const STORAGE_OPTIONS = STORAGE_TYPE_ORDER.map(
  (code) => [code, STORAGE_TYPE_LABELS[code]] as [StorageType, string]
);

/** 상태 이름은 용어 규범에서 가져온다 — 화면마다 다시 지으면 같은 상태가 두 이름이 된다 */
export const DRAFT_STATUS_LABELS: Record<DraftStatus, string> = {
  draft: PRODUCT_STATUS_LABELS.draft,
  active: PRODUCT_STATUS_LABELS.active,
};

/**
 * 화면 안에서만 쓰는 임시 식별자 — React key 와 데이터 짝짓기에만 쓴다.
 *
 * ⚠ 이 값을 **화면에 그려 내보내지 마라**(DOM id·data 속성 등).
 * 서버가 그린 HTML 과 브라우저가 처음 그린 HTML 의 값이 달라져 하이드레이션이 어긋난다.
 * 실제로 카드의 `id="card-…"` 가 그렇게 어긋났고, 카운터로 첫 호출만 고정하는 우회는
 * 더 나빴다 — 모듈 전역 카운터는 서버에서 요청 사이에 이어져, 프리페치로 한 번 더 렌더되면
 * 두 번째부터 다시 어긋난다. 카드로 이동하는 일은 DOM id 대신 ref 로 처리한다(DraftCard).
 * React key 는 HTML 로 나가지 않으므로 이 값을 그대로 써도 안전하다.
 */
export function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function emptyVariant(): VariantDraft {
  return { id: makeId(), name: "", priceDelta: "0", stock: "0", sku: "" };
}

export function emptyDraft(): ProductDraft {
  return {
    id: makeId(),
    name: "",
    slug: "",
    slugTouched: false,
    category: "",
    price: "",
    comparePrice: "",
    costPrice: "",
    stock: "0",
    storage: "room",
    origin: "국내산",
    weight: "",
    unitsPerPack: "1",
    subtitle: "",
    sku: "",
    description: "",
    badges: [],
    tags: [],
    nutrition: [],
    specs: [],
    variants: [],
    galleryImages: [],
    detailImages: [],
    status: "draft",
    collapsed: false,
    showMore: false,
    registeredId: null,
    notes: [],
  };
}

/**
 * 숫자 칸 검사 — 빈 값과 "12,900" 같은 천단위 쉼표를 사람이 쓴 그대로 받아 준다.
 * 통화 기호도 함께 지운다: 엑셀을 서식대로 읽으면서 `₩19,200` 형태가 들어올 수 있다.
 */
export function toNumeric(value: string): number | null {
  const cleaned = value.replace(/[,\s원₩￦$]/g, "").trim();
  if (cleaned === "") return null;
  if (!/^-?\d+$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** 마진 표시용 — 원가가 없으면 아무것도 보여 주지 않는다(추측한 숫자를 보여 주면 더 위험하다) */
export function marginText(price: string, cost: string): string | null {
  const p = toNumeric(price);
  const c = toNumeric(cost);
  if (p == null || c == null || p <= 0 || c <= 0) return null;
  const margin = p - c;
  const rate = Math.round((margin / p) * 100);
  return `마진 ${margin.toLocaleString("ko-KR")}원 (${rate}%)`;
}

/** KvRow 배열 → 서버로 보낼 객체. 서버 parseKeyValues 는 객체를 그대로 받는다 */
export function rowsToObject(rows: KvRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    const value = row.value.trim();
    if (key && value) out[key] = value;
  }
  return out;
}
