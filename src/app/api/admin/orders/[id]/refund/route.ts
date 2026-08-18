import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { cancelPayment, TossError } from "@/lib/toss";
import {
  isUuid,
  cleanStr,
  restoreOrderStock,
  appendAdminMemo,
  type FinalizableOrder,
} from "@/lib/orders";
import { krw } from "@/lib/format";
import { CACHE_TAGS } from "@/lib/cache";

/**
 * POST /api/admin/orders/[id]/refund — 관리자 환불/취소 처리.
 * body: { reason: string(필수), amount?: number(부분 환불 금액) }
 *
 * - pending: PG 호출 없이 즉시 cancelled
 * - 전액 환불: 토스 cancelPayment 성공 후에만 payments refunded →
 *   orders cancelled(배송 전) / refunded(배송 이후) → 재고 복구(adjust_stock +qty 'cancel')
 * - 부분 환불: payments partial_refunded + admin_memo 기록 (주문 상태/재고는 유지 — 관리자 판단)
 * - 멱등: 이미 취소/환불된 주문은 200으로 현재 상태 반환
 */

interface OrderRow extends FinalizableOrder {
  status: string;
  payments: { id: string; payment_key: string | null; status: string; amount: number }[];
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const reason = cleanStr(body.reason, 200);
  if (!reason) {
    return NextResponse.json({ error: "환불 사유를 입력해 주세요." }, { status: 400 });
  }

  let amount: number | null = null;
  if (body.amount !== undefined && body.amount !== null && body.amount !== "") {
    const n = Number(body.amount);
    if (!Number.isInteger(n) || n <= 0) {
      return NextResponse.json({ error: "환불 금액이 올바르지 않습니다." }, { status: 400 });
    }
    amount = n;
  }

  // ---------- 주문 조회 ----------
  const { data } = await service
    .from("orders")
    .select(
      "id, order_no, status, total, user_id, vip_code, coupon_id, order_items(product_id, variant_id, qty), payments(id, payment_key, status, amount)"
    )
    .eq("id", id)
    .maybeSingle();
  const order = data as unknown as OrderRow | null;

  if (!order) {
    return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  }

  // 멱등: 이미 처리 완료
  if (order.status === "cancelled" || order.status === "refunded") {
    return NextResponse.json({
      orderId: order.id,
      status: order.status,
      alreadyProcessed: true,
      message: "이미 취소/환불 처리된 주문입니다.",
    });
  }

  // ---------- pending: PG 없이 취소 ----------
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
      // 동시에 다른 경로에서 처리됨 — 멱등 성공
      return NextResponse.json({ orderId: order.id, status: "cancelled", alreadyProcessed: true });
    }
    return NextResponse.json({ orderId: order.id, status: "cancelled", refunded: "none" });
  }

  // ---------- 결제 기록 확인 ----------
  const payment = order.payments?.find(
    (p) => (p.status === "paid" || p.status === "partial_refunded") && p.payment_key
  );
  if (!payment?.payment_key) {
    console.error(`[admin/orders/refund] 결제 기록 없음 order=${order.order_no}`);
    return NextResponse.json(
      { error: "환불할 결제 정보를 찾을 수 없습니다. 결제 내역을 확인해 주세요." },
      { status: 409 }
    );
  }

  if (amount != null && amount > payment.amount) {
    return NextResponse.json(
      { error: "환불 금액이 결제 금액을 초과할 수 없습니다." },
      { status: 400 }
    );
  }
  let isPartial = amount != null && amount < payment.amount;

  // ---------- 토스 환불 ----------
  try {
    await cancelPayment(payment.payment_key, reason, isPartial ? amount! : undefined);
  } catch (e) {
    if (e instanceof TossError && e.code === "ALREADY_CANCELED_PAYMENT") {
      // 토스에서는 이미 전액 취소됨 — 전액 환불로 간주하고 DB 동기화만 진행 (멱등)
      isPartial = false;
    } else if (e instanceof TossError) {
      console.error(
        `[admin/orders/refund] 토스 취소 실패 order=${order.order_no}: ${e.code} ${e.message}`
      );
      return NextResponse.json(
        { error: `결제 취소에 실패했습니다: ${e.message}` },
        { status: 502 }
      );
    } else {
      console.error(`[admin/orders/refund] 환불 중 오류 order=${order.order_no}:`, e);
      return NextResponse.json(
        { error: "결제 취소 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." },
        { status: 502 }
      );
    }
  }

  // ---------- 부분 환불: payments만 갱신 + 메모 ----------
  if (isPartial) {
    await service.from("payments").update({ status: "partial_refunded" }).eq("id", payment.id);
    await appendAdminMemo(
      service,
      order.id,
      `부분 환불 ${krw(amount!)}원 — ${reason}`
    );
    return NextResponse.json({ orderId: order.id, status: order.status, refunded: "partial" });
  }

  // ---------- 전액 환불: payments → orders → 재고 복구 ----------
  await service.from("payments").update({ status: "refunded" }).eq("id", payment.id);

  // 배송 전이면 cancelled, 배송 시작 이후면 refunded
  const nextStatus = ["paid", "preparing"].includes(order.status) ? "cancelled" : "refunded";
  const { data: claimed } = await service
    .from("orders")
    .update({
      status: nextStatus,
      cancelled_at: new Date().toISOString(),
      cancel_reason: reason,
    })
    .eq("id", order.id)
    .eq("status", order.status)
    .select("id");

  // 클레임 성공한 쪽만 재고 복구 (웹훅 등과 동시 처리 시 이중 복구 방지)
  // 부분 환불은 위에서 이미 return 했다 — 재고를 건드리지 않으므로 무효화도 하지 않는다.
  if (claimed && claimed.length > 0) {
    await restoreOrderStock(service, order);
    // 재고가 복구된 경우에만 무효화 — 품절 표시가 판매중으로 되돌아갈 수 있다
    revalidateTag(CACHE_TAGS.products, { expire: 0 });
  }

  return NextResponse.json({ orderId: order.id, status: nextStatus, refunded: "full" });
}
