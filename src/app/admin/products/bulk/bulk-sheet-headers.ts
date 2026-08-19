/* ============================================================
   엑셀 제목 줄 알아보기 — 어느 줄이 제목이고, 각 칸이 무엇인지

   bulk-sheet.ts 에서 떼어 냈다(한 파일 500줄 상한). 이 규칙들은 렌더도 파일 읽기도
   모르는 순수 함수라, 따로 두면 "회사 품목표의 제목 줄을 알아보는가" 만 놓고 볼 수 있다.
   ============================================================ */

/** 엑셀 한 칸이 대응될 수 있는 다름 항목 */
export type FieldKey =
  | "name"
  | "slug"
  | "category"
  | "price"
  | "comparePrice"
  | "costPrice"
  | "stock"
  | "storage"
  | "origin"
  | "weight"
  | "unitsPerPack"
  | "subtitle"
  | "sku"
  | "description"
  | "badges"
  | "tags";

/** 빈 문자열은 "이 칸은 쓰지 않음" */
export type ColumnTarget = FieldKey | "";

export const FIELD_LABELS: Record<FieldKey, string> = {
  name: "상품명",
  slug: "상품 주소",
  category: "카테고리",
  price: "판매가",
  comparePrice: "정가",
  costPrice: "원가(납품가)",
  stock: "재고",
  storage: "보관 방법",
  origin: "원산지",
  weight: "중량·규격",
  unitsPerPack: "포장 입수",
  subtitle: "한줄 소개",
  sku: "상품 코드",
  description: "상품 설명",
  badges: "배지",
  tags: "태그",
};

export const FIELD_OPTIONS = Object.entries(FIELD_LABELS) as [FieldKey, string][];

/**
 * 제목 칸 낱말 → 항목.
 *
 * 주의: 이 품목표에서 `정상가(노출가)` 는 **고객에게 보이는 판매가**이고
 * `납품가` 는 다름이 지불하는 **원가**다. 둘을 반대로 넣으면 원가로 판매하게 되므로
 * 이 대응이 이 파일에서 가장 중요한 한 줄이다. (그래도 화면에서 사람이 바꿀 수 있다)
 */
const HEADER_ALIASES: Record<string, FieldKey> = {
  상품명: "name",
  제품명: "name",
  품명: "name",
  상품: "name",
  제품: "name",
  이름: "name",
  name: "name",

  상품주소: "slug",
  주소: "slug",
  영문주소: "slug",
  slug: "slug",
  url: "slug",

  카테고리: "category",
  분류: "category",
  category: "category",

  판매가: "price",
  정상가: "price",
  노출가: "price",
  판매가격: "price",
  가격: "price",
  price: "price",

  정가: "comparePrice",
  소비자가: "comparePrice",
  권장소비자가: "comparePrice",
  할인전가격: "comparePrice",

  납품가: "costPrice",
  공급가: "costPrice",
  원가: "costPrice",
  매입가: "costPrice",
  cost: "costPrice",

  재고: "stock",
  초기재고: "stock",
  수량: "stock",
  stock: "stock",

  보관: "storage",
  보관방법: "storage",
  보관조건: "storage",
  유통보관: "storage",

  원산지: "origin",
  origin: "origin",

  중량: "weight",
  규격: "weight",
  용량: "weight",
  내용량: "weight",
  weight: "weight",

  포장입수: "unitsPerPack",
  입수: "unitsPerPack",
  구성수량: "unitsPerPack",
  구성: "unitsPerPack",

  한줄소개: "subtitle",
  부제: "subtitle",
  소개: "subtitle",

  sku: "sku",
  상품코드: "sku",
  품목코드: "sku",

  상품설명: "description",
  설명: "description",
  상세설명: "description",

  배지: "badges",
  뱃지: "badges",

  태그: "tags",
  키워드: "tags",
};

/**
 * 제목 칸 글자를 비교용으로 다듬는다.
 * 실제 헤더가 `"납품가(원)\r\n(택배비 포함)(VAT포함가)"` 처럼 줄바꿈과 괄호 설명을
 * 잔뜩 달고 오기 때문에, 공백·줄바꿈을 없애고 괄호 안을 통째로 걷어 낸 뒤 비교한다.
 */
export function normalizeHeader(raw: string): string {
  return raw
    .replace(/\s+/g, "")
    .replace(/[（(][^）)]*[）)]/g, "")
    .trim()
    .toLowerCase();
}

/** 제목 칸 괄호 안이 단위면 값에 붙여 준다 — `규격(g)` 의 150 은 "150g" 이어야 뜻이 산다 */
export function unitSuffix(raw: string): string {
  const match = raw.replace(/\s+/g, "").match(/[（(](kg|g|mg|ml|l|리터)[）)]/i);
  return match ? match[1].toLowerCase() : "";
}

export function matchField(header: string): ColumnTarget {
  const key = normalizeHeader(header);
  if (!key) return "";
  const exact = HEADER_ALIASES[key];
  if (exact) return exact;
  // 별칭이 제목 앞머리에 붙어 있는 경우까지만 넓힌다(예: "판매가A", "재고수")
  for (const [alias, field] of Object.entries(HEADER_ALIASES)) {
    if (alias.length >= 2 && key.startsWith(alias)) return field;
  }
  return "";
}

/**
 * 제목 줄 찾기 — 알아본 항목이 가장 많은 줄. 단, 상품명 칸이 반드시 있어야 한다.
 * 못 찾으면 -1 을 돌려주고, 화면이 사람에게 직접 고르게 한다.
 */
export function detectHeaderRow(grid: string[][]): number {
  let bestRow = -1;
  let bestScore = 1; // 항목 2개 이상 알아본 줄만 제목 줄로 인정한다

  const limit = Math.min(grid.length, 20);
  for (let i = 0; i < limit; i += 1) {
    const cells = grid[i] ?? [];
    const matched = cells.map(matchField).filter(Boolean);
    if (!matched.includes("name")) continue;
    if (matched.length > bestScore) {
      bestScore = matched.length;
      bestRow = i;
    }
  }
  return bestRow;
}

/** 제목 줄의 각 칸이 어느 항목인지 자동 추천 — 같은 항목이 두 번 잡히면 뒤엣것은 버린다 */
export function guessMapping(headerCells: string[]): ColumnTarget[] {
  const used = new Set<FieldKey>();
  return headerCells.map((cell) => {
    const field = matchField(cell);
    if (!field || used.has(field)) return "";
    used.add(field);
    return field;
  });
}
