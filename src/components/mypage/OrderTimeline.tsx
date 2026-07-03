import type { OrderStatus } from "@/lib/types";

const STEPS = ["주문 접수", "결제 완료", "상품 준비", "배송중", "배송 완료"] as const;

/** 취소/환불 계열은 타임라인을 렌더하지 않는다 (호출부에서 취소 안내 패널 표시) */
const STATUS_INDEX: Partial<Record<OrderStatus, number>> = {
  pending: 0,
  paid: 1,
  preparing: 2,
  shipped: 3,
  delivered: 4,
  confirmed: 4,
};

export interface OrderTimelineProps {
  status: OrderStatus;
  className?: string;
}

/** 주문 → 결제 → 준비 → 배송 → 완료 헤어라인 스텝 타임라인 */
export default function OrderTimeline({ status, className = "" }: OrderTimelineProps) {
  const current = STATUS_INDEX[status];
  if (current == null) return null;

  return (
    <ol className={`flex ${className}`} aria-label="주문 진행 상태">
      {STEPS.map((label, i) => {
        const done = i <= current;
        const isCurrent = i === current;
        return (
          <li key={label} className="relative flex-1">
            {i > 0 && (
              <span
                aria-hidden
                className={`absolute right-1/2 top-[4px] h-px w-full ${
                  done ? "bg-forest-600" : "bg-ink-200"
                }`}
              />
            )}
            <span
              aria-hidden
              className={`relative z-10 mx-auto block h-[9px] w-[9px] rounded-full ${
                done ? "bg-forest-600" : "border border-ink-300 bg-cream-50"
              }`}
            />
            <span
              className={`mt-2.5 block text-center text-[11px] md:text-xs ${
                done
                  ? isCurrent
                    ? "font-semibold text-ink-900"
                    : "text-ink-600"
                  : "text-ink-400"
              }`}
              aria-current={isCurrent ? "step" : undefined}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
