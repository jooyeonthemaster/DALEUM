/* ============================================================
   저장 전 검사 — 첫 오류 하나가 아니라 '전부' 를 모은다.

   옛 검사는 `return "…"` 으로 첫 번째 오류만 돌려줬다. 그래서 관리자는 하나 고치고 저장,
   또 하나 나오면 고치고 저장하는 두더지잡기를 반복했다. 게다가 '옵션명을 모두 입력해 주세요'
   같은 문구는 어느 탭 몇 번째 옵션인지 알려 주지 않아 찾아 헤매야 했다.

   그래서 오류마다 **어느 탭의 문제인지**와 **어느 칸으로 데려갈지**를 함께 들고 다닌다.
   탭 배지와 저장 실패 시 자동 이동이 전부 이 정보를 쓴다.

   또 하나 — 숫자로 못 읽히는 입력을 여기서 반드시 막는다. 옛 저장 경로는 `14,300` 처럼
   쉼표가 섞인 값을 조용히 null 이나 0 으로 바꿔 보냈고, 화면은 "저장되었습니다" 라고 말했다.
   무엇을 잃었는지 알 방법이 없는 것이 가장 나쁜 실패다.
   ============================================================ */

import { parseNumberField, type FormState, type VariantDraft } from "../form-types";

export type FormTabKey = "basic" | "images" | "variants" | "detail";

export interface FormIssue {
  tab: FormTabKey;
  message: string;
  /** 저장 실패 시 커서를 데려갈 입력칸 id (접혀 있어 화면에 없을 수도 있다) */
  focusId?: string;
}

// 한글 주소는 라우트에서 퍼센트 인코딩된 채 조회돼 상세페이지가 404 가 된다 — 서버(shared.ts)와 같은 규칙.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** 서버 parseVariants 가 21번째부터 거절하는 한도 — 화면에서도 같은 숫자를 쓴다 */
export const MAX_VARIANTS = 20;

/** 숫자 칸 하나를 검사한다. 비어 있어도 되는 칸은 allowEmpty 로 구분한다. */
function checkNumber(
  raw: string,
  label: string,
  focusId: string,
  { allowEmpty, min }: { allowEmpty: boolean; min?: number }
): FormIssue | null {
  const state = parseNumberField(raw);
  if (state.kind === "empty") {
    return allowEmpty ? null : { tab: "basic", message: `${label}을(를) 입력해 주세요.`, focusId };
  }
  if (state.kind === "invalid") {
    return {
      tab: "basic",
      message: `${label} 칸에 숫자가 아닌 글자가 들어 있습니다. 숫자만 남겨 주세요.`,
      focusId,
    };
  }
  if (min !== undefined && state.value < min) {
    return { tab: "basic", message: `${label}은(는) ${min} 이상이어야 합니다.`, focusId };
  }
  return null;
}

/** 이름이 겹치는 옵션의 자리 번호(0부터) 모음 — 화면 강조와 저장 검사가 같은 판정을 쓰게 한다 */
export function duplicateVariantIndexes(variants: VariantDraft[]): Set<number> {
  const seen = new Map<string, number>();
  const dup = new Set<number>();
  variants.forEach((v, i) => {
    const key = v.name.trim();
    if (!key) return;
    const first = seen.get(key);
    if (first === undefined) {
      seen.set(key, i);
      return;
    }
    dup.add(first);
    dup.add(i);
  });
  return dup;
}

export interface ValidateInput {
  form: FormState;
  variants: VariantDraft[];
  isNew: boolean;
}

