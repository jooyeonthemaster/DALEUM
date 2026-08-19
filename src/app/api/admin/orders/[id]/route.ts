import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { isUuid, cleanStr, sanitizeRecipient } from "@/lib/orders";
import { ORDER_STATUS_LABELS } from "@/lib/admin-labels";
import { planTransition, rejectionReason } from "@/app/admin/orders/order-flow";
import { EVENT_KINDS, MEMO_KINDS, adminDisplayName, parseOrderMemo } from "../order-log";
import { refundLedger } from "../order-refund-ledger";
import { applyOrderMemo } from "../order-memo";
import type { OrderStatus, RecipientInfo } from "@/lib/types";

/**
 * GET   /api/admin/orders/[id] — 주문 상세 (상품 라인 + 결제 + 운송장 + 고객 + 처리 이력 + 환불 잔액)
 * PATCH /api/admin/orders/[id] — 상태 한 단계 이동 / 자유 메모 / 배송지 수정 / 이력 남기기
 *
 * 화면에 나가는 admin_memo 는 **자유 메모만** 이다. 시스템 기록은 events 로 따로 내보낸다
 * (order-log.ts 의 주석 참고 — 예전에는 한 칸을 공유해 메모를 고치면 환불 이력이 지워졌다).
 */

interface PaymentRow {
  payment_key: string | null;
  status: string;
  amount: number;
}

/** 환불 기준 금액 — 결제사 기록이 있으면 그 금액, 수기 결제 주문이면 주문 총액 */
function refundBase(payments: PaymentRow[] | null | undefined, total: number) {
  const payment = payments?.find(
    (p) => (p.status === "paid" || p.status === "partial_refunded") && p.payment_key
  );
  return { paid: payment?.amount ?? total, manual: !payment };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  }

  const { data: order, error } = await service
    .from("orders")
    .select("*, order_items(*), payments(*), shipments(*)")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[admin/orders/:id] 조회 실패:", error.message);
    return NextResponse.json({ error: "주문을 불러오지 못했습니다." }, { status: 500 });
  }
  if (!order) {
    return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  }

  // 회원 주문이면 고객 프로필 링크 정보
  let customer: { id: string; name: string | null; email: string | null } | null = null;
  if (order.user_id) {
    const { data: profile } = await service
      .from("profiles")
      .select("id, name, email")
      .eq("id", order.user_id)
      .maybeSingle();
    customer = profile ?? null;
  }

  const { memo, events } = parseOrderMemo(order.admin_memo as string | null);
  const base = refundBase(order.payments as PaymentRow[] | null, order.total as number);

  return NextResponse.json({
    // 원문 admin_memo 에는 옛 형식의 UTC 시각·영문 오류가 섞여 있다 — 화면으로 흘려보내지 않는다
    order: { ...order, admin_memo: memo },
    customer,
    memo,
    events,
    refund: refundLedger(base.paid, events, base.manual),
    memoKinds: MEMO_KINDS,
  });
}

