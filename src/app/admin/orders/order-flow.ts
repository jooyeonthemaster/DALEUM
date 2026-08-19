/* ============================================================
   주문 상태 전이 규칙 — 화면과 서버가 **같은 표** 를 본다

   왜 이 파일이 필요한가:
   지금까지 상태 변경은 평면 <select> 였고, 서버 검증도 "관리자가 설정 가능한 상태 목록에
   들어 있는가" 하나뿐이었다. 그래서 배송 완료된 주문을 결제 대기로 한 번에 떨어뜨릴 수 있었다.
   네이티브 select 는 포커스만 잡힌 채 휠이 스치면 값이 바뀌므로 실수로도 일어난다.
   떨어진 주문은 고객 마이페이지에서 "입금 대기" 로 보이고 구매확정·리뷰가 막히며 매출에서도 빠진다.

   그래서 전이를 **한 칸씩** 으로 묶고, 되돌리는 방향은 무엇이 사라지는지 사람 말로 경고한 뒤
   확인을 받는다. 화면과 서버가 서로 다른 표를 들면 화면에서 막은 것이 서버에서 뚫리므로
   규칙은 이 파일 하나에만 둔다(순수 모듈이라 클라이언트·라우트 양쪽에서 그대로 가져다 쓴다).
   ============================================================ */

import type { OrderStatus } from "@/lib/types";

/** 정상 진행 순서 — 이 배열의 앞뒤 한 칸씩만 오갈 수 있다 */
export const ORDER_FLOW: OrderStatus[] = [
  "pending",
  "paid",
  "preparing",
  "shipped",
  "delivered",
  "confirmed",
];

/** 취소·환불은 상태 드롭다운이 아니라 환불 처리로만 간다 */
export const TERMINAL_STATUSES: OrderStatus[] = ["cancelled", "refunded"];

export type TransitionDirection = "forward" | "back";

export interface TransitionPlan {
  from: OrderStatus;
  to: OrderStatus;
  direction: TransitionDirection;
  /** 확인 창을 띄워야 하는가 — 되돌리기와 "입금 확인" 은 사람에게 한 번 물어본다 */
  needsConfirm: boolean;
  /** 확인 창에 띄울 한국어 문장 (무엇이 달라지는지) */
  warning: string;
}

function indexOf(status: OrderStatus): number {
  return ORDER_FLOW.indexOf(status);
}

/** 되돌릴 때 실제로 무엇이 사라지는지 — 막연한 "정말 변경할까요?" 는 아무도 안 읽는다 */
const BACK_WARNINGS: Partial<Record<OrderStatus, string>> = {
  pending: "결제 완료 표시가 사라집니다. 고객 화면에는 입금 대기 주문으로 보이고 매출 집계에서도 빠집니다.",
  paid: "상품 준비 표시가 사라집니다.",
  preparing: "배송중 표시가 사라져 고객 화면의 배송 안내가 없어집니다. 등록된 운송장은 그대로 남습니다.",
  shipped: "배송 완료 표시가 사라져 고객이 구매 확정과 리뷰 작성을 할 수 없게 됩니다.",
  delivered: "구매 확정이 풀립니다. 고객에게는 배송 완료 상태로 보입니다.",
};

/** 앞으로 갈 때 곁들이는 안내 — 확인이 필요한 것만 문장을 둔다 */
const FORWARD_WARNINGS: Partial<Record<OrderStatus, string>> = {
  paid: "입금을 확인한 주문만 결제 완료로 바꿔 주세요. 카드 결제가 아니므로 재고는 자동으로 줄지 않습니다.",
};

/**
 * 이 전이가 가능한가. 가능하면 계획(방향·확인 필요 여부·경고문)을, 아니면 null.
 * 취소/환불된 주문과 환불 요청 상태는 어느 방향으로도 움직이지 않는다.
 */
export function planTransition(from: OrderStatus, to: OrderStatus): TransitionPlan | null {
  if (from === to) return null;
  const fromIdx = indexOf(from);
  const toIdx = indexOf(to);
  if (fromIdx < 0 || toIdx < 0) return null;
  if (Math.abs(fromIdx - toIdx) !== 1) return null;

  const direction: TransitionDirection = toIdx > fromIdx ? "forward" : "back";
  if (direction === "back") {
    return {
      from,
      to,
      direction,
      needsConfirm: true,
      warning: BACK_WARNINGS[to] ?? "이전 단계로 되돌립니다.",
    };
  }
  const warning = FORWARD_WARNINGS[to];
  return { from, to, direction, needsConfirm: Boolean(warning), warning: warning ?? "" };
}

/** 다음 단계 (없으면 null) */
export function nextStatus(status: OrderStatus): OrderStatus | null {
  const i = indexOf(status);
  return i >= 0 && i < ORDER_FLOW.length - 1 ? ORDER_FLOW[i + 1] : null;
}

/** 이전 단계 (없으면 null) */
export function prevStatus(status: OrderStatus): OrderStatus | null {
  const i = indexOf(status);
  return i > 0 ? ORDER_FLOW[i - 1] : null;
}

/** 서버가 전이를 거절할 때 돌려줄 한국어 사유 */
export function rejectionReason(from: OrderStatus, to: OrderStatus): string {
  if (TERMINAL_STATUSES.includes(from)) {
    return "취소·환불된 주문의 상태는 바꿀 수 없습니다.";
  }
  if (from === "refund_requested") {
    return "환불 요청이 들어온 주문입니다. 환불 처리로 진행해 주세요.";
  }
  if (indexOf(to) < 0) {
    return "취소·환불로는 이 방법으로 바꿀 수 없습니다. 아래 환불 처리를 이용해 주세요.";
  }
  return "주문 상태는 한 단계씩만 바꿀 수 있습니다. 다음 단계 또는 이전 단계 버튼을 이용해 주세요.";
}
