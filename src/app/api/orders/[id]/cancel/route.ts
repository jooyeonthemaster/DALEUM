import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { cancelPayment, TossError } from "@/lib/toss";
import { restoreOrderStock, isUuid, cleanStr, type FinalizableOrder } from "@/lib/orders";

/**
 * 주문 취소 (고객).
 * - 회원: 로그인 세션의 user_id가 주문 소유자와 일치해야 한다.
 * - 비회원: body의 orderNo + phone(주문자 연락처)으로 본인 확인.
 * - pending → 결제 전이므로 그대로 cancelled.
 * - paid/preparing → 반드시 토스 환불 API(cancelPayment) 경유 후
 *   payments refunded, orders cancelled, 재고 복구. (DB만 바꾸는 취소 금지)
 * - shipped 이후 → 400 (고객센터 안내).
 * - 멱등: 이미 취소/환불된 주문이면 200.
 *
 * POST body: { reason?, orderNo?, phone? }
 */

interface OrderRow extends FinalizableOrder {
  status: string;
  orderer: { name?: string; phone?: string } | null;
  payments: { id: string; payment_key: string | null; status: string; amount: number }[];
}

function digits(v: string): string {
  return v.replace(/\D/g, "");
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // body 없는 호출 허용 (회원 취소는 reason 생략 가능)
  }
  const reason = cleanStr(body.reason, 200) ?? "고객 요청 취소";

  const service = createServiceClient();
  const { data } = await service
    .from("orders")
    .select(
      "id, order_no, status, total, user_id, vip_code, coupon_id, orderer, order_items(product_id, variant_id, qty), payments(id, payment_key, status, amount)"
    )
    .eq("id", id)
    .maybeSingle();
  const order = data as unknown as OrderRow | null;

  if (!order) {
    return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  }

  // ---------- 본인 확인 ----------
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (order.user_id) {
    // 회원 주문 — 소유자만 취소 가능
    if (!user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    if (user.id !== order.user_id) {
      return NextResponse.json({ error: "본인 주문만 취소할 수 있습니다." }, { status: 403 });
    }
  } else {
    // 비회원 주문 — 주문번호 + 주문자 연락처 대조
    const orderNo = cleanStr(body.orderNo, 30);
    const phone = cleanStr(body.phone, 20);
    if (!orderNo || !phone) {
      return NextResponse.json(
        { error: "주문번호와 주문자 연락처를 입력해 주세요." },
        { status: 400 }
      );
    }
    const ordererPhone = order.orderer?.phone ?? "";
    if (orderNo !== order.order_no || !ordererPhone || digits(phone) !== digits(ordererPhone)) {
      return NextResponse.json({ error: "주문 정보가 일치하지 않습니다." }, { status: 403 });
    }
  }

  // ---------- 상태별 처리 ----------
  // 멱등: 이미 취소/환불 완료
  if (order.status === "cancelled" || order.status === "refunded") {
    return NextResponse.json({ orderId: order.id, status: order.status });
  }

  // 배송 시작 이후에는 API 취소 불가
  if (!["pending", "paid", "preparing"].includes(order.status)) {
    return NextResponse.json(
      { error: "배송이 시작된 주문은 이곳에서 취소할 수 없습니다. 고객센터(031-963-3375)로 문의해 주세요." },
      { status: 400 }
    );
  }

  // 1) pending — 결제 전, 그대로 취소
  if (order.status === "pending") {
    const { data: claimed } = await service
      .from("orders")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancel_reason: reason,
      })
      .eq("id", order.id)
      .eq("status", "pending")
      .select("id");
    if (!claimed || claimed.length === 0) {
      return NextResponse.json({ orderId: order.id, status: "cancelled" }); // 이미 처리됨 (멱등)
    }
    return NextResponse.json({ orderId: order.id, status: "cancelled" });
  }

  // 2) paid / preparing — 토스 전액 환불 필수
  const paidPayment = order.payments?.find((p) => p.status === "paid" && p.payment_key);
  if (!paidPayment?.payment_key) {
    // 결제 완료 상태인데 결제 기록이 없음 — 돈이 걸린 문제이므로 자동 처리하지 않는다
    console.error(`[orders/cancel] 결제 기록 없음 order=${order.order_no}`);
    return NextResponse.json(
      { error: "결제 정보를 확인할 수 없습니다. 고객센터(031-963-3375)로 문의해 주세요." },
      { status: 409 }
    );
  }

  try {
    await cancelPayment(paidPayment.payment_key, reason);
  } catch (e) {
    if (e instanceof TossError && e.code === "ALREADY_CANCELED_PAYMENT") {
      // 토스에서는 이미 취소됨 — DB 동기화만 계속 진행 (멱등)
    } else if (e instanceof TossError) {
      console.error(`[orders/cancel] 토스 취소 실패 order=${order.order_no}: ${e.code} ${e.message}`);
      return NextResponse.json(
        { error: "결제 취소에 실패했습니다. 잠시 후 다시 시도해 주세요." },
        { status: 502 }
      );
    } else {
      console.error(`[orders/cancel] 취소 중 오류 order=${order.order_no}:`, e);
      return NextResponse.json(
        { error: "결제 취소 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." },
        { status: 502 }
      );
    }
  }

  // 환불 완료 — DB 동기화
  await service
    .from("payments")
    .update({ status: "refunded" })
    .eq("id", paidPayment.id);

  const { data: claimed } = await service
    .from("orders")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancel_reason: reason,
    })
    .eq("id", order.id)
    .eq("status", order.status)
    .select("id");

  // 클레임 성공한 쪽만 재고 복구 (웹훅과 동시 처리 시 이중 복구 방지)
  if (claimed && claimed.length > 0) {
    await restoreOrderStock(service, order);
  }

  return NextResponse.json({ orderId: order.id, status: "cancelled" });
}
