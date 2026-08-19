import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth";
import { cancelPayment, TossError } from "@/lib/toss";
import { isUuid, cleanStr, restoreOrderStock, type FinalizableOrder } from "@/lib/orders";
import { krw } from "@/lib/format";
import { CACHE_TAGS } from "@/lib/cache";
import { EVENT_KINDS, adminDisplayName, parseOrderMemo } from "../../order-log";
import { partialRefundBody, refundLedger } from "../../order-refund-ledger";
import { appendOrderEvent } from "../../order-memo";

/**
 * POST /api/admin/orders/[id]/refund — 관리자 환불/취소 처리.
 * body: { reason: string(필수), amount?: number(부분 환불 금액), restock?: boolean(반품 입고 처리) }
 *
 * - pending: 결제사 호출 없이 즉시 cancelled
 * - 잔액 전액 환불: 결제사 취소 성공 후에만 payments refunded →
 *   orders cancelled(배송 전) / refunded(배송 이후) → **반품 입고 처리를 켠 경우에만** 재고 복구
 * - 부분 환불: payments partial_refunded + 처리 이력 기록 (주문 상태/재고는 유지 — 관리자 판단)
 * - 수기 결제(계좌이체 등 payment_key 없음): 결제사 호출 없이 주문만 취소 + 실제 차감된 재고만 복구
 * - 멱등: 이미 취소/환불된 주문은 200으로 현재 상태 반환
 *
 * ⚠ 환불 가능 잔액은 **서버가 계산해 강제한다.**
 *   예전에는 화면도 서버도 payments.amount(원금)만 봤다. 부분 환불을 해도 이 값이 줄지 않으므로
 *   10만원 주문에 9만원을 환불한 뒤에도 "최대 100,000원" 이라고 다시 안내했고,
 *   '전액' 버튼은 DB 를 전액 환불로 적고 재고를 전량 복구해 장부가 실제와 어긋났다.
 */

interface OrderRow extends FinalizableOrder {
  status: string;
  admin_memo: string | null;
  payments: { id: string; payment_key: string | null; status: string; amount: number }[];
}

/**
 * 이력이 저장되지 않았을 때 화면에 띄울 경고.
 *
 * 환불 누계는 처리 이력을 되읽어 계산한다(order-refund-ledger.ts). 그래서 돈은 나갔는데
 * 이력이 저장되지 않으면 잔액이 실제보다 크게 보이고, 그 숫자를 믿고 또 환불하면 초과 환불이다.
 * 조용히 200 을 돌려주던 자리다 — 실제 동시 요청 시험에서 부분 환불 1건이 그렇게 사라졌다.
 */
const RECORD_FAILED_WARNING =
  "환불은 처리됐지만 처리 이력을 저장하지 못했습니다. 이 주문의 남은 환불 가능액이 실제보다 크게 보일 수 있으니, 추가 환불 전에 결제사 화면에서 남은 금액을 반드시 대조해 주세요.";

