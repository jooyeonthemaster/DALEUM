import type { SupabaseClient } from "@supabase/supabase-js";
import type { Coupon, OrdererInfo, RecipientInfo } from "./types";
import { resolveVipContext, resolvePrice, type VipContext } from "./pricing";
import { getShippingSettings, calcShippingFee } from "./shipping";
import { krw } from "./format";
import type { TossPayment } from "./toss";

/* ============================================================
   주문 생성 핵심 로직 — 서버가 진실의 원천.
   클라이언트가 보낸 금액은 절대 신뢰하지 않고
   모든 단가/할인/배송비를 DB 기준으로 재계산한다.
   ============================================================ */

/** 주문 도메인 에러 — API 라우트에서 status로 매핑 */
export class OrderError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "OrderError";
    this.status = status;
  }
}

export interface OrderDraftItem {
  productId: string;
  variantId?: string | null;
  qty: number;
  /** VIP 캠페인(시크릿 페이지) 경유 주문이면 캠페인 id */
  campaignId?: string | null;
}

export interface OrderDraft {
  items: OrderDraftItem[];
  orderer: OrdererInfo;
  recipient: RecipientInfo;
  couponCode?: string | null;
}

/** 단가 스냅샷이 확정된 주문 라인 */
export interface OrderLine {
  productId: string;
  variantId: string | null;
  qty: number;
  /** 실제 판매 단가 (캠페인/VIP 반영, 쿠폰 제외) */
  unitPrice: number;
  /** 당시 정상가 (옵션 추가금 포함) */
  originalPrice: number;
  nameSnapshot: string;
  optionSnapshot: string | null;
  imageUrl: string | null;
  campaignId: string | null;
}

