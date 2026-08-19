"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { Help } from "@/components/admin/Field";
import { ORDER_STATUS_LABELS } from "@/lib/admin-labels";
import {
  ORDER_FLOW,
  nextStatus,
  planTransition,
  prevStatus,
  type TransitionPlan,
} from "../order-flow";
import type { OrderStatus } from "@/lib/types";

/* ============================================================
   주문 상태 — 단계 표시줄 + '다음 단계' 버튼

   왜 드롭다운을 없앴는가:
   평면 <select> 는 포커스가 잡힌 채 마우스 휠이 스치기만 해도 값이 바뀐다. 그렇게 배송 완료
   주문이 '결제 대기' 로 떨어지면 고객 화면에는 입금 대기로 보이고 구매확정·리뷰가 막히며
   매출 집계에서도 빠지는데, 되돌릴 근거가 될 이력 화면조차 없었다.
   그래서 진행은 버튼 하나로, 되돌리기는 따로 떼어 무엇이 사라지는지 확인받는다.
   ============================================================ */

interface StatusFlowSectionProps {
  status: OrderStatus;
  busy: boolean;
  error: string | null;
  onChange: (next: OrderStatus) => void;
}

export default function StatusFlowSection({
  status,
  busy,
  error,
  onChange,
}: StatusFlowSectionProps) {
  const [pending, setPending] = useState<TransitionPlan | null>(null);

  const currentIndex = ORDER_FLOW.indexOf(status);
  const closed = currentIndex < 0; // 취소·환불·환불 요청
  const forward = nextStatus(status);
  const backward = prevStatus(status);

  function request(to: OrderStatus | null) {
    if (!to || busy) return;
    const plan = planTransition(status, to);
    if (!plan) return;
    if (plan.needsConfirm) {
      setPending(plan);
      return;
    }
    onChange(to);
  }

  return (
    <section className="border border-ink-200 bg-cream-50">
      <div className="px-5 py-3.5 hairline-b">
        <h2 className="text-[13px] font-semibold tracking-wide text-ink-500">주문 진행</h2>
      </div>
      <div className="p-5">
        {closed ? (
          <p className="text-sm text-ink-500">
            {ORDER_STATUS_LABELS[status]} 상태입니다. 진행 단계는 더 바꿀 수 없습니다.
          </p>
        ) : (
          <>
            {/* 단계 표시줄 — 지금 어디에 있고 다음이 무엇인지 한눈에 */}
            <ol className="space-y-2">
              {ORDER_FLOW.map((step, i) => {
                const done = i < currentIndex;
                const here = i === currentIndex;
                return (
                  <li key={step} className="flex items-center gap-2.5">
                    <span
                      aria-hidden
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${
                        here
                          ? "bg-forest-700 text-cream-50"
                          : done
                            ? "bg-forest-100 text-forest-700"
                            : "border border-ink-200 text-ink-300"
                      }`}
                    >
                      {done ? <Check size={12} strokeWidth={2} /> : i + 1}
                    </span>
                    <span
                      className={`text-sm ${
                        here ? "font-semibold text-ink-900" : done ? "text-ink-500" : "text-ink-300"
                      }`}
                    >
                      {ORDER_STATUS_LABELS[step]}
                      {here && <span className="ml-2 text-xs text-forest-700">지금 여기</span>}
                    </span>
                  </li>
                );
              })}
            </ol>

            <div className="mt-5 space-y-2">
              {forward && (
                <button
                  type="button"
                  onClick={() => request(forward)}
                  disabled={busy}
                  className="w-full bg-forest-700 px-4 py-2.5 text-sm text-cream-50 transition-colors hover:bg-forest-800 disabled:opacity-50"
                >
                  {busy ? "바꾸는 중…" : `다음 단계로 · ${ORDER_STATUS_LABELS[forward]}(으)로 변경`}
                </button>
              )}
              {backward && (
                <button
                  type="button"
                  onClick={() => request(backward)}
                  disabled={busy}
                  className="w-full border border-ink-200 px-4 py-2 text-xs text-ink-600 transition-colors hover:bg-cream-100 disabled:opacity-50"
                >
                  이전 단계로 되돌리기 · {ORDER_STATUS_LABELS[backward]}
                </button>
              )}
            </div>

            <Help>
              단계는 한 칸씩만 움직입니다. 취소·환불은 아래 환불 처리로만 진행됩니다.
            </Help>
          </>
        )}
        {error && <Help tone="error">{error}</Help>}
      </div>

      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={() => {
          if (pending) onChange(pending.to);
          setPending(null);
        }}
        title={
          pending
            ? `${ORDER_STATUS_LABELS[pending.from]} → ${ORDER_STATUS_LABELS[pending.to]}`
            : "상태 변경"
        }
        description={pending ? `${pending.warning}\n\n진행할까요?` : ""}
        confirmLabel="변경"
        danger={pending?.direction === "back"}
      />
    </section>
  );
}
