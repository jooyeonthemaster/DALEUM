/* 재고 관리 화면 공용 타입 — /api/admin/inventory 응답과 1:1 */

export interface InventoryUnit {
  product_id: string;
  variant_id: string | null;
  name: string;
  option_name: string | null;
  sku: string | null;
  stock: number;
  threshold: number;
  status: string;
  is_active: boolean;
  thumbnail: string | null;
  last_log: { delta: number; reason: string; created_at: string } | null;
}

export interface InventorySummary {
  total_skus: number;
  low_stock: number;
  sold_out: number;
}

export interface InventoryListResponse {
  rows: InventoryUnit[];
  total: number;
  page: number;
  totalPages: number;
  summary: InventorySummary;
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
}
