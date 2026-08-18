import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { confirmPayment, getPayment, cancelPayment, TossError, type TossPayment } from "@/lib/toss";
import { finalizePaidOrder, appendAdminMemo, type FinalizableOrder } from "@/lib/orders";
import { CACHE_TAGS } from "@/lib/cache";

/**
 * 토스 결제 승인.
 * /checkout/success 리다이렉트 후 서버에서 호출된다.
 *
 * 흐름: orderNo로 주문 조회 → 서버 저장 금액과 클라이언트 amount 사전 대조(불일치 400)
 *  → 토스 confirm → 성공 시 finalizePaidOrder(멱등: pending→paid 클레임 후
 *    payments 기록·재고 차감·VIP/쿠폰 카운트가 정확히 한 번만 실행)
 *
 * POST body: { paymentKey, orderId(=orderNo), amount }
 * 응답: 200 { orderId, orderNo, status: "paid", amount } (이미 paid여도 동일 — 멱등)
 */

interface OrderRow extends FinalizableOrder {
  status: string;
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const paymentKey = typeof body.paymentKey === "string" ? body.paymentKey.trim() : "";
  const orderNo = typeof body.orderId === "string" ? body.orderId.trim() : "";
  const amount = Number(body.amount);

  if (!paymentKey || !orderNo || !Number.isSafeInteger(amount) || amount <= 0) {
    return NextResponse.json({ error: "결제 정보가 올바르지 않습니다." }, { status: 400 });
  }

  const service = createServiceClient();

  const { data } = await service
    .from("orders")
    .select(
      "id, order_no, status, total, user_id, vip_code, coupon_id, order_items(product_id, variant_id, qty)"
    )
    .eq("order_no", orderNo)
    .maybeSingle();
  const order = data as unknown as OrderRow | null;

  if (!order) {
    return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  }

  // 멱등: 이미 승인 완료된 주문이면 그대로 성공 응답
  if (order.status === "paid") {
    return NextResponse.json({
      orderId: order.id,
      orderNo: order.order_no,
      status: "paid",
      amount: order.total,
    });
  }
  if (order.status !== "pending") {
    return NextResponse.json(
      { error: "결제를 진행할 수 없는 주문입니다." },
      { status: 409 }
    );
  }

  // ---------- 금액 사전 대조: 서버 저장값이 진실의 원천 ----------
  if (order.total !== amount) {
    console.error(
      `[payments/confirm] 금액 불일치 order=${orderNo} 서버=${order.total} 요청=${amount}`
    );
    return NextResponse.json({ error: "결제 금액이 주문 금액과 일치하지 않습니다." }, { status: 400 });
  }

  // ---------- 토스 승인 ----------
  let payment: TossPayment;
  try {
    payment = await confirmPayment({ paymentKey, orderId: orderNo, amount });
  } catch (e) {
    if (e instanceof TossError && e.code === "ALREADY_PROCESSED_PAYMENT") {
      // 이중 호출로 이미 승인된 경우 — 결제 조회로 재확인 후 계속 진행 (멱등)
      try {
        const existing = await getPayment(paymentKey);
        if (
          existing.status === "DONE" &&
          existing.orderId === orderNo &&
          existing.totalAmount === order.total
        ) {
          payment = existing;
        } else {
          return NextResponse.json({ error: "결제 승인에 실패했습니다." }, { status: 502 });
        }
      } catch {
        return NextResponse.json({ error: "결제 승인에 실패했습니다." }, { status: 502 });
      }
    } else if (e instanceof TossError) {
      // 승인 실패 — 주문은 pending 유지 (재시도 가능)
      console.error(`[payments/confirm] 토스 승인 실패 order=${orderNo}: ${e.code} ${e.message}`);
      return NextResponse.json({ error: e.message }, { status: 502 });
    } else {
      console.error(`[payments/confirm] 승인 중 오류 order=${orderNo}:`, e);
      return NextResponse.json({ error: "결제 승인 중 오류가 발생했습니다." }, { status: 502 });
    }
  }

  // ---------- 승인 결과 금액 재검증 (방어) ----------
  if (payment.totalAmount !== order.total) {
    // 승인은 됐지만 금액이 다름 — 즉시 취소하고 실패 처리
    console.error(
      `[payments/confirm] 승인 금액 불일치 order=${orderNo} 서버=${order.total} 승인=${payment.totalAmount} — 자동 취소`
    );
    try {
      await cancelPayment(paymentKey, "결제 금액 불일치로 자동 취소");
    } catch (cancelErr) {
      console.error(`[payments/confirm] 자동 취소 실패 order=${orderNo}:`, cancelErr);
      await appendAdminMemo(
        service,
        order.id,
        `승인 금액 불일치(${payment.totalAmount}원) 자동 취소 실패 — 토스 콘솔에서 수동 취소 필요 (paymentKey: ${paymentKey})`
      );
    }
    return NextResponse.json({ error: "결제 금액이 주문 금액과 일치하지 않습니다." }, { status: 400 });
  }

  // ---------- 확정 처리 (멱등) ----------
  let claimed = false;
  try {
    ({ claimed } = await finalizePaidOrder(service, order, payment));
  } catch (e) {
    // 결제는 승인됨 — 상태 반영 실패는 웹훅이 재시도할 수 있으므로 기록만
    console.error(`[payments/confirm] 확정 처리 실패 order=${orderNo}:`, e);
    return NextResponse.json(
      { error: "결제는 완료되었으나 주문 반영이 지연되고 있습니다. 잠시 후 주문 내역을 확인해 주세요." },
      { status: 500 }
    );
  }

  // 재고가 실제로 차감된 경우에만 카탈로그 캐시를 무효화한다.
  // claimed=false 는 웹훅이 먼저 확정한 중복 호출이라 재고가 그대로다 — 무효화할 것이 없다.
  //
  // 두 번째 인자 주의 (Next 16): revalidateTag 는 이제 profile 인자가 필수다.
  // 권장값 "max" 는 stale-while-revalidate 라 무효화 직후 한 번은 낡은 값을 그대로 내보낸다
  // — 품절 표시가 한 박자 늦는다는 뜻이라 재고 경로에는 맞지 않는다.
  // { expire: 0 } 은 즉시 만료라 다음 조회부터 정확한 재고가 보인다.
  // 재고 변동은 읽기 대비 드물어 이 블로킹 재조회 비용은 무시할 수준이다.
  if (claimed) revalidateTag(CACHE_TAGS.products, { expire: 0 });

  return NextResponse.json({
    orderId: order.id,
    orderNo: order.order_no,
    status: "paid",
    amount: order.total,
  });
}
