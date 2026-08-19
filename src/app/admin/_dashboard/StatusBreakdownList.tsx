"use client";

/* ============================================================
   대시보드 "상태별 주문 현황" 목록

   DashboardClient 가 400줄을 넘겨 떼어냈다. 이 목록에는 상태 순서와
   '환불 요청' 각주가 함께 붙어 있어서, 화면 본문에 두면 주문 흐름 이야기와
   대시보드 레이아웃 이야기가 한 파일에서 뒤섞인다.
   ============================================================ */

import StatusChip from "@/components/admin/StatusChip";
import { krw } from "@/lib/format";
import type { OrderStatus } from "@/lib/types";

/** 대시보드에 표시할 상태 순서 — 주문이 실제로 흘러가는 차례대로 */
const STATUS_ORDER: OrderStatus[] = [
  "pending",
  "paid",
  "preparing",
  "shipped",
  "delivered",
  "confirmed",
  "refund_requested",
  "cancelled",
  "refunded",
];

export default function StatusBreakdownList({
  statusCounts,
}: {
  statusCounts: Record<OrderStatus, number>;
}) {
  return (
    <ul className="divide-y divide-ink-100">
      {STATUS_ORDER.map((s) => {
        const count = statusCounts[s] ?? 0;
        // '결제 완료' 만 초록으로 띄운다 — 지금 당장 발송을 준비해야 하는 유일한 칸이다
        const needsAction = s === "paid" && count > 0;
        return (
          <li key={s} className="py-2">
            <div className="flex items-center justify-between">
              <StatusChip status={s} />
              <span
                className={`text-sm krw ${
                  needsAction ? "font-semibold text-forest-700" : "text-ink-700"
                }`}
              >
                {krw(count)}건
                {needsAction && (
                  <span className="ml-1.5 text-xs font-normal text-forest-600">준비 필요</span>
                )}
              </span>
            </div>
            {/* 이 숫자가 왜 늘 0인지 그 자리에서 말한다 — 설명 없이 0만 놓여 있으면
                '환불 요청이 들어오면 여기 뜬다' 고 믿게 되고, 실제로는 그런 창구가 없다.
                주문이 이 상태로 넘어오는 경로가 저장소 어디에도 없다(고객 화면에 요청
                버튼이 없고, 관리자가 손으로 바꿀 수 있는 상태 목록에도 빠져 있다). */}
            {s === "refund_requested" && (
              <p className="mt-1 text-[11px] leading-relaxed text-ink-400">
                지금은 고객이 직접 환불을 요청하는 창구가 없어 이 숫자는 늘 0입니다. 환불은 주문을
                열어 [환불 처리]로 진행합니다.
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
