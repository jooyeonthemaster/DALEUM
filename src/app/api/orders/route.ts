import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { VIP_CODE_COOKIE } from "@/lib/constants";
import {
  buildOrder,
  OrderError,
  sanitizeOrderer,
  sanitizeRecipient,
  type OrderDraft,
} from "@/lib/orders";

/**
 * 주문 생성 (pending).
 * 클라이언트가 보낸 금액은 일절 사용하지 않는다 — 상품/옵션/수량만 받아
 * 서버가 가격·재고·VIP·캠페인·쿠폰·배송비를 전면 재계산해 주문을 만든다.
 * 이후 토스 위젯 결제 → /api/payments/confirm 에서 paid 전환.
 *
 * POST body: { items: [{productId, variantId?, qty, campaignId?}], orderer, recipient, couponCode? }
 * 응답: 201 { orderId, orderNo, amount }
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  // ---------- 입력 검증 ----------
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "주문할 상품이 없습니다." }, { status: 400 });
  }
  const orderer = sanitizeOrderer(body.orderer);
  if (!orderer) {
    return NextResponse.json({ error: "주문자 이름과 연락처를 입력해 주세요." }, { status: 400 });
  }
  const recipient = sanitizeRecipient(body.recipient);
  if (!recipient) {
    return NextResponse.json({ error: "배송지 정보를 모두 입력해 주세요." }, { status: 400 });
  }

  const draft: OrderDraft = {
    items: (body.items as Record<string, unknown>[]).map((it) => ({
      productId: String(it.productId ?? ""),
      variantId: it.variantId ? String(it.variantId) : null,
      qty: Number(it.qty),
      campaignId: it.campaignId ? String(it.campaignId) : null,
    })),
    orderer,
    recipient,
    couponCode: typeof body.couponCode === "string" ? body.couponCode.trim().slice(0, 50) : null,
  };

  // ---------- 컨텍스트: 로그인 사용자(선택) + VIP 코드 쿠키 ----------
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const vipCode = req.cookies.get(VIP_CODE_COOKIE)?.value ?? null;

  const service = createServiceClient();

  try {
    const built = await buildOrder(service, draft, {
      userId: user?.id ?? null,
      vipCode,
    });

    // ---------- 주문 insert (pending) ----------
    const { data: order, error: orderError } = await service
      .from("orders")
      .insert({
        user_id: user?.id ?? null,
        status: "pending",
        subtotal: built.subtotal,
        discount_total: built.discountTotal,
        shipping_fee: built.shippingFee,
        total: built.total,
        vip_campaign_id: built.vipCampaignId,
        vip_code: built.vipCode,
        coupon_id: built.coupon?.id ?? null,
        coupon_discount: built.couponDiscount,
        orderer,
        recipient,
      })
      .select("id, order_no, total")
      .single();

    if (orderError || !order) {
      console.error("[orders] 주문 insert 실패:", orderError?.message);
      return NextResponse.json({ error: "주문 생성에 실패했습니다." }, { status: 500 });
    }

    // ---------- 주문 항목 insert (단가 스냅샷) ----------
    const { error: itemsError } = await service.from("order_items").insert(
      built.lines.map((line) => ({
        order_id: order.id,
        product_id: line.productId,
        variant_id: line.variantId,
        name_snapshot: line.nameSnapshot,
        option_snapshot: line.optionSnapshot,
        image_url: line.imageUrl,
        unit_price: line.unitPrice,
        original_price: line.originalPrice,
        qty: line.qty,
      }))
    );

    if (itemsError) {
      // 항목 저장 실패 시 빈 주문이 남지 않도록 롤백
      console.error("[orders] order_items insert 실패:", itemsError.message);
      await service.from("orders").delete().eq("id", order.id).eq("status", "pending");
      return NextResponse.json({ error: "주문 생성에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json(
      { orderId: order.id, orderNo: order.order_no, amount: order.total },
      { status: 201 }
    );
  } catch (e) {
    if (e instanceof OrderError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[orders] 주문 생성 오류:", e);
    return NextResponse.json({ error: "주문 생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}
