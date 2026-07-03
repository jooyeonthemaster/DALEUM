import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { krw } from "@/lib/format";
import { isUuid, isoDate, jsonError, posInt, rateNum, readBody } from "../../_lib/validate";

/* ============================================================
   /api/admin/vip/prices/[id] — 상품별 VIP 가격 수정/삭제
   ============================================================ */

const PRICE_SELECT =
  "*, products(id, name, price), vip_groups(id, name), profiles(id, name, email)";

/**
 * PATCH — { custom_price? | discount_rate?, starts_at?, ends_at?, is_active? }
 * custom_price를 보내면 지정가 모드로, discount_rate를 보내면 할인율 모드로 전환된다.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  if (!isUuid(id)) return jsonError("존재하지 않는 가격 설정입니다.", 404);

  const body = await readBody(req);
  if (!body) return jsonError("잘못된 요청입니다.");

  const { data: current, error: fetchError } = await auth.service
    .from("vip_product_prices")
    .select("id, starts_at, ends_at, products(id, name, price)")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) return jsonError("가격 설정을 확인하지 못했습니다.", 500);
  if (!current) return jsonError("존재하지 않는 가격 설정입니다.", 404);

  const product = current.products as unknown as { id: string; name: string; price: number } | null;
  const patch: Record<string, unknown> = {};

  const hasPrice = "custom_price" in body && body.custom_price !== null && body.custom_price !== "";
  const hasRate = "discount_rate" in body && body.discount_rate !== null && body.discount_rate !== "";
  if (hasPrice && hasRate) {
    return jsonError("지정가와 할인율은 동시에 설정할 수 없습니다.");
  }
  if (hasPrice) {
    const price = posInt(body.custom_price);
    if (price === undefined) return jsonError("지정가는 1원 이상의 정수여야 합니다.");
    if (product && price > product.price) {
      return jsonError(`'${product.name}'의 지정가는 정가 ${krw(product.price)}원을 넘을 수 없습니다.`);
    }
    patch.custom_price = price;
    patch.discount_rate = null;
  } else if (hasRate) {
    const rate = rateNum(body.discount_rate);
    if (rate === undefined || rate <= 0) {
      return jsonError("할인율은 0보다 크고 100 이하인 숫자여야 합니다.");
    }
    patch.discount_rate = rate;
    patch.custom_price = null;
  }

  if ("starts_at" in body) {
    const startsAt = isoDate(body.starts_at);
    if (startsAt === undefined) return jsonError("적용 시작일 형식이 올바르지 않습니다.");
    patch.starts_at = startsAt;
  }
  if ("ends_at" in body) {
    const endsAt = isoDate(body.ends_at);
    if (endsAt === undefined) return jsonError("적용 종료일 형식이 올바르지 않습니다.");
    patch.ends_at = endsAt;
  }

  // 기간 정합성 (변경분 + 기존값 병합 기준)
  const mergedStart = ("starts_at" in patch ? patch.starts_at : current.starts_at) as string | null;
  const mergedEnd = ("ends_at" in patch ? patch.ends_at : current.ends_at) as string | null;
  if (mergedStart && mergedEnd && new Date(mergedStart) > new Date(mergedEnd)) {
    return jsonError("적용 종료일은 시작일 이후여야 합니다.");
  }

  if ("is_active" in body) {
    if (typeof body.is_active !== "boolean") return jsonError("잘못된 요청입니다.");
    patch.is_active = body.is_active;
  }

  if (Object.keys(patch).length === 0) return jsonError("변경할 내용이 없습니다.");

  const { data, error } = await auth.service
    .from("vip_product_prices")
    .update(patch)
    .eq("id", id)
    .select(PRICE_SELECT)
    .maybeSingle();

  if (error) return jsonError("가격 설정 수정에 실패했습니다.", 500);
  if (!data) return jsonError("존재하지 않는 가격 설정입니다.", 404);

  return NextResponse.json({ price: data });
}

/** DELETE — 가격 설정 삭제 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  if (!isUuid(id)) return jsonError("존재하지 않는 가격 설정입니다.", 404);

  const { error } = await auth.service.from("vip_product_prices").delete().eq("id", id);
  if (error) return jsonError("가격 설정 삭제에 실패했습니다.", 500);

  return NextResponse.json({ ok: true });
}
