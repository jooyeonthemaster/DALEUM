import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { validateCoupon, type CouponPayload } from "../validation";

/**
 * GET    /api/admin/coupons/[id] — 쿠폰 상세 + 최근 사용 내역 20건
 * PATCH  /api/admin/coupons/[id] — 부분 수정
 * DELETE /api/admin/coupons/[id] — 삭제 (사용 내역도 함께 삭제됨)
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "쿠폰을 찾을 수 없습니다." }, { status: 404 });
  }

  const [couponRes, redemptionsRes] = await Promise.all([
    service.from("coupons").select("*").eq("id", id).maybeSingle(),
    service
      .from("coupon_redemptions")
      .select("id, redeemed_at, orders(order_no, total), profiles(name, email)")
      .eq("coupon_id", id)
      .order("redeemed_at", { ascending: false })
      .limit(20),
  ]);

  if (couponRes.error || redemptionsRes.error) {
    console.error("[admin/coupons/:id GET]", couponRes.error ?? redemptionsRes.error);
    return NextResponse.json({ error: "쿠폰 정보를 불러오지 못했습니다." }, { status: 500 });
  }
  if (!couponRes.data) {
    return NextResponse.json({ error: "쿠폰을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({
    coupon: couponRes.data,
    redemptions: redemptionsRes.data ?? [],
  });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "쿠폰을 찾을 수 없습니다." }, { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as CouponPayload | null;
  if (!body) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const { data: cols, error: msg } = validateCoupon(body, { partial: true });
  if (msg || !cols) return NextResponse.json({ error: msg ?? "잘못된 요청입니다." }, { status: 400 });
  if (Object.keys(cols).length === 0) {
    return NextResponse.json({ error: "수정할 내용이 없습니다." }, { status: 400 });
  }

  const { data, error } = await service
    .from("coupons")
    .update(cols)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "이미 존재하는 쿠폰 코드입니다." }, { status: 409 });
    }
    console.error("[admin/coupons/:id PATCH]", error);
    return NextResponse.json({ error: "쿠폰을 수정하지 못했습니다." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "쿠폰을 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ coupon: data });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "쿠폰을 찾을 수 없습니다." }, { status: 404 });
  }

  const { error } = await service.from("coupons").delete().eq("id", id);
  if (error) {
    console.error("[admin/coupons/:id DELETE]", error);
    return NextResponse.json({ error: "쿠폰을 삭제하지 못했습니다." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
