/* ============================================================
   엑셀 해석 — 회사가 실제로 쓰는 품목표를 그대로 읽는다

   왜 다시 썼는가:
   전에는 `XLSX.utils.sheet_to_json(sheet)` 로 **무조건 첫 줄을 제목 줄로** 삼았다.
   그런데 실제 파일 `(주)다름_온라인 판매 품목 현황 화심영농조합법인.xlsx` 는
     0행 "(주)다른_ 온라인판매 품목 현황"   ← 문서 제목
     1행 날짜
     2행 "품 번 | 제품명 | 규격(g) | 포장 입수(入) | 납품가(원)… | 정상가(원)… | 비 고"  ← 진짜 제목 줄
     3행부터 데이터
   구조라서, 첫 줄을 제목으로 읽으면 모든 칸이 어긋나 전 행이 버려지고
   화면에는 "불러올 상품이 없습니다" 만 떴다. 대표가 쓰는 파일을 못 읽는 기능이었다.

   게다가 제품명 칸이 **병합셀**이라 같은 제품의 2·3행은 비어 있다.
     [1,"여주발효곤약밥",150,10,14300,19200]
     [2,"",           "", 20,25500,36800]   ← 20입
     [3,"",           "", 30,36500,52800]   ← 30입
   옛 코드는 이름이 빈 행을 조용히 버려, 10입만 남고 20·30입이 사라졌다.
   여기서는 위 행의 이름을 이어받아 **한 상품 + 옵션 여러 개**로 묶는다.

   추측한 결과는 반드시 사람이 확인하도록 화면(SheetMappingPanel)에 그대로 넘긴다 —
   이 파일은 판단하지 않고 "이렇게 읽었다" 를 돌려줄 뿐이다.
   ============================================================ */

import { STORAGE_TYPE_LABELS } from "@/lib/admin-labels";
import type { Category, StorageType } from "@/lib/types";
import {
  MAX_PRODUCTS,
  MAX_SHEET_ROWS,
  emptyDraft,
  makeId,
  type ProductDraft,
  type VariantDraft,
} from "./bulk-types";
import { dedupeSlug, proposeSlug } from "./bulk-slug";

import { unitSuffix, type ColumnTarget, type FieldKey } from "./bulk-sheet-headers";

// 제목 줄 규칙은 옆 파일로 옮겼지만, 화면은 계속 이 파일 하나만 보면 되도록 그대로 내보낸다.
export {
  FIELD_LABELS,
  FIELD_OPTIONS,
  normalizeHeader,
  detectHeaderRow,
  guessMapping,
} from "./bulk-sheet-headers";
export type { ColumnTarget, FieldKey } from "./bulk-sheet-headers";


/**
 * 엑셀 → 문자열 격자. **엑셀에서 눈으로 본 그대로** 읽는다.
 *
 * 기본값으로 읽으면 날짜 칸이 원시 일련번호로 나온다 — 실제 품목표의 날짜 줄이
 * 제목 줄 고르기 목록에 `46169` 로 떠서, 무엇을 고르는 화면인지 알 수 없었다.
 * cellDates 와 raw:false 를 함께 주면 서식이 적용된 글자를 그대로 받는다.
 *
 * ⚠ 그 대신 금액 칸이 `₩19,200` 처럼 통화 기호를 달고 온다. 숫자 해석(numeric·toNumeric)이
 * 통화 기호를 못 지우면 판매가가 통째로 "숫자가 아님" 이 되므로 두 곳을 함께 고쳐야 한다.
 */
export async function readGrid(file: File): Promise<string[][]> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: true,
    raw: false,
  });
  return rows.map((row) =>
    (row ?? []).map((cell) => {
      if (cell == null) return "";
      // 서식이 없는 날짜 칸은 Date 로 온다 — 일련번호가 아니라 사람이 읽는 날짜로 적는다
      if (cell instanceof Date) return cell.toLocaleDateString("ko-KR");
      return String(cell).replace(/\r\n/g, " ").trim();
    })
  );
}

/**
 * 보관 방법 추정.
 *
 * 옛 코드는 `["냉장","chilled"].includes(값)` 로 **완전일치**만 봤다. 그래서
 * '냉장보관', '냉장 보관', '-18℃ 이하' 처럼 사람이 실제로 적는 표기가 전부
 * 조용히 상온으로 떨어졌다 — 냉동식품이 상온으로 등록되는 사고다.
 * 이제 부분일치로 넓히고, **알아보지 못하면 그 사실을 함께 돌려준다.**
 */
export function normalizeStorage(value: string): { storage: StorageType; recognized: boolean } {
  const text = value.replace(/\s+/g, "").toLowerCase();
  if (!text) return { storage: "room", recognized: true };
  if (/냉동|frozen|-1[0-9]|-2[0-9]/.test(text)) return { storage: "frozen", recognized: true };
  if (/냉장|chilled|refriger|0~10|0-10/.test(text)) return { storage: "chilled", recognized: true };
  if (/상온|실온|room|normal/.test(text)) return { storage: "room", recognized: true };
  return { storage: "room", recognized: false };
}

