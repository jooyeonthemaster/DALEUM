import type { SupabaseClient } from "@supabase/supabase-js";
import type { Product, VipProductPrice } from "./types";

/**
 * VIP 가격 해석 — 우선순위:
 * 1. 개별 고객 상품 지정가/할인율 (vip_product_prices.user_id)
 * 2. 그룹 상품 지정가/할인율 (vip_product_prices.group_id)
 * 3. 그룹 전체 할인율 (vip_groups.discount_rate)
 * 4. 기본 판매가
 */

export interface VipContext {
  userId: string | null;
  groupId: string | null;
  groupDiscountRate: number; // %
}

const EMPTY_CONTEXT: VipContext = { userId: null, groupId: null, groupDiscountRate: 0 };

/** 현재 사용자/VIP코드 쿠키로부터 VIP 컨텍스트 해석 (service client 필요) */
export async function resolveVipContext(
  service: SupabaseClient,
  opts: { userId?: string | null; vipCode?: string | null }
): Promise<VipContext> {
  // 1) 로그인 사용자의 VIP 멤버십
  if (opts.userId) {
    const { data: member } = await service
      .from("vip_members")
      .select("group_id, vip_groups(id, discount_rate, is_active)")
      .eq("user_id", opts.userId)
      .maybeSingle();
    const group = member?.vip_groups as unknown as
      | { id: string; discount_rate: number; is_active: boolean }
      | null;
    if (member && group?.is_active) {
      return {
        userId: opts.userId,
        groupId: member.group_id,
        groupDiscountRate: Number(group.discount_rate) || 0,
      };
    }
  }

  // 2) VIP 코드 (게스트/코드 입장)
  if (opts.vipCode) {
    const { data: code } = await service
      .from("vip_access_codes")
      .select("group_id, is_active, expires_at, max_uses, used_count, vip_groups(id, discount_rate, is_active)")
      .eq("code", opts.vipCode.toUpperCase())
      .maybeSingle();
    const group = code?.vip_groups as unknown as
      | { id: string; discount_rate: number; is_active: boolean }
      | null;
    const notExpired = !code?.expires_at || new Date(code.expires_at) > new Date();
    const underLimit = code?.max_uses == null || code.used_count < code.max_uses;
    if (code?.is_active && notExpired && underLimit && group?.is_active) {
      return {
        userId: opts.userId ?? null,
        groupId: code.group_id,
        groupDiscountRate: Number(group.discount_rate) || 0,
      };
    }
  }

  return { ...EMPTY_CONTEXT, userId: opts.userId ?? null };
}

function overrideToPrice(base: number, o: VipProductPrice): number {
  if (o.custom_price != null) return o.custom_price;
  if (o.discount_rate != null) return Math.floor((base * (100 - Number(o.discount_rate))) / 100 / 10) * 10;
  return base;
}

function isOverrideLive(o: VipProductPrice): boolean {
  const now = new Date();
  if (!o.is_active) return false;
  if (o.starts_at && new Date(o.starts_at) > now) return false;
  if (o.ends_at && new Date(o.ends_at) < now) return false;
  return true;
}

/** 상품 목록에 대한 VIP 가격 일괄 해석 */
export async function resolvePrices<T extends Pick<Product, "id" | "price">>(
  service: SupabaseClient,
  products: T[],
  ctx: VipContext
): Promise<Map<string, { effective: number; vipApplied: boolean }>> {
  const result = new Map<string, { effective: number; vipApplied: boolean }>();
  for (const p of products) result.set(p.id, { effective: p.price, vipApplied: false });
  if (!ctx.groupId && !ctx.userId) return result;

  const ids = products.map((p) => p.id);
  const ors: string[] = [];
  if (ctx.userId) ors.push(`user_id.eq.${ctx.userId}`);
  if (ctx.groupId) ors.push(`group_id.eq.${ctx.groupId}`);

  let overrides: VipProductPrice[] = [];
  if (ors.length > 0) {
    const { data } = await service
      .from("vip_product_prices")
      .select("*")
      .in("product_id", ids)
      .or(ors.join(","));
    overrides = (data ?? []) as VipProductPrice[];
  }

  for (const p of products) {
    const base = p.price;
    const mine = overrides.filter((o) => o.product_id === p.id && isOverrideLive(o));
    const userOverride = ctx.userId ? mine.find((o) => o.user_id === ctx.userId) : undefined;
    const groupOverride = ctx.groupId ? mine.find((o) => o.group_id === ctx.groupId) : undefined;

    let effective = base;
    let vipApplied = false;

    if (userOverride) {
      effective = overrideToPrice(base, userOverride);
      vipApplied = true;
    } else if (groupOverride) {
      effective = overrideToPrice(base, groupOverride);
      vipApplied = true;
    } else if (ctx.groupDiscountRate > 0) {
      effective = Math.floor((base * (100 - ctx.groupDiscountRate)) / 100 / 10) * 10;
      vipApplied = true;
    }

    result.set(p.id, { effective: Math.max(0, effective), vipApplied });
  }
  return result;
}

/** 단일 상품 가격 해석 */
export async function resolvePrice(
  service: SupabaseClient,
  product: Pick<Product, "id" | "price">,
  ctx: VipContext
): Promise<{ effective: number; vipApplied: boolean }> {
  const map = await resolvePrices(service, [product], ctx);
  return map.get(product.id) ?? { effective: product.price, vipApplied: false };
}
