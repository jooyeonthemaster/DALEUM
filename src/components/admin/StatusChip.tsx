import type { OrderStatus } from "@/lib/types";
import { ORDER_STATUS_LABELS, ORDER_STATUS_TONES } from "@/lib/constants";

export interface StatusChipProps {
  status: OrderStatus;
  className?: string;
}

/** 주문 상태 칩 — 라벨/톤은 constants의 ORDER_STATUS_LABELS/TONES를 따른다 */
export default function StatusChip({ status, className = "" }: StatusChipProps) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${ORDER_STATUS_TONES[status]} ${className}`}
    >
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}