export interface SheetImportStats {
  /** 제목 줄 아래의 전체 줄 수 */
  totalRows: number;
  /** 실제로 상품·옵션이 된 줄 수 */
  usedRows: number;
  /** 값이 비어 건너뛴 줄 수 */
  emptyRows: number;
  productCount: number;
  variantCount: number;
}

export interface SheetImportResult {
  drafts: ProductDraft[];
  /** 한 번에 담을 수 있는 수를 넘긴 몫 — 버리지 않고 대기열에 둔다 */
  queued: ProductDraft[];
  stats: SheetImportStats;
  /**
   * 표 전체에 걸리는 한국어 안내.
   * "말없이 기본값으로 채운 것" 을 사람에게 알리는 자리다 — 재고 칸이 없어 전부 0이 된 것처럼,
   * 화면에는 정상으로 보이지만 그대로 등록하면 품절 상품이 고객 목록에 걸리는 종류의 일이다.
   */
  notes: string[];
}

interface RowValues {
  values: Partial<Record<FieldKey, string>>;
  hasContent: boolean;
}

function readRow(row: string[], mapping: ColumnTarget[], suffixes: string[]): RowValues {
  const values: Partial<Record<FieldKey, string>> = {};
  let hasContent = false;

  mapping.forEach((field, col) => {
    if (!field) return;
    const raw = (row[col] ?? "").trim();
    if (!raw) return;
    const suffix = suffixes[col];
    // 단위는 숫자로만 적힌 칸에만 붙인다 ("150" → "150g", "150g" 은 그대로)
    // 천단위 쉼표가 붙은 값도 숫자로 본다 — 서식대로 읽으면 "1,000" 으로 들어온다
    values[field] = suffix && /^\d[\d,]*(\.\d+)?$/.test(raw) ? `${raw}${suffix}` : raw;
    // 상품명만 있는 줄은 병합셀 잔재일 수 있어 "내용 있음" 으로 치지 않는다
    if (field !== "name") hasContent = true;
  });

  return { values, hasContent };
}

/** 통화 기호까지 지운다 — 서식이 적용된 값은 `₩19,200` 으로 들어온다(readGrid 주석 참고) */
function numeric(value: string | undefined): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[,\s원₩￦$]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** 카테고리 이름·주소로 실제 id 찾기 — 못 찾으면 null */
function resolveCategory(raw: string | undefined, categories: Category[]): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  const hit = categories.find(
    (c) => c.name.trim().toLowerCase() === key || c.slug.toLowerCase() === key
  );
  return hit ? hit.id : null;
}

/**
 * 격자 → 상품 초안 목록.
 * 같은 상품명이 이어지는 줄들은 한 상품으로 묶고, 두 줄 이상이면 옵션으로 만든다.
 */
