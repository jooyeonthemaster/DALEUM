import type { OrderStatus } from "@/lib/types";
import { ORDER_STATUS_LABELS } from "@/lib/constants";

/** 상점 톤의 주문 상태 라벨 — 점(dot) + 텍스트. 관리자 StatusChip과 별개. */
const TONES: Record<OrderStatus, { dot: string; text: string }> = {
  pending: { dot: "bg-ink-300", text: "text-ink-500" },
  paid: { dot: "bg-forest-500", text: "text-forest-700" },
  preparing: { dot: "bg-forest-500", text: "text-forest-700" },
  shipped: { dot: "bg-forest-600", text: "font-semibold text-forest-700" },
  delivered: { dot: "bg-ink-900", text: "text-ink-900" },
  confirmed: { dot: "bg-forest-800", text: "text-ink-900" },
  cancelled: { dot: "bg-ink-300", text: "text-ink-400" },
  refund_requested: { dot: "bg-signal-red", text: "text-signal-red" },
  refunded: { dot: "bg-ink-400", text: "text-ink-500" },
};

export interface OrderStatusLabelProps {
  status: OrderStatus;
  className?: string;
}

export default function OrderStatusLabel({ status, className = "" }: OrderStatusLabelProps) {
  const tone = TONES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[13px] ${tone.text} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} aria-hidden />
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}
