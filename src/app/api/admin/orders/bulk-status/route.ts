import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { EVENT_KINDS, adminDisplayName } from "../order-log";
import { applyOrderMemo } from "../order-memo";

/**
 * POST /api/admin/orders/bulk-status — 오래 묵은 주문을 한 번에 정리한다.
 * body: { scope: "deliverStaleShipped" | "cancelStalePending", days?: number, commit?: boolean }
 *
 * 왜 필요한가:
 * ① 'delivered' 로 넘겨 주는 자동 장치가 어디에도 없다. 관리자가 주문을 하나씩 열어 손으로
 *    찍지 않으면 고객은 구매확정도 리뷰 작성도 영영 못 한다(둘 다 배송완료 이후에만 열린다).
 *    택배사 배송추적 연동은 이 유닛 범위 밖이라, 우선 "발송 후 N일 지난 배송중 주문" 을
 *    한 번에 배송완료로 정리할 수 있게 한다.
 * ② 결제 직전에 이탈한 입금 대기 주문이 목록에 계속 쌓이는데 정리할 수단이 없었다.
 *    입금 대기 주문은 보통 재고를 물고 있지 않고 결제 기록도 없어 결제사 호출 없이 취소된다.
 *    다만 **"pending 이면 결제 전"** 이 항상 참은 아니다 — 결제사 웹훅이 늦게 들어오면
 *    돈은 이미 받았는데 주문은 pending 으로 남는다. 그런 주문을 결제사 취소 없이 취소하면
 *    고객 돈만 들고 주문은 사라진다. 그래서 결제 기록이 있는 주문은 대상에서 뺀다.
 *
 * commit 없이 부르면 대상 건수만 알려 준다(미리보기). commit=true 일 때만 반영한다.
 */

const DEFAULT_DAYS = 3;
const MAX_APPLY = 200;

type Scope = "deliverStaleShipped" | "cancelStalePending";

interface Candidate {
  id: string;
  order_no: string;
  status: string;
}

/**
 * 결제 기록이 "돈이 오갔을 수 있다" 고 말하는 상태.
 * failed·cancelled 는 실패하거나 이미 취소된 시도라 남겨 두어도 취소에 지장이 없다.
 */
const MONEY_PAYMENT_STATUSES = ["ready", "paid", "partial_refunded", "refunded"];

function cutoffIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service, user } = auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const scope = body.scope as Scope;
  if (scope !== "deliverStaleShipped" && scope !== "cancelStalePending") {
    return NextResponse.json({ error: "처리할 대상을 알 수 없습니다." }, { status: 400 });
  }
  const rawDays = Number(body.days);
  const days = Number.isFinite(rawDays) ? Math.min(90, Math.max(1, Math.trunc(rawDays))) : DEFAULT_DAYS;
  const commit = body.commit === true;
  const cutoff = cutoffIso(days);

  // ---------- 대상 뽑기 ----------
  let candidates: Candidate[] = [];
  /** 결제 기록이 있어 자동 취소에서 뺀 건수 — 화면이 그 사실을 말해야 한다 */
  let needsReview = 0;
  if (scope === "deliverStaleShipped") {
    // 발송 시각은 shipments 에 있다. 중첩 조건을 질의로 거는 대신 배송중 주문을 넉넉히 받아
    // 발송일 기준으로 걸러낸다 — 배송중 주문 수는 애초에 크지 않다.
    const { data, error } = await service
      .from("orders")
      .select("id, order_no, status, shipments(shipped_at)")
      .eq("status", "shipped")
      .order("created_at", { ascending: true })
      .limit(1000);
    if (error) {
      console.error("[admin/orders/bulk-status] 배송중 조회 실패:", error.message);
      return NextResponse.json({ error: "주문을 불러오지 못했습니다." }, { status: 500 });
    }
    candidates = (data ?? [])
      .filter((o) => {
        const shipments = (o.shipments ?? []) as { shipped_at: string | null }[];
        const shippedAt = shipments.map((s) => s.shipped_at).filter(Boolean)[0];
        return Boolean(shippedAt && shippedAt < cutoff);
      })
      .map((o) => ({ id: o.id as string, order_no: o.order_no as string, status: o.status as string }));
  } else {
    const { data, error } = await service
      .from("orders")
      .select("id, order_no, status, payments(status)")
      .eq("status", "pending")
      .lt("created_at", cutoff)
      .order("created_at", { ascending: true })
      .limit(1000);
    if (error) {
      console.error("[admin/orders/bulk-status] 입금 대기 조회 실패:", error.message);
      return NextResponse.json({ error: "주문을 불러오지 못했습니다." }, { status: 500 });
    }
    // 결제 기록이 붙어 있는 주문은 "결제 전" 이 아니다 — 사람이 하나씩 확인해야 한다
    for (const o of data ?? []) {
      const payments = (o.payments ?? []) as { status: string }[];
      if (payments.some((pmt) => MONEY_PAYMENT_STATUSES.includes(pmt.status))) {
        needsReview += 1;
        continue;
      }
      candidates.push({
        id: o.id as string,
        order_no: o.order_no as string,
        status: o.status as string,
      });
    }
  }

  if (!commit) {
    return NextResponse.json({ committed: false, days, count: candidates.length, needsReview });
  }
  if (candidates.length === 0) {
    return NextResponse.json({ committed: true, days, count: 0, applied: 0, failed: 0, needsReview });
  }

  // ---------- 반영 ----------
  const author = await adminDisplayName(service, user.id);
  const targets = candidates.slice(0, MAX_APPLY);
  let applied = 0;
  let failed = 0;

  for (const order of targets) {
    const patch =
      scope === "deliverStaleShipped"
        ? { status: "delivered" }
        : {
            status: "cancelled",
            cancelled_at: new Date().toISOString(),
            cancel_reason: `입금이 ${days}일 넘게 확인되지 않아 일괄 취소`,
          };

    // 조건부 갱신 — 그 사이에 상태가 바뀐 주문은 건드리지 않는다
    const { data: claimed, error } = await service
      .from("orders")
      .update(patch)
      .eq("id", order.id)
      .eq("status", order.status)
      .select("id");
    if (error || !claimed || claimed.length === 0) {
      failed += 1;
      continue;
    }

    // 주문만 배송 완료로 바꾸고 운송장 기록은 '배송중' 으로 남겨 두면 두 숫자가 영영 어긋난다.
    // 나중에 택배사 배송추적을 붙일 때 이 불일치가 그대로 오판의 근거가 되므로 함께 맞춘다.
    if (scope === "deliverStaleShipped") {
      await service
        .from("shipments")
        .update({ status: "delivered", delivered_at: new Date().toISOString() })
        .eq("order_id", order.id)
        .neq("status", "delivered");
    }

    // 이력은 admin_memo 를 쓰는 유일한 창구를 거친다 — 여기서 직접 읽고 쓰면
    // 그 사이 들어온 환불 이력을 통째로 덮어쓴다(order-memo.ts 주석 참고)
    await applyOrderMemo(service, order.id, {
      append: [
        {
          kind: scope === "deliverStaleShipped" ? EVENT_KINDS.status : EVENT_KINDS.cancel,
          author,
          body:
            scope === "deliverStaleShipped"
              ? `발송 후 ${days}일이 지나 배송 완료로 일괄 정리했습니다.`
              : `입금이 ${days}일 넘게 확인되지 않아 일괄 취소했습니다. 결제 기록이 없는 주문이라 결제사 취소와 재고 복구는 없습니다.`,
        },
      ],
    });
    applied += 1;
  }

  return NextResponse.json({
    committed: true,
    days,
    count: candidates.length,
    applied,
    failed,
    needsReview,
    /** 한 번에 처리하는 상한을 넘겨 남은 건수 */
    remaining: Math.max(0, candidates.length - targets.length),
  });
}
