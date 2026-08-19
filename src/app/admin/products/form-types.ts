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
  story: string;
  price: string;
  compare_at_price: string;
  cost_price: string;
  /**
   * 고객에게 보이는 브랜드 (마틴조 / 바비지요 / 밥애쏙 / 칼로리시즌 …).
   *
   * 0003 마이그레이션으로 들어온 컬럼이고 상품 API(shared.ts)는 이미 받아들이는데,
   * 폼에는 입력칸 자체가 없어서 관리자 화면만으로는 영원히 채울 수 없었다.
   * 값을 불러오고 저장하는 배선(populate/save)은 ProductForm 담당이라 아직 없으므로,
   * 여기서는 **선택 필드**로 둔다 — 배선 전인 ProductForm 이 타입 오류 없이 컴파일되게 하기 위함이다.
   * 배선이 끝나면 `brand: string` 으로 올려도 된다.
   */
  brand?: string;
  /** 관리자 전용 공급 라인 (자체 / 수다락 / 곤약닷컴). 고객 화면에는 절대 나가지 않는다. brand 와 같은 이유로 선택 필드. */
  supplier?: string;
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
  story: "",
  price: "",
  compare_at_price: "",
  cost_price: "",
  brand: "",
  supplier: "",
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
  /**
   * 화면을 열었을 때의 재고. 저장할 때 서버가 DB 현재값과 비교해,
   * 그 사이 주문으로 재고가 줄었으면 되살리지 않고 경고만 준다.
   * 새로 만든 옵션은 비교할 과거가 없으므로 null.
   */
  expectedStock: number | null;
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

/* ------------------------------------------------------------
   숫자 입력의 '조용한 폐기' 막기.

   옛 변환은 `Number(v)` 하나였다. 그래서 공급사 엑셀에서 `14,300` 을 복사해
   원가 칸에 붙여넣으면 Number("14,300") = NaN → null 이 되어, 화면은
   "저장되었습니다" 라고 말하는데 다시 열면 원가 칸이 비어 있었다.
   같은 함수를 쓰는 재고 임계치·구성 수량·노출 순서는 fallback 이 있어서
   입력값이 10/1/0 으로 조용히 되돌아갔다 — 어느 쪽도 관리자에게 아무 흔적을 남기지 않는다.

   그래서 두 가지를 바꾼다.
   1) 사람이 실제로 붙여넣는 표기(천단위 쉼표·공백·'원'·₩·전각숫자·전각 마이너스)를
      정상 입력으로 흡수한다. 손으로 지우게 만들 이유가 없다.
   2) 그래도 숫자로 못 읽히면 null 로 삼키지 말고 '못 읽음' 을 구분해 돌려준다.
      화면(NumberField)이 그 상태를 빨간 안내로 보여주고, 저장 검증도 이 값을 쓴다.
   ------------------------------------------------------------ */

/** 숫자 입력에서 표기용 문자(쉼표·공백·원·₩·전각숫자 등)를 걷어낸 순수 텍스트 */
export function normalizeNumberText(v: string): string {
  return v
    .replace(/[\uff10-\uff19]/g, (d) => String(d.charCodeAt(0) - 0xff10)) // 전각 숫자 → 반각
    .replace(/[\uff0d\u2212\u2013\u2014]/g, "-") // 전각/유니코드 빼기표 → 하이픈
    .replace(/[,\uff0c\s원₩]/g, "")
    .trim();
}

/** 숫자 칸의 읽기 결과 — 빈 칸과 '숫자로 못 읽는 칸' 을 반드시 구분한다 */
export type NumberFieldState =
  | { kind: "empty" }
  | { kind: "ok"; value: number }
  | { kind: "invalid" };

/** 폼 문자열 → 정수 상태 (빈 칸 / 정상 / 못 읽음) */
export function parseNumberField(v: string): NumberFieldState {
  const t = normalizeNumberText(v);
  if (t === "") return { kind: "empty" };
  if (!/^-?\d+$/.test(t)) return { kind: "invalid" };
  const n = Number(t);
  if (!Number.isSafeInteger(n)) return { kind: "invalid" };
  return { kind: "ok", value: n };
}

/** 화면 표시용 — 숫자로 읽히면 천단위 쉼표를 찍고, 아직 못 읽으면 입력한 그대로 둔다(사용자가 고쳐야 하니까) */
export function formatNumberForInput(v: string): string {
  const parsed = parseNumberField(v);
  return parsed.kind === "ok" ? parsed.value.toLocaleString("ko-KR") : v;
}

/** 폼 문자열 → 정수 (빈 값이거나 못 읽으면 fallback) */
export function toInt(v: string, fallback: number): number {
  const parsed = parseNumberField(v);
  return parsed.kind === "ok" ? parsed.value : fallback;
}

/** 폼 문자열 → 정수 또는 null (못 읽는 값도 null — 막을지 말지는 화면 검증이 정한다) */
export function toIntOrNull(v: string): number | null {
  const parsed = parseNumberField(v);
  return parsed.kind === "ok" ? parsed.value : null;
}