/** 배송지 한 줄 요약 — 이력에 "무엇이 무엇으로 바뀌었는지" 를 남기기 위해 */
function describeRecipient(r: RecipientInfo | null | undefined): string {
  if (!r) return "(없음)";
  const address = [r.address1, r.address2].filter(Boolean).join(" ");
  return `${r.name} · ${r.phone} · (${r.postcode}) ${address}`;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const wantsStatus = body.status !== undefined;
  const wantsMemo = "adminMemo" in body;
  const wantsRecipient = body.recipient !== undefined;
  const wantsEvent = body.event !== undefined;
  if (!wantsStatus && !wantsMemo && !wantsRecipient && !wantsEvent) {
    return NextResponse.json({ error: "변경할 내용이 없습니다." }, { status: 400 });
  }

  const { data: current } = await service
    .from("orders")
    .select("id, status, paid_at, admin_memo, recipient, total, payments(payment_key, status, amount)")
    .eq("id", id)
    .maybeSingle();
  if (!current) {
    return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  }

  const currentStatus = current.status as OrderStatus;
  const author = await adminDisplayName(service, user.id);
  const updates: Record<string, unknown> = {};

  /**
   * 이번 요청이 **새로 남기는** 이력만 모은다.
   * 저장돼 있던 이력을 여기서 미리 읽어 두었다가 그대로 다시 써 넣던 것이 사고의 원인이었다 —
   * 900ms 자동저장이 그 사이 들어온 부분 환불 기록을 통째로 덮어써 초과 환불이 다시 열렸다.
   * 이제 저장 **직전에** applyOrderMemo 가 다시 읽어 앞에 붙인다(order-memo.ts 주석 참고).
   */
  const newEvents: { kind: string; body: string; author?: string | null }[] = [];

  // ---------- 상태: 한 단계씩만 ----------
  // 예전에는 목록에 있는 상태면 어디로든 뛸 수 있어, 배송 완료 주문이 결제 대기로 떨어졌다.
  let nextStatus: OrderStatus | null = null;
  if (wantsStatus) {
    const s = body.status;
    const plan = typeof s === "string" ? planTransition(currentStatus, s as OrderStatus) : null;
    if (!plan) {
      return NextResponse.json(
        { error: rejectionReason(currentStatus, s as OrderStatus) },
        { status: 400 }
      );
    }
    nextStatus = plan.to;
    updates.status = nextStatus;
    // 수동으로 결제완료 처리 시 결제 시각 보정 (무통장 등 예외 운영)
    if (nextStatus === "paid" && !current.paid_at) {
      updates.paid_at = new Date().toISOString();
    }
    newEvents.push({
      kind: EVENT_KINDS.status,
      author,
      body: `${ORDER_STATUS_LABELS[currentStatus]} → ${ORDER_STATUS_LABELS[nextStatus]}`,
    });
  }

  // ---------- 배송지 수정 ----------
  // 오타 하나 때문에 취소·재주문을 시키던 자리다. 발송 이후에도 기록용 수정은 허용하되
  // 이력에 이전 주소와 새 주소를 함께 남겨 실제 발송지와 시스템 기록이 어긋나지 않게 한다.
  if (wantsRecipient) {
    const next = sanitizeRecipient(body.recipient);
    if (!next) {
      return NextResponse.json(
        { error: "받는 분 이름·연락처·우편번호·주소를 모두 채워 주세요." },
        { status: 400 }
      );
    }
    const before = describeRecipient(current.recipient as RecipientInfo | null);
    const after = describeRecipient(next);
    if (before !== after) {
      updates.recipient = next;
      newEvents.push({
        kind: EVENT_KINDS.shipping,
        author,
        body: `이전 ${before}\n변경 ${after}`,
      });
    }
  }

  // ---------- 이력 한 줄 남기기 (고객 통화·클레임 등) ----------
  if (wantsEvent) {
    const e = body.event as Record<string, unknown> | null;
    const kindKey = typeof e?.kind === "string" ? e.kind : "note";
    const text = cleanStr(e?.body, 1000);
    if (!text) {
      return NextResponse.json({ error: "남길 내용을 입력해 주세요." }, { status: 400 });
    }
    newEvents.push({
      kind: MEMO_KINDS[kindKey] ?? MEMO_KINDS.note,
      author,
      body: text,
    });
  }

  // ---------- 자유 메모 ----------
  // 받은 값은 **자유 메모만** 이다. 이력은 applyOrderMemo 가 저장 직전에 다시 읽어 붙인다.
  const nextMemo = wantsMemo ? (cleanStr(body.adminMemo, 4000) ?? "") : undefined;
  const touchesMemo = wantsMemo || newEvents.length > 0;
  const base = refundBase(current.payments as PaymentRow[] | null, current.total as number);

  if (Object.keys(updates).length === 0 && !touchesMemo) {
    // 배송지를 열었다가 그대로 저장한 경우 — 실패가 아니라 "바뀐 것이 없다"
    const parsed = parseOrderMemo(current.admin_memo as string | null);
    return NextResponse.json({
      order: { id, status: currentStatus, admin_memo: parsed.memo },
      memo: parsed.memo,
      events: parsed.events,
      refund: refundLedger(base.paid, parsed.events, base.manual),
    });
  }

  // 상태·배송지처럼 실제로 달라지는 것을 먼저 확정하고, 기록은 그 뒤에 남긴다.
  // (두 쓰기를 한 트랜잭션으로 묶을 수단이 없다 — 순서를 뒤집으면 일어나지도 않은 일이 이력에 남는다)
  let updated: Record<string, unknown> | null = null;
  if (Object.keys(updates).length > 0) {
    const { data, error } = await service
      .from("orders")
      .update(updates)
      .eq("id", id)
      .select("id, status, paid_at, recipient, total, updated_at")
      .maybeSingle();
    if (error || !data) {
      console.error("[admin/orders/:id] 수정 실패:", error?.message);
      return NextResponse.json({ error: "주문 정보를 저장하지 못했습니다." }, { status: 500 });
    }
    updated = data as Record<string, unknown>;
  }

  const log = await applyOrderMemo(service, id, { memo: nextMemo, append: newEvents });
  if (!log.ok) {
    // 여기까지 왔다는 것은 재시도를 다 쓰도록 다른 경로가 계속 이 주문을 고쳤다는 뜻이다.
    // 조용히 성공으로 돌려주면 대표는 기록이 남은 줄 안다 — 그래서 사람에게 알린다.
    return NextResponse.json(
      {
        error: updated
          ? "요청하신 변경은 반영했지만, 다른 곳에서 같은 주문을 동시에 고치고 있어 기록을 남기지 못했습니다. 화면을 새로 불러온 뒤 다시 시도해 주세요."
          : "다른 곳에서 같은 주문을 동시에 고치고 있어 저장하지 못했습니다. 화면을 새로 불러온 뒤 다시 시도해 주세요.",
      },
      { status: 409 }
    );
  }

  return NextResponse.json({
    order: { ...(updated ?? { id, status: currentStatus }), admin_memo: log.memo },
    memo: log.memo,
    events: log.events,
    refund: refundLedger(base.paid, log.events, base.manual),
  });
}
