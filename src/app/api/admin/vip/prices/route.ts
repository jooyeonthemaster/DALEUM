import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { krw } from "@/lib/format";
import { isUuid, isoDate, jsonError, posInt, rateNum, readBody } from "../_lib/validate";

/* ============================================================
   /api/admin/vip/prices — 상품별 VIP 가격 목록/일괄 등록
   ============================================================ */

const PRICE_SELECT =
  "*, products(id, name, price), vip_groups(id, name), profiles(id, name, email)";

/** GET — 전용 가격 전체 목록 */
export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.service
    .from("vip_product_prices")
    .select(PRICE_SELECT)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) return jsonError("전용 가격 목록을 불러오지 못했습니다.", 500);
  return NextResponse.json({ prices: data ?? [] });
}

interface PriceItemInput {
  product_id: string;
  custom_price: number | null;
  discount_rate: number | null;
}

/**
 * POST — 일괄 등록
 * { group_id | user_id, starts_at?, ends_at?, is_active?,
 *   items: [{ product_id, custom_price? | discount_rate? }] }
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const body = await readBody(req);
  if (!body) return jsonError("잘못된 요청입니다.");

  // ---------- 대상: 그룹 또는 개별 고객 중 정확히 하나 ----------
  const groupId = isUuid(body.group_id) ? body.group_id : null;
  const userId = isUuid(body.user_id) ? body.user_id : null;
  if ((groupId === null) === (userId === null)) {
    return jsonError("적용 대상은 그룹 또는 개별 고객 중 하나만 지정해 주세요.");
  }

  if (groupId) {
    const { data: group } = await auth.service
      .from("vip_groups")
      .select("id")
      .eq("id", groupId)
      .maybeSingle();
    if (!group) return jsonError("존재하지 않는 그룹입니다.", 404);
  }
  if (userId) {
    const { data: profile } = await auth.service
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile) return jsonError("존재하지 않는 고객입니다.", 404);
  }

  // ---------- 기간 ----------
  const startsAt = isoDate(body.starts_at);
  const endsAt = isoDate(body.ends_at);
  if (startsAt === undefined || endsAt === undefined) {
    return jsonError("적용 기간 형식이 올바르지 않습니다.");
  }
  if (startsAt && endsAt && new Date(startsAt) > new Date(endsAt)) {
    return jsonError("적용 종료일은 시작일 이후여야 합니다.");
  }

  // ---------- 상품별 가격 항목 ----------
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return jsonError("가격을 지정할 상품을 1개 이상 추가해 주세요.");
  }
  if (body.items.length > 100) return jsonError("한 번에 최대 100개 상품까지 등록할 수 있습니다.");

  const items: PriceItemInput[] = [];
  const seen = new Set<string>();
  for (const raw of body.items as unknown[]) {
    if (!raw || typeof raw !== "object") return jsonError("상품 항목 형식이 올바르지 않습니다.");
    const item = raw as Record<string, unknown>;
    if (!isUuid(item.product_id)) return jsonError("상품 항목 형식이 올바르지 않습니다.");
    if (seen.has(item.product_id)) return jsonError("같은 상품이 중복으로 포함되어 있습니다.");
    seen.add(item.product_id);

    const hasPrice = item.custom_price !== undefined && item.custom_price !== null && item.custom_price !== "";
    const hasRate = item.discount_rate !== undefined && item.discount_rate !== null && item.discount_rate !== "";
    if (hasPrice === hasRate) {
      return jsonError("상품마다 지정가 또는 할인율 중 하나만 입력해 주세요.");
    }

    if (hasPrice) {
      const price = posInt(item.custom_price);
      if (price === undefined) return jsonError("지정가는 1원 이상의 정수여야 합니다.");
      items.push({ product_id: item.product_id, custom_price: price, discount_rate: null });
    } else {
      const rate = rateNum(item.discount_rate);
      if (rate === undefined || rate <= 0) {
        return jsonError("할인율은 0보다 크고 100 이하인 숫자여야 합니다.");
      }
      items.push({ product_id: item.product_id, custom_price: null, discount_rate: rate });
    }
  }

  // ---------- 상품 존재/정가 검증 ----------
  const productIds = items.map((i) => i.product_id);
  const { data: products, error: productError } = await auth.service
    .from("products")
    .select("id, name, price")
    .in("id", productIds);
  if (productError) return jsonError("상품 정보를 확인하지 못했습니다.", 500);

  const productMap = new Map(
    ((products ?? []) as { id: string; name: string; price: number }[]).map((p) => [p.id, p])
  );
  for (const item of items) {
    const product = productMap.get(item.product_id);
    if (!product) return jsonError("존재하지 않는 상품이 포함되어 있습니다.", 404);
    if (item.custom_price !== null && item.custom_price > product.price) {
      return jsonError(
        `'${product.name}'의 지정가는 정가 ${krw(product.price)}원을 넘을 수 없습니다.`
      );
    }
  }

  // ---------- 등록 ----------
  const isActive = typeof body.is_active === "boolean" ? body.is_active : true;
  const rows = items.map((item) => ({
    group_id: groupId,
    user_id: userId,
    product_id: item.product_id,
    custom_price: item.custom_price,
    discount_rate: item.discount_rate,
    starts_at: startsAt,
    ends_at: endsAt,
    is_active: isActive,
  }));

  const { data, error } = await auth.service
    .from("vip_product_prices")
    .insert(rows)
    .select(PRICE_SELECT);

  if (error) return jsonError("전용 가격 등록에 실패했습니다.", 500);
  return NextResponse.json({ prices: data ?? [] }, { status: 201 });
}
