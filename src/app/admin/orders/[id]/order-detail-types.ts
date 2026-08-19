/* ============================================================
   주문 상세 화면이 주고받는 모양 — 여러 조각으로 나뉜 섹션들이 같은 타입을 본다
   (한 파일이 500줄을 넘지 않도록 상세 화면을 섹션별로 갈랐다)
   ============================================================ */

import type {
  OrderStatus,
  OrderItem,
  Payment,
  Shipment,
  OrdererInfo,
  RecipientInfo,
} from "@/lib/types";

export interface AdminOrderDetail {
  id: string;
  order_no: string;
  status: OrderStatus;
  created_at: string;
  paid_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  subtotal: number;
  discount_total: number;
  shipping_fee: number;
  total: number;
  coupon_discount: number;
  vip_code: string | null;
  vip_campaign_id: string | null;
  /** 서버가 이력을 걷어 낸 **자유 메모만** 담아 보낸다 */
  admin_memo: string | null;
  user_id: string | null;
  orderer: OrdererInfo;
  recipient: RecipientInfo;
  order_items: OrderItem[];
  payments: Payment[];
  shipments: Shipment[];
}

/** 처리 이력 한 줄 — 시각은 이미 한국 시간 표기 문자열이다 */
export interface OrderEventView {
  at: string;
  kind: string;
  author: string | null;
  body: string;
}

/** 환불 잔액 — 서버가 계산한 값만 믿는다 (화면에서 다시 계산하지 않는다) */
export interface RefundLedgerView {
  paid: number;
  refunded: number;
  remaining: number;
  manual: boolean;
  /**
   * 금액을 알 수 없는 결제사 부분 취소가 있었는가.
   * true 면 remaining 은 실제보다 클 수 있다 — 화면이 그 사실을 반드시 말해야 한다.
   * (옛 응답에는 이 값이 없어 선택 항목으로 둔다)
   */
  pgCancelUnknown?: boolean;
}

export interface CustomerLink {
  id: string;
  name: string | null;
  email: string | null;
}
