/* 재고 관리 화면 공용 타입 — /api/admin/inventory 응답과 1:1 */

export type InventoryScope = "product" | "variant";

/** 판매 상태와 실제 재고가 어긋난 형태 */
export type StockMismatch = "empty_but_selling" | "stocked_but_sold_out" | null;

export interface InventoryUnit {
  product_id: string;
  variant_id: string | null;
  /** product = 상품 자체 재고 행 / variant = 옵션 재고 행 */
  scope: InventoryScope;
  name: string;
  option_name: string | null;
  /** 공급사 엑셀의 '품번' — 화면에도 품번으로 부른다 */
  sku: string | null;
  stock: number;
  /** 옵션 상품의 상품 자체 재고 행에는 임박 기준이 없다 */
  threshold: number | null;
  status: string;
  is_active: boolean;
  /** 이 행만의 품번인가 — 엑셀 양식이 false 인 행의 품번 칸을 비운다 */
  has_own_sku: boolean;
  thumbnail: string | null;
  counts_as_unit: boolean;
  has_options: boolean;
  active_option_count: number;
  option_stock_total: number;
  product_stock: number;
  sellable_stock: number;
  storefront_locked: boolean;
  options_all_off: boolean;
  status_mismatch: StockMismatch;
  last_log: { delta: number; reason: string; created_at: string } | null;
}

export interface InventorySummary {
  total_units: number;
  low_stock: number;
  sold_out: number;
  locked: number;
}

export interface LockedProductAlert {
  product_id: string;
  name: string;
  option_stock_total: number;
  active_option_count: number;
}

export interface InventoryListResponse {
  rows: InventoryUnit[];
  total: number;
  page: number;
  totalPages: number;
  summary: InventorySummary;
  locked: LockedProductAlert[];
  mismatchCount: number;
}

export interface InventoryLogItem {
  id: number;
  product_id: string;
  variant_id: string | null;
  delta: number;
  reason: string;
  ref_order_id: string | null;
  memo: string | null;
  created_at: string;
  product_name: string;
  variant_name: string | null;
  order: { id: string; order_no: string } | null;
  /** 이미 되돌린 이력인가 — 되돌리기 버튼 대신 '되돌림' 을 보여 준다 */
  undone: boolean;
}

export interface InventoryLogsResponse {
  logs: InventoryLogItem[];
  total: number;
  page: number;
  totalPages: number;
}

/* ---------- 엑셀 일괄 입고 ---------- */

export interface BulkStockRow {
  no: number;
  sku: string;
  productName: string;
  optionName: string;
  /** 양식을 내려받던 때의 현재고 칸 원문 — 세는 사이에 팔린 것을 덮어쓰지 않게 서버가 대조한다 */
  current: string;
  /** 입고 수량 칸 원문 (숫자 검증은 서버가 한다) */
  restock: string;
  /** 창고에서 세어 본 재고 칸 원문 */
  count: string;
  memo: string;
}

export interface BulkStockResult {
  no: number;
  label: string;
  kind: "restock" | "count" | "skip" | "error";
  before: number | null;
  after: number | null;
  delta: number | null;
  message: string;
}

export interface BulkStockResponse {
  dryRun: boolean;
  results: BulkStockResult[];
  summary: { applied: number; skipped: number; failed: number; total: number };
  /** 같은 처리 식별자가 이미 반영돼 있어 두 번째 실행을 거절했다 */
  alreadyApplied?: boolean;
  message?: string;
}

/** 목록/모달에서 같은 행을 가리키는 키 */
export function unitKey(u: { product_id: string; variant_id: string | null }): string {
  return `${u.product_id}:${u.variant_id ?? ""}`;
}
