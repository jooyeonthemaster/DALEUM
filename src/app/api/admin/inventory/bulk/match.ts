/* ============================================================
   엑셀 한 줄 → 어느 품목인가 (짝 맞추기)

   route.ts 에서 떼어낸 이유는 길이만이 아니다. 짝 맞추기는 이 화면에서 가장 자주 틀리는
   부분이라 규칙이 한 곳에 모여 있어야 다음 사람이 읽고 고칠 수 있다.

   가장 아팠던 사고:
   실 DB 에 **첫 옵션의 품번이 상품 품번과 글자까지 똑같이** 들어 있다(옵션 18개 중 7개).
     모밀인데 곤약        품번 HS-MOMIL-320-4
       └ 320g × 4개      품번 HS-MOMIL-320-4   ← 같다
   그래서 품번 하나가 '상품 자체 재고' 행과 '320g × 4개' 옵션 행 둘을 가리켰고,
   일괄 입고는 그 줄을 "품번이 겹친다" 며 즉시 실패시켰다. 좁힐 방법이 아예 없어
   옵션 상품은 엑셀로 입고할 길이 없었다.
   → 품번이 겹치면 같은 줄의 상품명·옵션으로 한 번 더 좁힌다.
   ============================================================ */

import { PRODUCT_SCOPE_LABEL, matchKey, type RawProduct } from "../shared";

export interface Target {
  productId: string;
  variantId: string | null;
  /** 화면·결과표에 쓰는 사람 말 이름 */
  label: string;
  /** 장부 수량을 누적해 둘 때 쓰는 열쇠 */
  key: string;
  /** 2차 좁히기용 — 상품명 */
  nameKey: string;
  /** 2차 좁히기용 — 옵션 칸에 적힐 말 (옵션 없는 상품은 빈 값) */
  optionKey: string;
}

export interface MatchIndex {
  bySku: Map<string, Target[]>;
  byName: Map<string, Target[]>;
  productsByName: Map<string, RawProduct[]>;
  /** 처리하면서 갱신되는 장부 수량 (같은 품목이 여러 줄에 나올 수 있다) */
  stockOf: Map<string, number>;
}

export function buildMatchIndex(products: RawProduct[]): MatchIndex {
  const bySku = new Map<string, Target[]>();
  const byName = new Map<string, Target[]>();
  const productsByName = new Map<string, RawProduct[]>();
  const stockOf = new Map<string, number>();

  const push = (map: Map<string, Target[]>, key: string, t: Target) => {
    const list = map.get(key);
    if (list) list.push(t);
    else map.set(key, [t]);
  };

  for (const p of products) {
    const variants = p.product_variants ?? [];
    const hasOptions = variants.length > 0;

    const nameKey = matchKey(p.name);
    const sameName = productsByName.get(nameKey);
    if (sameName) sameName.push(p);
    else productsByName.set(nameKey, [p]);

    const productOptionKey = hasOptions ? matchKey(PRODUCT_SCOPE_LABEL) : "";
    const productTarget: Target = {
      productId: p.id,
      variantId: null,
      label: hasOptions ? `${p.name} — ${PRODUCT_SCOPE_LABEL}` : p.name,
      key: `${p.id}:`,
      nameKey,
      optionKey: productOptionKey,
    };
    stockOf.set(productTarget.key, p.stock);
    if (p.sku) push(bySku, matchKey(p.sku), productTarget);
    push(byName, `${nameKey}|${productOptionKey}`, productTarget);

    for (const v of variants) {
      const t: Target = {
        productId: p.id,
        variantId: v.id,
        label: `${p.name} — ${v.name}`,
        key: `${p.id}:${v.id}`,
        nameKey,
        optionKey: matchKey(v.name),
      };
      stockOf.set(t.key, v.stock);
      if (v.sku) push(bySku, matchKey(v.sku), t);
      push(byName, `${nameKey}|${matchKey(v.name)}`, t);
    }
  }

  return { bySku, byName, productsByName, stockOf };
}

export type MatchResult = { ok: true; target: Target } | { ok: false; message: string };

/**
 * 한 줄이 가리키는 품목을 찾는다.
 * 품번을 먼저 보는 것은 공급사 엑셀이 품번으로 오기 때문이고,
 * 품번이 겹치면 같은 줄의 상품명·옵션으로 좁힌다.
 */
export function resolveTarget(
  index: MatchIndex,
  cells: { sku: string; productName: string; optionName: string; fallbackLabel: string }
): MatchResult {
  const { sku, productName, optionName, fallbackLabel } = cells;

  if (sku) {
    let candidates = index.bySku.get(matchKey(sku)) ?? [];
    if (candidates.length === 0) {
      return { ok: false, message: `품번 '${sku}' 에 해당하는 품목이 없습니다.` };
    }

    // 2차 좁히기 — 같은 줄에 적힌 상품명·옵션으로 후보를 줄인다.
    // 좁혔더니 하나도 안 남으면(품번과 상품명이 서로 다른 품목을 가리키는 경우) 좁히기를 버리고
    // 아래의 '겹쳐 있다' 안내로 보낸다. 잘못 짚어 엉뚱한 품목의 재고를 건드리는 것보다 낫다.
    if (candidates.length > 1 && productName) {
      const narrowed = candidates.filter((t) => t.nameKey === matchKey(productName));
      if (narrowed.length > 0) candidates = narrowed;
    }
    if (candidates.length > 1 && optionName) {
      const narrowed = candidates.filter((t) => t.optionKey === matchKey(optionName));
      if (narrowed.length > 0) candidates = narrowed;
    }

    if (candidates.length === 1) return { ok: true, target: candidates[0] };
    return {
      ok: false,
      message: `품번 '${sku}' 이 여러 품목에 겹쳐 있습니다. 그 줄의 상품명과 옵션 칸을 채워 주시면 어느 것인지 알 수 있습니다.`,
    };
  }

  if (!productName) {
    return { ok: false, message: "품번 또는 상품명 중 하나는 적어야 합니다." };
  }

  const nameKey = matchKey(productName);
  const found = index.byName.get(`${nameKey}|${matchKey(optionName)}`) ?? [];
  if (found.length === 1) return { ok: true, target: found[0] };
  if (found.length > 1) {
    return {
      ok: false,
      message: `'${fallbackLabel}' 과 이름이 같은 품목이 여러 개라 어느 것인지 알 수 없습니다. 품번으로 적어 주세요.`,
    };
  }

  const sameNamed = index.productsByName.get(nameKey) ?? [];
  if (sameNamed.length === 0) {
    return {
      ok: false,
      message: `'${productName}' 이라는 상품을 찾을 수 없습니다. 상품명이 정확한지 확인해 주세요.`,
    };
  }
  if (!optionName && (sameNamed[0].product_variants ?? []).length > 0) {
    return {
      ok: false,
      message: `'${productName}' 은 옵션으로 파는 상품입니다. 옵션 칸에 옵션 이름 또는 '${PRODUCT_SCOPE_LABEL}' 을 적어 주세요.`,
    };
  }
  return { ok: false, message: `'${productName}' 상품에 '${optionName}' 옵션이 없습니다.` };
}
