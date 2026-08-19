import type { SupabaseClient } from "@supabase/supabase-js";

/* ============================================================
   재고 API 공용 — 상품/옵션을 "재고 단위 행"으로 펼치는 규칙

   왜 별도 파일인가:
   목록(GET)과 엑셀 일괄 입고(bulk)가 같은 판정을 써야 한다. 두 곳에서 따로 계산하면
   화면이 "잠김"이라 경고한 상품을 엑셀 쪽은 멀쩡하다고 보는 식으로 어긋난다.

   여기서 가장 중요한 규칙(고객 화면 잠김):
   고객 상세페이지는 옵션 유무와 상관없이 상품 자체 재고만 보고 품절을 판정한다.
     src/app/(shop)/products/[slug]/page.tsx  — status === "sold_out" || product.stock <= 0
     src/components/shop/ProductCard.tsx      — 같은 식
   그래서 옵션 재고가 900개여도 상품 자체 재고가 0이면 상품 전체가 품절로 잠긴다.
   반면 주문이 나갈 때는 옵션 재고만 줄어든다(src/lib/orders.ts — p_variant_id 로 차감).
   즉 옵션 상품의 상품 자체 재고는 "팔려도 줄지 않는데 0이면 판매를 막는" 숫자다.
   이 숫자가 지금까지 재고 화면에 아예 보이지 않아 원인을 찾을 수 없었다 — 그래서 행으로 낸다.
   ============================================================ */

/** products 조회 시 필요한 컬럼 — 목록/일괄 처리에서 동일하게 쓴다 */
export const INVENTORY_PRODUCT_SELECT =
  "id, name, sku, stock, low_stock_threshold, status, product_images(url, sort_order, is_primary), product_variants(id, name, stock, sku, is_active, sort_order)";

export interface RawProduct {
  id: string;
  name: string;
  sku: string | null;
  stock: number;
  low_stock_threshold: number;
  status: string;
  product_images: { url: string; sort_order: number; is_primary: boolean }[] | null;
  product_variants:
    | { id: string; name: string; stock: number; sku: string | null; is_active: boolean; sort_order: number }[]
    | null;
}

/** 상품 상태와 재고가 어긋난 형태 */
export type StockMismatch = "empty_but_selling" | "stocked_but_sold_out" | null;

export interface InventoryUnitRow {
  product_id: string;
  variant_id: string | null;
  /** product = 상품 자체 재고 행 / variant = 옵션 재고 행 */
  scope: "product" | "variant";
  name: string;
  option_name: string | null;
  sku: string | null;
  stock: number;
  /** 옵션 상품의 상품 자체 재고 행에는 임박 기준이 의미가 없어 null */
  threshold: number | null;
  status: string;
  /** 옵션 판매중 여부 (옵션 없는 상품·상품 자체 재고 행은 항상 true) */
  is_active: boolean;
  /**
   * 이 행만의 품번인가.
   * 옵션 행의 sku 는 옵션에 품번이 없으면 상품 품번을 대신 보여 준다(화면·검색 편의).
   * 그런데 실 DB 에는 첫 옵션의 품번이 상품 품번과 **글자까지 똑같이** 들어 있다(옵션 18개 중 7개).
   * 그래서 엑셀 양식에 그 품번을 그대로 찍으면 한 품번이 두 행을 가리켜 일괄 입고가 통째로 거절됐다.
   * 양식은 이 값이 false 인 행의 품번 칸을 비워 두고 상품명·옵션으로 짝을 맞추게 한다.
   */
  has_own_sku: boolean;
  thumbnail: string | null;
  /** 품절/임박 집계에 세는 행인가 — 옵션 상품의 상품 자체 재고 행은 제외한다 */
  counts_as_unit: boolean;
  /* ---- 아래는 같은 상품의 모든 행이 공유하는 상품 단위 판정 ---- */
  has_options: boolean;
  active_option_count: number;
  option_stock_total: number;
  product_stock: number;
  /** 고객이 지금 실제로 살 수 있는 수량 */
  sellable_stock: number;
  /** 옵션 재고가 남아 있는데도 상품 자체 재고 0 때문에 통째로 품절로 잠긴 상태 */
  storefront_locked: boolean;
  /** 옵션을 전부 판매 중지해서 고객이 옵션 없이 상품 자체 재고로 사게 된 상태 */
  options_all_off: boolean;
  status_mismatch: StockMismatch;
  last_log: { delta: number; reason: string; created_at: string } | null;
}

