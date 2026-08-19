import type { OrderStatus } from "@/lib/types";
import { ORDER_STATUS_TONES } from "@/lib/constants";
// 라벨은 관리자 용어 규범을 거쳐 가져온다 — 규범이 고객 화면과 같은 말을 쓰도록 묶어 두었으므로
// 이 칩과 주문 화면의 진행 단계 목록이 같은 상태를 두 이름으로 부르는 일이 없어진다.
import { ORDER_STATUS_LABELS } from "@/lib/admin-labels";

export interface StatusChipProps {
  status: OrderStatus;
  className?: string;
}

/** 주문 상태 칩 — 라벨은 admin-labels, 색은 constants 를 따른다 */
export default function StatusChip({ status, className = "" }: StatusChipProps) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${ORDER_STATUS_TONES[status]} ${className}`}
    >
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}
