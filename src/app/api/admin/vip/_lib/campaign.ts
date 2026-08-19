import type { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { krw } from "@/lib/format";
import { isUuid, jsonError, posInt } from "./validate";

/* ============================================================
   VIP 캠페인 공통 — 상품 큐레이션 검증
   ============================================================ */

/**
 * 목록 조회 select.
 * 예전에는 상품 개수만(count) 읽었는데, 목록에서 캠페인을 알아볼 단서가
 * 제목과 난수 토큰뿐이라 토큰이 부제처럼 붙어 있었다. 토큰을 걷어내는 대신
 * '상품 3개 · 평균 22% 할인' 같은 사람이 읽는 요약을 보여 주려면
 * 담긴 상품의 캠페인가와 기본 판매가가 필요하다.
 */
export const CAMPAIGN_LIST_SELECT =
  "*, vip_groups(id, name), profiles(id, name, email), vip_campaign_items(custom_price, products(price))";

/** 상세 조회 select (큐레이션 상품 포함 — 원가는 마진 판단용, 고객 화면에는 나가지 않는다) */
export const CAMPAIGN_DETAIL_SELECT =
  "*, vip_groups(id, name), profiles(id, name, email), vip_campaign_items(id, product_id, custom_price, sort_order, products(id, name, price, cost_price, status))";

export interface CampaignItemRow {
  product_id: string;
  custom_price: number;
  sort_order: number;
}

/**
 * 캠페인 상품 항목 검증 — 배열 순서가 곧 진열 순서(sort_order)가 된다.
 * 각 항목: { product_id, custom_price } / 캠페인가는 정가를 넘을 수 없다.
 */
export async function validateCampaignItems(
  service: SupabaseClient,
  raw: unknown
): Promise<{ error: NextResponse } | { rows: CampaignItemRow[] }> {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: jsonError("캠페인에 담을 상품을 1개 이상 추가해 주세요.") };
  }
  if (raw.length > 50) {
    return { error: jsonError("캠페인 상품은 최대 50개까지 담을 수 있습니다.") };
  }

  const rows: CampaignItemRow[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i] as Record<string, unknown> | null;
    if (!item || typeof item !== "object" || !isUuid(item.product_id)) {
      return { error: jsonError("상품 항목 형식이 올바르지 않습니다.") };
    }
    if (seen.has(item.product_id)) {
      return { error: jsonError("같은 상품이 중복으로 포함되어 있습니다.") };
    }
    seen.add(item.product_id);

    const price = posInt(item.custom_price);
    if (price === undefined) {
      return { error: jsonError("캠페인가는 1원 이상의 정수여야 합니다.") };
    }
    rows.push({ product_id: item.product_id, custom_price: price, sort_order: i });
  }

  const { data: products, error } = await service
    .from("products")
    .select("id, name, price")
    .in(
      "id",
      rows.map((r) => r.product_id)
    );
  if (error) return { error: jsonError("상품 정보를 확인하지 못했습니다.", 500) };

  const productMap = new Map(
    ((products ?? []) as { id: string; name: string; price: number }[]).map((p) => [p.id, p])
  );
  for (const row of rows) {
    const product = productMap.get(row.product_id);
    if (!product) return { error: jsonError("존재하지 않는 상품이 포함되어 있습니다.", 404) };
    if (row.custom_price > product.price) {
      return {
        error: jsonError(
          `'${product.name}'의 캠페인가는 기본 판매가 ${krw(product.price)}원을 넘을 수 없습니다.`
        ),
      };
    }
  }

  return { rows };
}

/** 목록 행에 붙일 요약 — 담긴 상품 수와 평균 할인율(%) */
export function summarizeItems(
  items: { custom_price: number; products: { price: number } | null }[] | null | undefined
): { item_count: number; avg_discount_rate: number | null } {
  const rows = items ?? [];
  const rates: number[] = [];
  for (const row of rows) {
    const base = row.products?.price;
    if (base && base > 0 && row.custom_price <= base) {
      rates.push(((base - row.custom_price) / base) * 100);
    }
  }
  return {
    item_count: rows.length,
    avg_discount_rate:
      rates.length > 0 ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : null,
  };
}
