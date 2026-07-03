import type { ProductStatus, StorageType } from "@/lib/types";

/* ============================================================
   상품 편집 폼 상태 타입/변환 유틸 — ProductForm과 탭들이 공유
   (숫자 필드는 입력 편의를 위해 문자열로 보관하고 저장 시 변환)
   ============================================================ */

export interface FormState {
  name: string;
  slug: string;
  subtitle: string;
  category_id: string;
  description: string;
  story: string;
  price: string;
  compare_at_price: string;
  cost_price: string;
  sku: string;
  stock: string;
  low_stock_threshold: string;
  status: ProductStatus;
  storage_type: StorageType;
  origin: string;
  weight: string;
  units_per_pack: string;
  badges: string[];
  tags: string;
  is_featured: boolean;
  sort_order: string;
}

export const EMPTY_FORM: FormState = {
  name: "",
  slug: "",
  subtitle: "",
  category_id: "",
  description: "",
  story: "",
  price: "",
  compare_at_price: "",
  cost_price: "",
  sku: "",
  stock: "0",
  low_stock_threshold: "10",
  status: "draft",
  storage_type: "room",
  origin: "",
  weight: "",
  units_per_pack: "1",
  badges: [],
  tags: "",
  is_featured: false,
  sort_order: "0",
};

export interface VariantDraft {
  id: string | null;
  name: string;
  price_delta: string;
  stock: string;
  sku: string;
  is_active: boolean;
}

export interface KvRow {
  key: string;
  value: string;
}

/** Record → 편집용 행 배열 */
export function recordToRows(record: Record<string, string | number> | null | undefined): KvRow[] {
  if (!record) return [];
  return Object.entries(record).map(([key, value]) => ({ key, value: String(value) }));
}

/** 편집용 행 배열 → Record (빈 키 제외, 숫자 문자열은 숫자로) */
export function rowsToRecord(rows: KvRow[]): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const row of rows) {
    const key = row.key.trim();
    const value = row.value.trim();
    if (!key || !value) continue;
    const n = Number(value);
    out[key] = value !== "" && Number.isFinite(n) && /^-?\d+(\.\d+)?$/.test(value) ? n : value;
  }
  return out;
}

/** 폼 문자열 → 정수 (빈 값이면 fallback) */
export function toInt(v: string, fallback: number): number {
  const n = Number(v.trim());
  return Number.isInteger(n) && v.trim() !== "" ? n : fallback;
}

/** 폼 문자열 → 정수 또는 null */
export function toIntOrNull(v: string): number | null {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isInteger(n) ? n : null;
}
