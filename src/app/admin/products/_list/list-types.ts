/* ============================================================
   상품 목록 화면이 실제로 쓰는 행 모양.

   목록 API 가 `select("*")` 를 쓰던 시절에는 상세 본문(description)·브랜드 스토리·
   영양·스펙까지 매 행마다 딸려 와, 100개씩 보기를 켜면 응답이 수백 KB가 됐다.
   목록은 그중 하나도 그리지 않는다. 그래서 필요한 컬럼만 받는 전용 타입을 둔다
   (ProductWithImages 를 그대로 쓰면 없는 필드까지 타입이 요구한다).
   ============================================================ */

import type { ProductStatus } from "@/lib/types";
import type { HealthCode } from "./product-health";
import type { PriceAdjustPlan } from "./price-math";

export interface ProductListRow {
  id: string;
  slug: string;
  name: string;
  sku: string | null;
  brand: string | null;
  /** 자체 / 수다락 — 관리자 식별용이며 고객 화면에는 절대 내보내지 않는다 */
  supplier: string | null;
  category_id: string | null;
  price: number;
  compare_at_price: number | null;
  /** 관리자 전용 — 고객 API(PRODUCT_CARD_COLUMNS)에서는 빠져 있다 */
  cost_price: number | null;
  stock: number;
  low_stock_threshold: number;
  status: ProductStatus;
  is_featured: boolean;
  sort_order: number;
  created_at: string;
  categories: { id: string; slug: string; name: string } | null;
  /**
   * price_delta 를 함께 받는 이유: 고객이 실제로 내는 값은 판매가 + 옵션 추가금액이다.
   * 가격 일괄 조정은 판매가만 바꾸므로, 추가금액이 붙은 상품에서는 "8% 인상" 이
   * 그대로 성립하지 않는다. 미리보기가 그 사실을 세어 보여 주려면 이 값이 필요하다.
   */
  product_variants: { id: string; stock: number; price_delta: number }[];
  /** 서버가 계산해 실어 보내는 문제 목록 (product-health.ts) */
  health: HealthCode[];
  /** 대표 사진 주소 — 목록 썸네일용으로 서버가 골라 준다 */
  thumbnail: string | null;
  /** 갤러리 사진 장수 */
  image_count: number;
}

/**
 * 정렬 기준 — 서버 화이트리스트(api/admin/products/route.ts SORTABLE)와 같아야 한다.
 *
 * '재고' 를 뺐다. 목록의 재고 칸은 **옵션이 있으면 옵션 재고 합계**를 그리는데
 * 정렬은 상품 행의 재고 컬럼(products.stock)으로 줄을 세웠다. 옵션을 쓰는 상품은
 * 상품 행 재고가 0인 채로 옵션에만 재고가 있어서, "재고 적은 순" 을 눌러 올라온
 * 맨 위 상품이 실제로는 재고가 가장 많은 상품인 일이 벌어졌다.
 * 합계로 정렬하려면 DB 에 합계 뷰나 생성 컬럼이 있어야 하고(페이지네이션은
 * 서버 정렬을 전제로 한다) 그건 스키마 결정이라 감독에게 올렸다.
 * 그때까지는 **틀린 정렬을 제공하지 않는 편**이 낫다 — 재고가 급한 화면은
 * 재고 관리(/admin/inventory)가 따로 있다.
 */
export const SORT_LABELS = {
  sort_order: "진열 순서",
  created_at: "등록일",
  name: "상품명",
  price: "판매가",
} as const;

export type SortKey = keyof typeof SORT_LABELS;

export const SORT_KEYS = Object.keys(SORT_LABELS) as SortKey[];

export type SortDir = "asc" | "desc";

export interface ListFacets {
  suppliers: string[];
  brands: string[];
  /**
   * 선택지를 만들 때 훑은 행이 상한에 걸렸는가.
   * 걸렸다면 화면의 공급처·브랜드 목록이 실제보다 적을 수 있다 —
   * 조용히 빠뜨리면 관리자는 없는 공급처라고 믿게 되므로 화면에 말해 준다.
   */
  truncated?: boolean;
}

export interface ListResponse {
  products: ProductListRow[];
  total: number;
  page: number;
  totalPages: number;
  facets: ListFacets;
}

/**
 * 일괄 작업 한 건.
 *
 * 화면과 확인 문구 생성기(bulk-confirm.ts)가 같은 모양을 봐야 해서 여기 둔다.
 * 서버(bulk-edit/route.ts)는 이 타입을 믿지 않고 요청을 다시 검증한다 — 화면 타입은
 * 브라우저에서 얼마든지 우회되므로 서버 검증을 대신할 수 없다.
 */
export type BulkAction =
  | { kind: "status"; value: ProductStatus }
  | { kind: "category"; value: string | null }
  | { kind: "featured"; value: boolean }
  | { kind: "price"; plan: PriceAdjustPlan }
  /**
   * 선택 삭제. 값이 없는 유일한 작업이라 서버도 다른 라우트(bulk-delete)가 받는다 —
   * 나머지 넷은 "값을 바꾼다" 는 전제의 검증을 통과해야 하지만 삭제에는 그 값이 없다.
   */
  | { kind: "delete" };

/**
 * 일괄 작업 결과 — 서버가 성공/실패를 행 단위로 정직하게 돌려준다.
 * 삭제도 같은 모양을 쓴다(changes 는 비어 있고, failed 에 '주문 이력이 있어 …' 가 담긴다).
 */
export interface BulkEditResult {
  ok: number;
  failed: { id: string; name: string; reason: string }[];
  changes: { id: string; name: string; before: number | null; after: number | null }[];
  skipped: { id: string; name: string; reason: string }[];
}
