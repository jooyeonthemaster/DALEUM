import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getPayment, type TossPayment } from "@/lib/toss";
import {
  finalizePaidOrder,
  restoreOrderStock,
  appendAdminMemo,
  type FinalizableOrder,
} from "@/lib/orders";

/**
 * 토스페이먼츠 웹훅 (PAYMENT_STATUS_CHANGED).
 *
 * 보안: 토스 웹훅에는 서명이 없다 — 웹훅 payload는 힌트로만 쓰고,
 * 반드시 토스 결제 조회 API(getPayment)로 재확인한 결과만 신뢰한다.
 * 멱등: DONE 처리는 finalizePaidOrder의 pending→paid 조건부 클레임,
 * 취소 동기화는 현재 상태 조건부 업데이트로 중복 실행을 차단한다.
 * 응답: 어떤 경우에도 200 (5xx를 돌려주면 토스가 계속 재시도한다).
 */

interface OrderRow extends FinalizableOrder {
  status: string;
}

function ok() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    if (body?.eventType !== "PAYMENT_STATUS_CHANGED") return ok();

    const data = (body.data ?? {}) as Record<string, unknown>;
    const paymentKey = typeof data.paymentKey === "string" ? data.paymentKey : "";
    if (!paymentKey) return ok();

    // ---------- 진실 확인: 토스 결제 조회 API ----------
    let payment: TossPayment;
    try {
      payment = await getPayment(paymentKey);
    } catch (e) {
      console.error(`[payments/webhook] 결제 조회 실패 paymentKey=${paymentKey}:`, e);
      return ok();
    }

    const service = createServiceClient();
    const { data: orderData } = await service
      .from("orders")
      .select(
        "id, order_no, status, total, user_id, vip_code, coupon_id, order_items(product_id, variant_id, qty)"
      )
      .eq("order_no", payment.orderId)
      .maybeSingle();
    const order = orderData as unknown as OrderRow | null;
    if (!order) {
      console.error(`[payments/webhook] 주문 없음 orderNo=${payment.orderId}`);
      return ok();
    }

    if (payment.status === "DONE") {
      await handleDone(service, order, payment);
    } else if (payment.status === "CANCELED" || payment.status === "PARTIAL_CANCELED") {
      await handleCancelled(service, order, payment);
    }
    // 그 외 상태(WAITING_FOR_DEPOSIT 등)는 현재 정책상 무시
  } catch (e) {
    console.error("[payments/webhook] 처리 오류:", e);
  }
  return ok();
}

/** DONE: pending이면 confirm과 동일한 확정 처리 (멱등) */
async function handleDone(
  service: ReturnType<typeof createServiceClient>,
  order: OrderRow,
  payment: TossPayment
) {
  if (order.status !== "pending") return; // 이미 confirm이 처리했거나 취소된 주문

  if (payment.totalAmount !== order.total) {
    console.error(
      `[payments/webhook] 금액 불일치 order=${order.order_no} 서버=${order.total} 토스=${payment.totalAmount}`
    );
    await appendAdminMemo(
      service,
      order.id,
      `웹훅 금액 불일치 — 서버 ${order.total}원 / 토스 승인 ${payment.totalAmount}원. 수동 확인 필요 (paymentKey: ${payment.paymentKey})`
    );
    return;
  }

  await finalizePaidOrder(service, order, payment);
}

/** CANCELED / PARTIAL_CANCELED: payments·orders 상태 동기화 */
async function handleCancelled(
  service: ReturnType<typeof createServiceClient>,
  order: OrderRow,
  payment: TossPayment
) {
  const isPartial = payment.status === "PARTIAL_CANCELED";

  // 결제 레코드 동기화 (payment_key unique — upsert로 멱등)
  await service.from("payments").upsert(
    {
      order_id: order.id,
      provider: "toss",
      payment_key: payment.paymentKey,
      method: payment.method ?? null,
      amount: payment.totalAmount,
      status: isPartial ? "partial_refunded" : "refunded",
      receipt_url: payment.receipt?.url ?? null,
      raw: payment as unknown as Record<string, unknown>,
    },
    { onConflict: "payment_key" }
  );

  if (isPartial) {
    // 부분 취소는 주문 상태를 바꾸지 않고 관리자 확인 대상으로만 기록
    await appendAdminMemo(
      service,
      order.id,
      `토스 부분 취소 웹훅 수신 — 잔여 결제액 확인 필요 (paymentKey: ${payment.paymentKey})`
    );
    return;
  }

  // 전액 취소 — 이미 취소/환불 반영됐으면 종료 (멱등)
  if (order.status === "cancelled" || order.status === "refunded") return;

  const cancels = payment.cancels ?? [];
  const lastCancel = cancels[cancels.length - 1] as Record<string, unknown> | undefined;
  const reason =
    typeof lastCancel?.cancelReason === "string" ? lastCancel.cancelReason : "토스 결제 취소";

  // 읽은 시점의 상태를 조건으로 클레임 — 동시 처리(취소 API 등)와 충돌 방지
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
  if (!claimed || claimed.length === 0) return; // 다른 경로가 먼저 처리함

  // pending 상태에서 취소된 주문은 재고를 차감한 적이 없으므로 복구 불필요
  if (order.status !== "pending") {
    await restoreOrderStock(service, order);
  }
}