/** 저장을 막아야 하는 문제 전부. 빈 배열이면 저장해도 된다. */
export function validateProduct({ form, variants, isNew }: ValidateInput): FormIssue[] {
  const issues: FormIssue[] = [];

  if (!form.name.trim()) {
    issues.push({ tab: "basic", message: "상품명을 입력해 주세요.", focusId: "p-name" });
  }

  const slug = form.slug.trim();
  if (!slug) {
    issues.push({ tab: "basic", message: "상품 주소를 입력해 주세요.", focusId: "p-slug" });
  } else if (!SLUG_RE.test(slug)) {
    issues.push({
      tab: "basic",
      message: "상품 주소에는 영문 소문자·숫자·하이픈(-)만 쓸 수 있습니다. 한글·공백은 쓸 수 없습니다.",
      focusId: "p-slug",
    });
  }

  const priceState = parseNumberField(form.price);
  if (priceState.kind === "empty") {
    issues.push({ tab: "basic", message: "판매가를 입력해 주세요.", focusId: "p-price" });
  } else if (priceState.kind === "invalid") {
    issues.push({
      tab: "basic",
      message: "판매가 칸에 숫자가 아닌 글자가 들어 있습니다. 숫자만 남겨 주세요.",
      focusId: "p-price",
    });
  } else if (priceState.value < 0) {
    issues.push({ tab: "basic", message: "판매가는 0원보다 작을 수 없습니다.", focusId: "p-price" });
  } else if (priceState.value === 0 && form.status === "active") {
    // 서버(assertSellablePrice)가 400 으로 거절하는 조합 — 저장을 눌러 보기 전에 화면이 먼저 말해 준다.
    issues.push({
      tab: "basic",
      message:
        "판매가가 0원이면 판매 상태를 '판매중' 으로 저장할 수 없습니다. 판매가를 넣거나 상태를 바꿔 주세요.",
      focusId: "p-price",
    });
  }

  const numberChecks: [string, string, string, { allowEmpty: boolean; min?: number }][] = [
    [form.compare_at_price, "정가", "p-compare", { allowEmpty: true, min: 0 }],
    [form.cost_price, "원가", "p-cost", { allowEmpty: true, min: 0 }],
    [form.low_stock_threshold, "재고 임계치", "p-threshold", { allowEmpty: false, min: 0 }],
    [form.units_per_pack, "구성 수량", "p-units", { allowEmpty: false, min: 1 }],
    [form.sort_order, "노출 순서", "p-sort", { allowEmpty: false }],
  ];
  if (isNew) numberChecks.push([form.stock, "최초 재고", "p-stock", { allowEmpty: false, min: 0 }]);
  for (const [raw, label, focusId, opts] of numberChecks) {
    const issue = checkNumber(raw, label, focusId, opts);
    if (issue) issues.push(issue);
  }

  /* ---------- 옵션 ---------- */
  if (variants.length > MAX_VARIANTS) {
    issues.push({
      tab: "variants",
      message: `옵션은 최대 ${MAX_VARIANTS}개까지 등록할 수 있습니다. ${
        variants.length - MAX_VARIANTS
      }개를 지워 주세요.`,
    });
  }

  const dup = duplicateVariantIndexes(variants);
  const basePrice = priceState.kind === "ok" ? priceState.value : 0;
  const reportedDupNames = new Set<string>();

  variants.forEach((v, i) => {
    const seat = `${i + 1}번째 옵션`;
    const label = v.name.trim() ? `'${v.name.trim()}'` : seat;

    if (!v.name.trim()) {
      issues.push({ tab: "variants", message: `${seat}의 이름을 입력해 주세요.` });
    } else if (dup.has(i) && !reportedDupNames.has(v.name.trim())) {
      // 같은 이름을 두 번 알리면 배지 숫자가 부풀어 오른다 — 이름당 한 번만 센다.
      reportedDupNames.add(v.name.trim());
      issues.push({
        tab: "variants",
        message: `${label} 옵션이 두 번 있습니다. 고객 화면에도 똑같은 줄이 두 개 뜨고 재고를 어느 쪽에 넣었는지 알 수 없게 됩니다.`,
      });
    }

    const delta = parseNumberField(v.price_delta);
    if (delta.kind === "invalid") {
      issues.push({
        tab: "variants",
        message: `${label} 옵션의 추가 금액에 숫자가 아닌 글자가 들어 있습니다.`,
      });
    } else if (delta.kind === "ok" && basePrice + delta.value < 0) {
      issues.push({
        tab: "variants",
        message: `${label} 옵션은 최종 판매가가 0원보다 작아집니다. 추가 금액을 다시 확인해 주세요.`,
      });
    }

    // 기존 옵션의 재고는 화면에서 못 고치게 막아 두었으므로(재고 관리 화면 전용) 새 옵션만 검사한다.
    if (!v.id) {
      const stock = parseNumberField(v.stock);
      if (stock.kind === "invalid") {
        issues.push({
          tab: "variants",
          message: `${label} 옵션의 최초 재고에 숫자가 아닌 글자가 들어 있습니다.`,
        });
      } else if (stock.kind === "ok" && stock.value < 0) {
        issues.push({ tab: "variants", message: `${label} 옵션의 최초 재고는 0개 이상이어야 합니다.` });
      }
    }
  });

  return issues;
}

/** 탭별 오류 개수 — 탭 배지가 쓴다 */
export function countIssuesByTab(issues: FormIssue[]): Record<FormTabKey, number> {
  const out: Record<FormTabKey, number> = { basic: 0, images: 0, variants: 0, detail: 0 };
  for (const issue of issues) out[issue.tab] += 1;
  return out;
}