export function buildDrafts(
  grid: string[][],
  headerRow: number,
  mapping: ColumnTarget[],
  categories: Category[]
): SheetImportResult {
  const headerCells = grid[headerRow] ?? [];
  const suffixes = headerCells.map(unitSuffix);
  const body = grid.slice(headerRow + 1, headerRow + 1 + MAX_SHEET_ROWS);

  // 1) 줄을 읽고 병합셀로 빈 상품명을 위에서 이어받는다
  interface Grouped {
    name: string;
    rows: Partial<Record<FieldKey, string>>[];
  }
  const groups: Grouped[] = [];
  let lastName = "";
  let usedRows = 0;
  let emptyRows = 0;

  for (const row of body) {
    const { values, hasContent } = readRow(row, mapping, suffixes);
    const explicitName = (values.name ?? "").trim();
    if (explicitName) lastName = explicitName;

    // 값이 아무것도 없는 줄은 품번만 남은 빈 줄이다 — 이어받은 이름으로 유령 상품을 만들면 안 된다
    if (!hasContent) {
      if (explicitName || row.some((cell) => cell.trim())) emptyRows += 1;
      continue;
    }
    if (!lastName) {
      emptyRows += 1;
      continue;
    }

    usedRows += 1;
    const current = groups[groups.length - 1];
    if (current && current.name === lastName && !explicitName) {
      current.rows.push(values);
    } else if (current && current.name === lastName && explicitName) {
      // 같은 이름이 다시 명시된 경우도 같은 상품으로 본다(양식마다 병합 방식이 다르다)
      current.rows.push(values);
    } else {
      groups.push({ name: lastName, rows: [values] });
    }
  }

  // 2) 묶음 → 초안
  const takenSlugs = new Set<string>();
  let variantCount = 0;

  const drafts: ProductDraft[] = groups.map((group) => {
    const base = group.rows[0];
    const draft = emptyDraft();
    const notes: string[] = [];

    draft.name = group.name;
    draft.price = base.price ?? "";
    draft.comparePrice = base.comparePrice ?? "";
    draft.costPrice = base.costPrice ?? "";
    draft.stock = base.stock ?? "0";
    draft.origin = base.origin ?? "국내산";
    draft.weight = base.weight ?? "";
    draft.unitsPerPack = base.unitsPerPack ?? "1";
    draft.subtitle = base.subtitle ?? "";
    draft.sku = base.sku ?? "";
    draft.description = base.description ?? "";
    draft.badges = (base.badges ?? "").split(/[,|]/).map((s) => s.trim()).filter(Boolean);
    draft.tags = (base.tags ?? "").split(/[,|]/).map((s) => s.trim()).filter(Boolean);

    const storage = normalizeStorage(base.storage ?? "");
    draft.storage = storage.storage;
    if (!storage.recognized) {
      notes.push(
        `보관 방법 '${base.storage}' 를 알아보지 못해 ${STORAGE_TYPE_LABELS.room}으로 두었습니다. 맞는지 확인해 주세요.`
      );
    }

    if (base.category) {
      const categoryId = resolveCategory(base.category, categories);
      if (categoryId) {
        draft.category = categoryId;
      } else {
        notes.push(`'${base.category}' 라는 카테고리가 없습니다. 아래에서 골라 주세요.`);
      }
    }

    // 상품 주소 — 엑셀에 적혀 있으면 그것을 쓰고, 없으면 상품명에서 제안한다
    const fromSheet = (base.slug ?? "").trim().toLowerCase();
    const candidate = fromSheet || proposeSlug(group.name);
    draft.slug = dedupeSlug(candidate, takenSlugs);
    if (draft.slug) takenSlugs.add(draft.slug);
    draft.slugTouched = Boolean(fromSheet);

    // 3) 여러 줄이면 옵션으로 — 대표 줄 가격을 기준으로 차액을 낸다
    if (group.rows.length > 1) {
      const basePrice = numeric(base.price) ?? 0;
      // 포장 단위마다 납품가가 다른 것이 회사 품목표의 보통 모습인데(10입 14,300 / 20입 25,500),
      // 옵션에는 원가를 담을 자리가 없다(product_variants 에 원가 컬럼이 없다).
      // 첫 줄 값만 상품 원가로 들어가므로 옵션별 마진 표시는 실제와 다르다 — 그 사실을 적어 둔다.
      const costs = new Set(
        group.rows.map((row) => numeric(row.costPrice)).filter((v): v is number => v != null)
      );
      if (costs.size > 1) {
        notes.push(
          "포장 단위마다 납품가가 다릅니다. 옵션에는 원가를 담을 자리가 없어 첫 줄 값만 상품 원가로 넣었습니다. 옵션별 마진은 실제와 다를 수 있습니다."
        );
      }
      draft.variants = group.rows.map((row, index): VariantDraft => {
        const units = (row.unitsPerPack ?? "").trim();
        const rowPrice = numeric(row.price);
        return {
          id: makeId(),
          name: units ? `${units}입` : `옵션 ${index + 1}`,
          priceDelta: rowPrice == null ? "0" : String(rowPrice - basePrice),
          stock: row.stock ?? "0",
          sku: row.sku ?? "",
        };
      });
      variantCount += draft.variants.length;
    }

    draft.notes = notes;
    // 여러 개를 한꺼번에 불러오면 펼친 채로는 화면이 수만 px 이 된다 — 접어서 시작한다
    draft.collapsed = true;
    return draft;
  });

  const stats: SheetImportStats = {
    totalRows: body.length,
    usedRows,
    emptyRows,
    productCount: drafts.length,
    variantCount,
  };

  // 표 전체에 걸리는 안내 — 말없이 기본값을 넣은 것은 반드시 사람에게 알린다.
  // 재고가 그 대표 사례다: 칸이 없으면 전부 0이 되는데, 화면에는 '0' 이 정상값처럼 보여
  // 그대로 판매중으로 열면 고객 목록에 품절 상품만 걸린다.
  const notes: string[] = [];
  if (drafts.length > 0 && !mapping.includes("stock")) {
    notes.push(
      "엑셀에 재고 칸이 없어 모든 상품을 재고 0으로 두었습니다. 카드에서 재고를 채워 주세요. 재고가 0이면 판매중으로 열 수 없습니다."
    );
  }

  return {
    drafts: drafts.slice(0, MAX_PRODUCTS),
    queued: drafts.slice(MAX_PRODUCTS),
    stats,
    notes,
  };
}

/** 미리보기 표에 쓸 "이 줄을 이렇게 읽었다" 요약 */
export function previewRows(
  grid: string[][],
  headerRow: number,
  mapping: ColumnTarget[],
  limit = 5
): { field: FieldKey; value: string }[][] {
  const headerCells = grid[headerRow] ?? [];
  const suffixes = headerCells.map(unitSuffix);
  const out: { field: FieldKey; value: string }[][] = [];

  for (const row of grid.slice(headerRow + 1)) {
    const { values, hasContent } = readRow(row, mapping, suffixes);
    if (!hasContent) continue;
    out.push(
      (Object.entries(values) as [FieldKey, string][]).map(([field, value]) => ({ field, value }))
    );
    if (out.length >= limit) break;
  }
  return out;
}