/** 결제사 취소 응답의 잔액 — 있으면 이게 가장 믿을 만한 숫자다 */
function balanceOf(payment: Record<string, unknown>): number | null {
  const v = payment.balanceAmount;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * 이 주문의 재고가 실제로 차감된 적이 있는가.
 * 수기로 '결제 완료' 만 눌러 둔 주문은 재고 차감을 타지 않았다. 그런 주문을 취소하면서
 * 재고를 복구하면 팔지도 않은 수량이 창고에 늘어난다 — 그래서 기록을 보고 판단한다.
 */
async function stockWasDeducted(service: SupabaseClient, orderId: string): Promise<boolean> {
  const { data } = await service
    .from("inventory_logs")
    .select("id")
    .eq("ref_order_id", orderId)
    .eq("reason", "order")
    .limit(1);
  return Boolean(data && data.length > 0);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service, user } = auth;

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

  /**
   * 반품 입고 처리(재고 되돌리기) 여부.
   *
   * 예전에는 주문 상태와 무관하게 무조건 재고를 전량 되채우고 이력에도 "재고를 다시 채웠습니다"
   * 를 적었다. 배송이 끝난 주문을 환불하면 물건은 아직 고객에게 있는데 장부만 늘어난다 —
   * 그 수량은 팔 수 없는 수량이라 그대로 초과판매가 된다.
   * 값을 보내지 않은 옛 호출에는 아래에서 "배송 전 주문만 되돌린다" 는 기본값을 적용한다.
   */
  const restockRequested = typeof body.restock === "boolean" ? body.restock : null;

  // ---------- 주문 조회 ----------
  const { data } = await service
    .from("orders")
    .select(
      "id, order_no, status, total, user_id, vip_code, coupon_id, admin_memo, order_items(product_id, variant_id, qty), payments(id, payment_key, status, amount)"
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

  const author = await adminDisplayName(service, user.id);

  // ---------- pending: 결제사 호출 없이 취소 ----------
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
    await appendOrderEvent(service, order.id, {
      kind: EVENT_KINDS.cancel,
      author,
      body: `입금 전 주문을 취소했습니다. (사유: ${reason})`,
    });
    return NextResponse.json({ orderId: order.id, status: "cancelled", refunded: "none" });
  }

  // ---------- 환불 가능 잔액 (서버가 계산해 강제한다) ----------
  const events = parseOrderMemo(order.admin_memo).events;
  const payment = order.payments?.find(
    (p) => (p.status === "paid" || p.status === "partial_refunded") && p.payment_key
  );
  const base = payment?.amount ?? order.total;
  const ledger = refundLedger(base, events, !payment);

  if (ledger.remaining <= 0) {
    return NextResponse.json(
      {
        error: `이 주문은 이미 ${krw(ledger.refunded)}원 전액이 환불되었습니다. 더 환불할 금액이 없습니다.`,
        refund: ledger,
      },
      { status: 409 }
    );
  }
  if (amount != null && amount > ledger.remaining) {
    return NextResponse.json(
      {
        error: `남은 환불 가능액은 ${krw(ledger.remaining)}원입니다. (결제 ${krw(ledger.paid)}원 · 이미 환불 ${krw(ledger.refunded)}원)`,
        refund: ledger,
      },
      { status: 400 }
    );
  }
  // 잔액과 같은 금액을 넣은 것은 "잔액 전액 환불" 이다 — 주문 상태와 재고까지 정리해야 한다
  const isPartial = amount != null && amount < ledger.remaining;

  const nextStatus = ["paid", "preparing"].includes(order.status) ? "cancelled" : "refunded";
  // 배송 전(결제 완료·상품 준비중)이면 물건이 아직 창고에 있으니 되돌리는 것이 맞고,
  // 발송된 뒤라면 실제로 반품이 들어왔을 때만 되돌려야 한다. 화면이 보낸 값이 우선한다.
  const wantsRestock = restockRequested ?? ["paid", "preparing"].includes(order.status);

  // ---------- 수기 결제(계좌이체 등): 결제사 취소 없이 주문만 정리 ----------
  // 무통장 입금을 받고 관리자가 '결제 완료' 로 바꿔 둔 주문은 payments 행이 없어
  // 예전에는 환불 버튼을 눌러도 매번 "환불할 결제 정보를 찾을 수 없습니다" 만 떴다(막다른 골목).
  if (!payment?.payment_key) {
    if (isPartial) {
      const remaining = ledger.remaining - amount!;
      const logged = await appendOrderEvent(service, order.id, {
        kind: EVENT_KINDS.refundPartial,
        author,
        body: `${partialRefundBody(amount!, reason, remaining)}\n계좌이체 등 수기 결제라 결제사 취소 없이 기록만 남겼습니다. 실제 환급은 직접 송금해 주세요.`,
      });
      return NextResponse.json({
        orderId: order.id,
        status: order.status,
        refunded: "partial",
        manual: true,
        warning: logged ? undefined : RECORD_FAILED_WARNING,
        refund: {
          paid: base,
          refunded: base - remaining,
          remaining,
          manual: true,
          pgCancelUnknown: ledger.pgCancelUnknown,
        },
      });
    }

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

    let stockNote = "";
    if (claimed && claimed.length > 0) {
      if (!wantsRestock) {
        stockNote =
          "\n반품 입고 처리를 하지 않아 재고는 그대로 두었습니다. 물건이 돌아오면 재고 관리에서 직접 더해 주세요.";
      } else if (await stockWasDeducted(service, order.id)) {
        await restoreOrderStock(service, order);
        revalidateTag(CACHE_TAGS.products, { expire: 0 });
        stockNote = "\n재고를 다시 채웠습니다.";
      } else {
        stockNote = "\n이 주문은 재고가 줄어든 적이 없어 재고는 그대로 둡니다.";
      }
    }
    await appendOrderEvent(service, order.id, {
      kind: EVENT_KINDS.cancel,
      author,
      body: `카드 결제 기록이 없는 주문이라 결제 취소 없이 주문만 취소했습니다. 입금액은 직접 환급해 주세요. (사유: ${reason})${stockNote}`,
    });
    return NextResponse.json({
      orderId: order.id,
      status: nextStatus,
      refunded: "manual",
      manual: true,
      refund: {
        paid: base,
        refunded: base,
        remaining: 0,
        manual: true,
        pgCancelUnknown: ledger.pgCancelUnknown,
      },
    });
  }

  // ---------- 결제사 환불 ----------
  let cancelled: Record<string, unknown> | null = null;
  let forcedFull = false;
  try {
    cancelled = (await cancelPayment(
      payment.payment_key,
      reason,
      isPartial ? amount! : undefined
    )) as unknown as Record<string, unknown>;
  } catch (e) {
    if (e instanceof TossError && e.code === "ALREADY_CANCELED_PAYMENT") {
      // 결제사에서는 이미 전액 취소됨 — 전액 환불로 간주하고 DB 동기화만 진행 (멱등)
      forcedFull = true;
    } else if (e instanceof TossError) {
      console.error(
        `[admin/orders/refund] 결제 취소 실패 order=${order.order_no}: ${e.code} ${e.message}`
      );
      // 결제사 원문 메시지는 서버 기록에만 남긴다 — 대표가 읽을 수 있는 말이 아니다
      return NextResponse.json(
        {
          error:
            "결제사에서 취소를 거절했습니다. 남은 환불 가능액과 결제 상태를 확인한 뒤 다시 시도해 주세요.",
          refund: ledger,
        },
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

  // ---------- 부분 환불: payments 상태만 갱신 + 이력에 잔액까지 남긴다 ----------
  if (isPartial && !forcedFull) {
    await service.from("payments").update({ status: "partial_refunded" }).eq("id", payment.id);
    // 결제사가 알려 준 잔액을 그대로 적는다. 못 받았으면 뺄셈으로 채운다.
    const remaining = (cancelled ? balanceOf(cancelled) : null) ?? ledger.remaining - amount!;
    const eventBody = partialRefundBody(amount!, reason, remaining);
    const logged = await appendOrderEvent(service, order.id, {
      kind: EVENT_KINDS.refundPartial,
      author,
      body: eventBody,
    });
    return NextResponse.json({
      orderId: order.id,
      status: order.status,
      refunded: "partial",
      warning: logged ? undefined : RECORD_FAILED_WARNING,
      refund: {
        paid: ledger.paid,
        refunded: ledger.paid - remaining,
        remaining,
        manual: false,
        pgCancelUnknown: ledger.pgCancelUnknown,
      },
    });
  }

  // ---------- 잔액 전액 환불: payments → orders → 재고 복구 ----------
  await service.from("payments").update({ status: "refunded" }).eq("id", payment.id);

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
  let restocked = false;
  let logged = true;
  if (claimed && claimed.length > 0) {
    let stockNote: string;
    if (!wantsRestock) {
      // 배송이 끝난 주문의 환불 — 물건은 아직 고객에게 있다. 장부만 늘리지 않는다.
      stockNote = "반품 입고 처리를 하지 않아 재고는 그대로 두었습니다. 물건이 돌아오면 재고 관리에서 직접 더해 주세요.";
    } else if (await stockWasDeducted(service, order.id)) {
      // 수기로 '결제 완료' 만 눌러 둔 주문은 재고가 줄어든 적이 없다 — 그걸 되채우면 없는 재고가 생긴다
      await restoreOrderStock(service, order);
      // 재고가 복구된 경우에만 무효화 — 품절 표시가 판매중으로 되돌아갈 수 있다
      revalidateTag(CACHE_TAGS.products, { expire: 0 });
      restocked = true;
      stockNote = "재고를 다시 채웠습니다.";
    } else {
      stockNote = "이 주문은 재고가 줄어든 적이 없어 재고는 그대로 둡니다.";
    }
    logged = await appendOrderEvent(service, order.id, {
      kind: EVENT_KINDS.refundFull,
      author,
      body: `남은 금액 ${krw(ledger.remaining)}원을 모두 환불하고 주문을 마감했습니다. ${stockNote} (사유: ${reason})`,
    });
  }

  return NextResponse.json({
    orderId: order.id,
    status: nextStatus,
    refunded: "full",
    restocked,
    warning: logged ? undefined : RECORD_FAILED_WARNING,
    refund: {
      paid: ledger.paid,
      refunded: ledger.paid,
      remaining: 0,
      manual: false,
      pgCancelUnknown: ledger.pgCancelUnknown,
    },
  });
}