export interface BuiltOrder {
  /** 정상가 기준 상품 합계 */
  subtotal: number;
  /** 총 할인액 (VIP/캠페인 할인 + 쿠폰 할인) */
  discountTotal: number;
  /** 쿠폰 할인액 (discountTotal에 포함됨) */
  couponDiscount: number;
  shippingFee: number;
  /** 최종 결제 금액 = subtotal - discountTotal + shippingFee */
  total: number;
  lines: OrderLine[];
  vipContext: VipContext;
  coupon: Coupon | null;
  /** 주문에 기록할 캠페인 id (라인 중 첫 캠페인) */
  vipCampaignId: string | null;
  /** 실제 가격 적용에 사용된 VIP 코드 (멤버십이 우선이면 null) */
  vipCode: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/** 라인당 최대 수량 / 주문당 최대 라인 수 */
const MAX_QTY_PER_LINE = 99;
const MAX_LINES = 30;

interface ProductRow {
  id: string;
  name: string;
  price: number;
  stock: number;
  status: string;
  product_images: { url: string; is_primary: boolean; sort_order: number }[];
  product_variants: {
    id: string;
    name: string;
    price_delta: number;
    stock: number;
    is_active: boolean;
  }[];
}

interface CampaignRow {
  id: string;
  group_id: string | null;
  target_user_id: string | null;
  expires_at: string | null;
  is_active: boolean;
}

function primaryImage(p: ProductRow): string | null {
  const imgs = [...(p.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  return imgs.find((i) => i.is_primary)?.url ?? imgs[0]?.url ?? null;
}

/** 동일 상품+옵션+캠페인 라인 병합 (재고 검증 정확도 확보) */
function mergeItems(items: OrderDraftItem[]): OrderDraftItem[] {
  const map = new Map<string, OrderDraftItem>();
  for (const it of items) {
    const key = `${it.productId}::${it.variantId ?? ""}::${it.campaignId ?? ""}`;
    const prev = map.get(key);
    if (prev) prev.qty += it.qty;
    else map.set(key, { ...it, variantId: it.variantId ?? null, campaignId: it.campaignId ?? null });
  }
  return [...map.values()];
}

/**
 * 쿠폰 유효성 검증 + 할인액 계산.
 * @param itemsTotal VIP/캠페인 할인이 반영된 상품 합계 (배송비 제외)
 * @throws OrderError 유효하지 않으면 사유와 함께 throw
 */
export async function validateCoupon(
  service: SupabaseClient,
  code: string,
  itemsTotal: number,
  userId?: string | null
): Promise<{ coupon: Coupon; discount: number }> {
  const trimmed = code.trim();
  if (!trimmed) throw new OrderError("쿠폰 코드를 입력해 주세요.", 400);

  let { data: coupon } = await service
    .from("coupons")
    .select("*")
    .eq("code", trimmed)
    .maybeSingle();
  if (!coupon && trimmed !== trimmed.toUpperCase()) {
    const retry = await service
      .from("coupons")
      .select("*")
      .eq("code", trimmed.toUpperCase())
      .maybeSingle();
    coupon = retry.data;
  }
  if (!coupon) throw new OrderError("존재하지 않는 쿠폰 코드입니다.", 404);

  const c = coupon as Coupon;
  const now = new Date();

  if (!c.is_active) throw new OrderError("사용이 중지된 쿠폰입니다.", 400);
  if (c.starts_at && new Date(c.starts_at) > now)
    throw new OrderError("아직 사용 기간이 시작되지 않은 쿠폰입니다.", 400);
  if (c.ends_at && new Date(c.ends_at) < now)
    throw new OrderError("유효 기간이 지난 쿠폰입니다.", 400);
  if (c.usage_limit != null && c.used_count >= c.usage_limit)
    throw new OrderError("준비된 수량이 모두 소진된 쿠폰입니다.", 400);
  if (itemsTotal < c.min_order)
    throw new OrderError(`${krw(c.min_order)}원 이상 주문 시 사용할 수 있는 쿠폰입니다.`, 400);

  // 회원별 사용 한도 (비회원은 추적 불가 — 회원만 검증)
  if (userId && c.per_user_limit > 0) {
    const { count } = await service
      .from("coupon_redemptions")
      .select("id", { count: "exact", head: true })
      .eq("coupon_id", c.id)
      .eq("user_id", userId);
    if ((count ?? 0) >= c.per_user_limit)
      throw new OrderError("이미 사용한 쿠폰입니다.", 400);
  }

  let discount = 0;
  if (c.discount_type === "rate") {
    discount = Math.floor((itemsTotal * c.value) / 100);
    if (c.max_discount != null) discount = Math.min(discount, c.max_discount);
  } else {
    discount = c.value;
  }
  discount = Math.max(0, Math.min(discount, itemsTotal));

  return { coupon: c, discount };
}

/**
 * 주문 초안 → 서버 기준 금액 확정.
 * 상품 상태/재고 검증, VIP·캠페인 단가 해석, 쿠폰·배송비 계산까지 수행한다.
 * @throws OrderError 검증 실패 시 (재고 부족은 status 409)
 */
export async function buildOrder(
  service: SupabaseClient,
  draft: OrderDraft,
  opts: { userId?: string | null; vipCode?: string | null } = {}
): Promise<BuiltOrder> {
  if (!Array.isArray(draft.items) || draft.items.length === 0)
    throw new OrderError("주문할 상품이 없습니다.", 400);

  const items = mergeItems(draft.items);
  if (items.length > MAX_LINES)
    throw new OrderError(`한 번에 주문할 수 있는 상품 종류는 최대 ${MAX_LINES}개입니다.`, 400);

  for (const it of items) {
    if (!isUuid(it.productId)) throw new OrderError("잘못된 상품 정보입니다.", 400);
    if (it.variantId != null && !isUuid(it.variantId))
      throw new OrderError("잘못된 옵션 정보입니다.", 400);
    if (it.campaignId != null && !isUuid(it.campaignId))
      throw new OrderError("잘못된 캠페인 정보입니다.", 400);
    if (!Number.isInteger(it.qty) || it.qty < 1 || it.qty > MAX_QTY_PER_LINE)
      throw new OrderError("주문 수량이 올바르지 않습니다.", 400);
  }

  // ---------- 상품 조회 ----------
  const productIds = [...new Set(items.map((i) => i.productId))];
  const { data: productRows, error: productError } = await service
    .from("products")
    .select(
      "id, name, price, stock, status, product_images(url, is_primary, sort_order), product_variants(id, name, price_delta, stock, is_active)"
    )
    .in("id", productIds);
  if (productError) throw new OrderError("상품 정보를 불러오지 못했습니다.", 500);

  const products = new Map<string, ProductRow>(
    ((productRows ?? []) as unknown as ProductRow[]).map((p) => [p.id, p])
  );

  // ---------- VIP 컨텍스트 (멤버십 우선, 없으면 코드) ----------
  let vipContext = await resolveVipContext(service, { userId: opts.userId ?? null });
  let usedVipCode: string | null = null;
  if (!vipContext.groupId && opts.vipCode) {
    const byCode = await resolveVipContext(service, {
      userId: opts.userId ?? null,
      vipCode: opts.vipCode,
    });
    if (byCode.groupId) {
      vipContext = byCode;
      usedVipCode = opts.vipCode.trim().toUpperCase();
    }
  }

  // ---------- 캠페인 검증 + 캠페인 지정가 ----------
  const campaignIds = [...new Set(items.map((i) => i.campaignId).filter((v): v is string => !!v))];
  const campaignPrices = new Map<string, Map<string, number>>(); // campaignId → (productId → custom_price)
  for (const cid of campaignIds) {
    const { data: camp } = await service
      .from("vip_campaigns")
      .select("id, group_id, target_user_id, expires_at, is_active")
      .eq("id", cid)
      .maybeSingle();
    const campaign = camp as CampaignRow | null;
    if (!campaign || !campaign.is_active)
      throw new OrderError("유효하지 않은 캠페인입니다.", 400);
    if (campaign.expires_at && new Date(campaign.expires_at) < new Date())
      throw new OrderError("이미 종료된 캠페인입니다.", 400);
    if (campaign.target_user_id && campaign.target_user_id !== (opts.userId ?? null))
      throw new OrderError("이 캠페인은 지정된 고객만 이용할 수 있습니다.", 403);

    const { data: campItems } = await service
      .from("vip_campaign_items")
      .select("product_id, custom_price")
      .eq("campaign_id", cid);
    campaignPrices.set(
      cid,
      new Map(
        ((campItems ?? []) as { product_id: string; custom_price: number }[]).map((ci) => [
          ci.product_id,
          ci.custom_price,
        ])
      )
    );
  }

  // ---------- 라인별 단가 확정 ----------
  const lines: OrderLine[] = [];
  for (const it of items) {
    const product = products.get(it.productId);
    if (!product) throw new OrderError("판매 중이지 않은 상품이 포함되어 있습니다.", 400);
    if (product.status !== "active") {
      if (product.status === "sold_out")
        throw new OrderError(`품절된 상품입니다: ${product.name}`, 409);
      throw new OrderError("판매 중이지 않은 상품이 포함되어 있습니다.", 400);
    }

    let variant: ProductRow["product_variants"][number] | null = null;
    if (it.variantId) {
      variant = product.product_variants?.find((v) => v.id === it.variantId) ?? null;
      if (!variant || !variant.is_active)
        throw new OrderError(`선택한 옵션을 찾을 수 없습니다: ${product.name}`, 400);
    }

    // 재고 검증 (옵션이 있으면 옵션 재고 기준)
    const available = variant ? variant.stock : product.stock;
    if (available < it.qty)
      throw new OrderError(
        `재고가 부족합니다: ${product.name}${variant ? ` (${variant.name})` : ""} — 남은 수량 ${Math.max(0, available)}개`,
        409
      );

    const originalPrice = product.price + (variant?.price_delta ?? 0);

    // 단가 우선순위: 캠페인 지정가 > VIP 가격(개별 > 그룹 지정가 > 그룹 할인율) > 정상가
    let unitPrice: number;
    if (it.campaignId) {
      const custom = campaignPrices.get(it.campaignId)?.get(it.productId);
      if (custom == null)
        throw new OrderError(`캠페인 대상 상품이 아닙니다: ${product.name}`, 400);
      unitPrice = custom;
    } else {
      const resolved = await resolvePrice(
        service,
        { id: product.id, price: originalPrice },
        vipContext
      );
      unitPrice = resolved.effective;
    }
    unitPrice = Math.max(0, Math.min(unitPrice, originalPrice));

    lines.push({
      productId: product.id,
      variantId: variant?.id ?? null,
      qty: it.qty,
      unitPrice,
      originalPrice,
      nameSnapshot: product.name,
      optionSnapshot: variant?.name ?? null,
      imageUrl: primaryImage(product),
      campaignId: it.campaignId ?? null,
    });
  }

  // ---------- 금액 집계 ----------
  const subtotal = lines.reduce((sum, l) => sum + l.originalPrice * l.qty, 0);
  const itemsTotal = lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0); // VIP/캠페인 반영
  const vipDiscount = subtotal - itemsTotal;

  // ---------- 쿠폰 ----------
  let coupon: Coupon | null = null;
  let couponDiscount = 0;
  if (draft.couponCode) {
    const result = await validateCoupon(service, draft.couponCode, itemsTotal, opts.userId);
    coupon = result.coupon;
    couponDiscount = result.discount;
  }

  const discountTotal = vipDiscount + couponDiscount;

  // ---------- 배송비 (할인 반영된 소계 기준) ----------
  const shippingSettings = await getShippingSettings(service);
  const shippingFee = calcShippingFee(itemsTotal - couponDiscount, shippingSettings);

  const total = subtotal - discountTotal + shippingFee;
  if (total < 0 || !Number.isSafeInteger(total))
    throw new OrderError("주문 금액 계산에 실패했습니다.", 500);

  return {
    subtotal,
    discountTotal,
    couponDiscount,
    shippingFee,
    total,
    lines,
    vipContext,
    coupon,
    vipCampaignId: lines.find((l) => l.campaignId)?.campaignId ?? null,
    vipCode: usedVipCode,
  };
}

/* ============================================================
   결제 확정 후처리 — confirm API와 웹훅이 공유 (멱등)
   ============================================================ */

export interface FinalizableOrder {
  id: string;
  order_no: string;
  total: number;
  user_id: string | null;
  vip_code: string | null;
  coupon_id: string | null;
  order_items: { product_id: string | null; variant_id: string | null; qty: number }[];
}

/** orders.admin_memo에 운영 메모 한 줄 추가 (기존 메모 보존) */
export async function appendAdminMemo(
  service: SupabaseClient,
  orderId: string,
  note: string
): Promise<void> {
  const stamped = `[${new Date().toISOString()}] ${note}`;
  const { data } = await service
    .from("orders")
    .select("admin_memo")
    .eq("id", orderId)
    .maybeSingle();
  const memo = data?.admin_memo ? `${data.admin_memo}\n${stamped}` : stamped;
  await service.from("orders").update({ admin_memo: memo }).eq("id", orderId);
}

/**
 * 결제 승인 확정 처리: pending → paid 전환(멱등 클레임), payments 기록,
 * 재고 차감, VIP 코드/쿠폰 사용 카운트.
 * pending → paid 조건부 업데이트를 먼저 수행해 confirm/웹훅 동시 호출에도
 * 부수효과(재고 차감·카운트)가 정확히 한 번만 실행된다.
 *
 * @returns claimed=false면 이미 다른 경로에서 처리 완료 (멱등 성공)
 */
export async function finalizePaidOrder(
  service: SupabaseClient,
  order: FinalizableOrder,
  payment: TossPayment
): Promise<{ claimed: boolean }> {
  // 1) 멱등 클레임: pending인 경우에만 paid로 전환
  const { data: claimedRows, error: claimError } = await service
    .from("orders")
    .update({
      status: "paid",
      paid_at: payment.approvedAt ?? new Date().toISOString(),
    })
    .eq("id", order.id)
    .eq("status", "pending")
    .select("id");
  if (claimError) throw new Error(`주문 상태 전환 실패: ${claimError.message}`);
  if (!claimedRows || claimedRows.length === 0) return { claimed: false };

  // 2) 결제 기록 (payment_key unique — 중복 호출에도 안전)
  const { error: paymentError } = await service.from("payments").upsert(
    {
      order_id: order.id,
      provider: "toss",
      payment_key: payment.paymentKey,
      method: payment.method ?? null,
      amount: payment.totalAmount,
      status: "paid",
      approved_at: payment.approvedAt ?? new Date().toISOString(),
      receipt_url: payment.receipt?.url ?? null,
      card_info: (payment.card as Record<string, unknown> | undefined) ?? null,
      raw: payment as unknown as Record<string, unknown>,
    },
    { onConflict: "payment_key" }
  );
  if (paymentError) {
    // 결제 자체는 승인됨 — 기록 실패는 메모로 남기고 진행
    console.error(`[orders] payments 기록 실패 order=${order.order_no}:`, paymentError.message);
    await appendAdminMemo(service, order.id, `payments 기록 실패: ${paymentError.message}`);
  }

  // 3) 재고 차감 — 실패해도 결제는 이미 승인됐으므로 메모만 남기고 진행
  const stockFailures: string[] = [];
  for (const item of order.order_items) {
    if (!item.product_id) continue;
    const { error } = await service.rpc("adjust_stock", {
      p_product_id: item.product_id,
      p_variant_id: item.variant_id,
      p_delta: -item.qty,
      p_reason: "order",
      p_ref_order_id: order.id,
      p_memo: `주문 ${order.order_no} 결제 차감`,
    });
    if (error) stockFailures.push(`${item.product_id} x${item.qty}: ${error.message}`);
  }
  if (stockFailures.length > 0) {
    console.error(`[orders] 재고 차감 실패 order=${order.order_no}:`, stockFailures.join(" / "));
    await appendAdminMemo(
      service,
      order.id,
      `재고 차감 실패 — 수동 확인 필요: ${stockFailures.join(" / ")}`
    );
  }

  // 4) VIP 코드 사용 횟수 증가
  if (order.vip_code) {
    const { data: codeRow } = await service
      .from("vip_access_codes")
      .select("id, used_count")
      .eq("code", order.vip_code)
      .maybeSingle();
    if (codeRow) {
      await service
        .from("vip_access_codes")
        .update({ used_count: (codeRow.used_count as number) + 1 })
        .eq("id", codeRow.id);
    }
  }

  // 5) 쿠폰 사용 기록 + 카운트
  if (order.coupon_id) {
    await service.from("coupon_redemptions").insert({
      coupon_id: order.coupon_id,
      user_id: order.user_id,
      order_id: order.id,
    });
    const { data: couponRow } = await service
      .from("coupons")
      .select("id, used_count")
      .eq("id", order.coupon_id)
      .maybeSingle();
    if (couponRow) {
      await service
        .from("coupons")
        .update({ used_count: (couponRow.used_count as number) + 1 })
        .eq("id", couponRow.id);
    }
  }

  return { claimed: true };
}

/** 취소/환불 시 재고 복구 — 실패 항목은 admin_memo에 기록 */
export async function restoreOrderStock(
  service: SupabaseClient,
  order: Pick<FinalizableOrder, "id" | "order_no" | "order_items">
): Promise<void> {
  const failures: string[] = [];
  for (const item of order.order_items) {
    if (!item.product_id) continue;
    const { error } = await service.rpc("adjust_stock", {
      p_product_id: item.product_id,
      p_variant_id: item.variant_id,
      p_delta: item.qty,
      p_reason: "cancel",
      p_ref_order_id: order.id,
      p_memo: `주문 ${order.order_no} 취소 복구`,
    });
    if (error) failures.push(`${item.product_id} x${item.qty}: ${error.message}`);
  }
  if (failures.length > 0) {
    console.error(`[orders] 재고 복구 실패 order=${order.order_no}:`, failures.join(" / "));
    await appendAdminMemo(
      service,
      order.id,
      `재고 복구 실패 — 수동 확인 필요: ${failures.join(" / ")}`
    );
  }
}

/* ---------- 입력 정제 유틸 (API 라우트 공용) ---------- */

export function cleanStr(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

/** 주문자 정보 정제 — 필수값 누락 시 null */
export function sanitizeOrderer(raw: unknown): OrdererInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const name = cleanStr(o.name, 50);
  const phone = cleanStr(o.phone, 20);
  if (!name || !phone) return null;
  const email = cleanStr(o.email, 100);
  return { name, phone, ...(email ? { email } : {}) };
}

/** 수령인 정보 정제 — 필수값 누락 시 null */
export function sanitizeRecipient(raw: unknown): RecipientInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = cleanStr(r.name, 50);
  const phone = cleanStr(r.phone, 20);
  const postcode = cleanStr(r.postcode, 10);
  const address1 = cleanStr(r.address1, 200);
  if (!name || !phone || !postcode || !address1) return null;
  const address2 = cleanStr(r.address2, 200);
  const memo = cleanStr(r.memo, 200);
  return {
    name,
    phone,
    postcode,
    address1,
    ...(address2 ? { address2 } : {}),
    ...(memo ? { memo } : {}),
  };
}
