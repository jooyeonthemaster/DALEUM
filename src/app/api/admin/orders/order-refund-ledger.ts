/* ============================================================
   환불 잔액 되읽기 — "지금 얼마까지 더 환불해도 되는가"

   누계를 담을 컬럼이 없다. payments 는 부분 환불 뒤에도 원금을 그대로 들고 있어서
   그 값을 믿으면 10만원 주문에 9만원을 환불한 뒤에도 "최대 100,000원" 이라고 안내한다.
   그래서 처리 이력에 적힌 한국어 문장을 되읽어 누계를 만든다 — 사람이 읽는 문장이 곧
   다음 계산의 근거다(그래서 order-log.ts 의 접기 규칙이 환불 이력을 마지막까지 지킨다).

   (order-log.ts 가 400줄을 넘겨 이 계산만 따로 뗐다. order-log.ts 는 이 파일을 참조하지 않는다)
   ============================================================ */

import { EVENT_KINDS, PG_PARTIAL_CANCEL_NOTE, type OrderEvent } from "./order-log";

export interface RefundLedger {
  /** 결제된 금액(수기 결제 주문은 주문 총액) */
  paid: number;
  /** 지금까지 환불한 누계 */
  refunded: number;
  /** 앞으로 더 환불할 수 있는 금액 */
  remaining: number;
  /** 결제사 결제 기록이 없는 수기(계좌이체 등) 주문인가 */
  manual: boolean;
  /**
   * 금액을 알 수 없는 결제사 부분 취소가 있었는가.
   * true 면 remaining 은 **실제보다 클 수 있다** — 화면은 그 사실을 반드시 말해야 한다.
   */
  pgCancelUnknown: boolean;
}

function parseWon(text: string): number {
  return Number.parseInt(text.replace(/,/g, ""), 10);
}

/**
 * 이력에서 환불 누계를 되읽는다.
 *
 * 누계를 담을 컬럼이 없어서(payments 는 부분 환불 뒤에도 원금을 그대로 들고 있다)
 * 이력에 적힌 금액을 더한다. 부분 환불 이력에는 결제사가 알려 준 잔액도 함께 적어 두므로,
 * 마지막에 적힌 잔액과 뺄셈 결과 중 **작은 쪽** 을 쓴다 — 초과 환불은 돈이 나가고 나면
 * 되돌릴 수 없으니 항상 보수적으로 잡는다.
 */
export function refundLedger(paid: number, events: OrderEvent[], manual = false): RefundLedger {
  let sum = 0;
  let authoritative: number | null = null;
  let pgCancelUnknown = false;

  for (const e of events) {
    // 결제사 쪽 부분 취소는 금액이 없어 누계에 더할 수 없다 — 있었다는 사실만 들고 나간다
    if (e.kind === EVENT_KINDS.attention && e.body.includes(PG_PARTIAL_CANCEL_NOTE)) {
      pgCancelUnknown = true;
    }
    if (e.kind !== EVENT_KINDS.refundPartial) continue;
    const amount = /^([\d,]+)원을 환불/.exec(e.body);
    if (amount) sum += parseWon(amount[1]);
    const rest = /남은 환불 가능액 ([\d,]+)원/.exec(e.body);
    if (rest) authoritative = parseWon(rest[1]);
  }

  const bySum = Math.max(0, paid - sum);
  const remaining = authoritative == null ? bySum : Math.max(0, Math.min(bySum, authoritative));
  return { paid, refunded: Math.max(0, paid - remaining), remaining, manual, pgCancelUnknown };
}

/** 부분 환불 이력 본문 — 사람이 읽는 문장이 곧 다음 계산의 근거가 된다 */
export function partialRefundBody(
  amount: number,
  reason: string,
  remaining: number | null
): string {
  const head = `${amount.toLocaleString("ko-KR")}원을 환불했습니다. (사유: ${reason})`;
  if (remaining == null) return head;
  return `${head}\n남은 환불 가능액 ${remaining.toLocaleString("ko-KR")}원`;
}
