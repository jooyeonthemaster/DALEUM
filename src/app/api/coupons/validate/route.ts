import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { validateCoupon, OrderError } from "@/lib/orders";

/**
 * 쿠폰 유효성 사전 확인 (체크아웃 UI용).
 * 여기서 계산된 할인액은 표시용 예상치일 뿐이며,
 * 최종 검증·확정은 주문 생성(POST /api/orders) 시 서버가 다시 수행한다.
 *
 * POST body: { code, subtotal }  — subtotal은 VIP 반영된 상품 합계(배송비 제외)
 * 응답: 200 { coupon: { code, name, discount_type, value, min_order, max_discount }, discount }
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const code = typeof body.code === "string" ? body.code.trim().slice(0, 50) : "";
  const subtotal = Number(body.subtotal);

  if (!code) {
    return NextResponse.json({ error: "쿠폰 코드를 입력해 주세요." }, { status: 400 });
  }
  if (!Number.isSafeInteger(subtotal) || subtotal < 0) {
    return NextResponse.json({ error: "주문 금액이 올바르지 않습니다." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const service = createServiceClient();

  try {
    const { coupon, discount } = await validateCoupon(service, code, subtotal, user?.id ?? null);
    return NextResponse.json({
      coupon: {
        code: coupon.code,
        name: coupon.name,
        discount_type: coupon.discount_type,
        value: coupon.value,
        min_order: coupon.min_order,
        max_discount: coupon.max_discount,
      },
      discount,
    });
  } catch (e) {
    if (e instanceof OrderError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[coupons/validate] 검증 오류:", e);
    return NextResponse.json({ error: "쿠폰 확인 중 오류가 발생했습니다." }, { status: 500 });
  }
}