function thumbnailOf(p: RawProduct): string | null {
  const imgs = [...(p.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  return imgs.find((i) => i.is_primary)?.url ?? imgs[0]?.url ?? null;
}

/** 상품 목록을 재고 단위 행으로 펼친다. 옵션 상품은 [상품 자체 재고, 옵션…] 순으로 붙는다. */
export function buildInventoryRows(products: RawProduct[]): InventoryUnitRow[] {
  const rows: InventoryUnitRow[] = [];

  for (const p of products) {
    const thumbnail = thumbnailOf(p);
    const variants = [...(p.product_variants ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    const activeVariants = variants.filter((v) => v.is_active);
    const hasOptions = variants.length > 0;
    const optionStockTotal = activeVariants.reduce((s, v) => s + v.stock, 0);
    const optionsAllOff = hasOptions && activeVariants.length === 0;

    // 옵션이 살아 있는 상품만 "잠김"이 성립한다.
    // 옵션을 전부 껐다면 고객 화면은 옵션 없는 상품처럼 상품 자체 재고로 팔기 때문이다.
    //
    // status === "active" 를 함께 보는 이유(빠져 있어 임시저장·숨김·품절 상품까지 셌다):
    //  · 고객 화면에 나가는 상태는 active / sold_out 둘뿐이다(src/lib/cache.ts VISIBLE_STATUSES).
    //    임시저장·숨김 상품은 애초에 노출되지 않으므로 "고객 화면에서 품절" 이라는 말 자체가 거짓이다.
    //  · 품절 상태 상품은 재고와 무관하게 늘 품절로 보이고 주문도 막힌다
    //    (src/app/(shop)/products/[slug]/page.tsx:288 · src/lib/orders.ts:281).
    //    즉 상품 자체 재고를 채워도 풀리지 않으므로 '잠김 풀기' 안내가 사실과 어긋난다.
    //    이쪽은 잠김이 아니라 '판매 상태를 판매중으로' 가 해답이라 문구를 따로 쓴다.
    const storefrontLocked =
      p.status === "active" && hasOptions && !optionsAllOff && p.stock <= 0;

    const sellable = !hasOptions || optionsAllOff
      ? p.stock
      : p.stock <= 0
        ? 0
        : optionStockTotal;

    // 잠긴 상품은 여기서 빼 둔다.
    // 잠김 상태는 판매 가능 수량이 0으로 계산되므로 그대로 두면 '판매중인데 재고 없음'으로 잡히고,
    // 관리자가 안내대로 '품절로 맞추기'를 누르면 팔 물건이 있는 상품을 스스로 내려 버린다.
    // 잠김은 별도 경고와 잠김 풀기로 해결할 문제다.
    const mismatch: StockMismatch = storefrontLocked
      ? null
      : p.status === "active" && sellable <= 0
        ? "empty_but_selling"
        : p.status === "sold_out" && sellable > 0
          ? "stocked_but_sold_out"
          : null;

    const shared = {
      product_id: p.id,
      name: p.name,
      status: p.status,
      thumbnail,
      has_options: hasOptions,
      active_option_count: activeVariants.length,
      option_stock_total: optionStockTotal,
      product_stock: p.stock,
      sellable_stock: sellable,
      storefront_locked: storefrontLocked,
      options_all_off: optionsAllOff,
      status_mismatch: mismatch,
      last_log: null,
    };

    rows.push({
      ...shared,
      variant_id: null,
      scope: "product",
      option_name: null,
      sku: p.sku,
      stock: p.stock,
      // 옵션 상품의 상품 자체 재고에는 임박 기준을 적용하지 않는다(팔려도 줄지 않는 숫자라 의미가 없다)
      threshold: hasOptions ? null : p.low_stock_threshold,
      is_active: true,
      has_own_sku: !!p.sku,
      counts_as_unit: !hasOptions,
    });

    for (const v of variants) {
      rows.push({
        ...shared,
        variant_id: v.id,
        scope: "variant",
        option_name: v.name,
        sku: v.sku ?? p.sku,
        stock: v.stock,
        threshold: p.low_stock_threshold,
        is_active: v.is_active,
        // 상품 품번을 물려받아 보여 주는 것뿐이거나, 저장된 값이 상품 품번과 같으면
        // 그 품번으로는 이 행을 특정할 수 없다 (엑셀 양식이 이 값을 보고 품번 칸을 비운다)
        has_own_sku: !!v.sku && matchKey(v.sku) !== matchKey(p.sku ?? ""),
        counts_as_unit: true,
      });
    }
  }

  return rows;
}

/** 판매 중인 것만 — 상품 상태가 판매중/품절이고, 옵션이라면 판매중인 옵션 */
export function isSellingRow(r: InventoryUnitRow): boolean {
  if (r.status !== "active" && r.status !== "sold_out") return false;
  return r.scope === "product" ? true : r.is_active;
}

/** 이름 매칭용 정규화 — 엑셀에서 붙여넣은 공백·전각 공백 차이를 흡수한다 */
export function matchKey(v: string): string {
  return v.replace(/[\s\u00a0\u3000]+/g, "").toLowerCase();
}

/* ------------------------------------------------------------
   재고 증감 실행 — 단건(POST)과 엑셀 일괄(bulk)이 같은 함수를 쓴다.
   두 곳이 각자 rpc 를 호출하면 오류 문구가 갈라져 같은 실패가 다르게 보인다.
   ------------------------------------------------------------ */

/** 옵션 상품의 "상품 자체 재고" 행을 엑셀에서 가리킬 때 쓰는 옵션 칸 표기 */
export const PRODUCT_SCOPE_LABEL = "상품 자체 재고";

/**
 * 지금 재고 읽기.
 * "몇 개에서 몇 개가 됐는지" 안내와 실사(목표 수량) 계산에 필요하다.
 * 단건 조정·되돌리기가 각자 읽으면 한쪽만 옵션 재고를 보는 식으로 갈라지므로 여기 하나만 둔다.
 */
export async function readStock(
  service: SupabaseClient,
  productId: string,
  variantId: string | null
): Promise<number | null> {
  if (variantId) {
    const { data } = await service
      .from("product_variants")
      .select("stock")
      .eq("id", variantId)
      .maybeSingle();
    return (data?.stock as number | undefined) ?? null;
  }
  const { data } = await service.from("products").select("stock").eq("id", productId).maybeSingle();
  return (data?.stock as number | undefined) ?? null;
}

export type AdjustResult =
  | { ok: true }
  | { ok: false; kind: "insufficient" | "notfound" | "unknown"; message: string };

export async function adjustStockRpc(
  service: SupabaseClient,
  input: {
    productId: string;
    variantId: string | null;
    delta: number;
    reason: "restock" | "adjust";
    memo: string | null;
  }
): Promise<AdjustResult> {
  const { error } = await service.rpc("adjust_stock", {
    p_product_id: input.productId,
    p_variant_id: input.variantId,
    p_delta: input.delta,
    p_reason: input.reason,
    p_ref_order_id: null,
    p_memo: input.memo,
  });
  if (!error) return { ok: true };

  if (error.message.includes("insufficient stock")) {
    return {
      ok: false,
      kind: "insufficient",
      message: "차감 후 재고가 0보다 작아져 처리하지 못했습니다. 현재고를 확인해 주세요.",
    };
  }
  if (error.message.includes("not found")) {
    return { ok: false, kind: "notfound", message: "상품 또는 옵션을 찾을 수 없습니다." };
  }
  console.error("[admin/inventory] 재고 조정 실패:", error.message);
  return { ok: false, kind: "unknown", message: "재고 조정에 실패했습니다." };
}
