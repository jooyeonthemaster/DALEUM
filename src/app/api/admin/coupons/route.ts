import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { validateCoupon, type CouponPayload } from "./validation";

/**
 * GET  /api/admin/coupons — 쿠폰 목록 (최신순)
 * POST /api/admin/coupons — 쿠폰 생성
 */

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const { data, error } = await service
    .from("coupons")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("[admin/coupons GET]", error);
    return NextResponse.json({ error: "쿠폰 목록을 불러오지 못했습니다." }, { status: 500 });
  }
  return NextResponse.json({ coupons: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const body = (await req.json().catch(() => null)) as CouponPayload | null;
  if (!body) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const { data: cols, error: msg } = validateCoupon(body);
  if (msg || !cols) return NextResponse.json({ error: msg ?? "잘못된 요청입니다." }, { status: 400 });

  // 기본값 보정
  cols.min_order = cols.min_order ?? 0;
  cols.per_user_limit = cols.per_user_limit ?? 1;
  cols.is_active = cols.is_active ?? true;

  const { data, error } = await service.from("coupons").insert(cols).select("*").single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "이미 존재하는 쿠폰 코드입니다." }, { status: 409 });
    }
    console.error("[admin/coupons POST]", error);
    return NextResponse.json({ error: "쿠폰을 생성하지 못했습니다." }, { status: 500 });
  }
  return NextResponse.json({ coupon: data }, { status: 201 });
}
