"use client";

import { useState } from "react";
import Modal from "@/components/admin/Modal";
import { Input, Label, Help } from "@/components/admin/Field";
import { krw } from "@/lib/format";
import type { OrderStatus, Payment } from "@/lib/types";

/* ============================================================
   환불/취소 섹션 — 사유 필수, 전액/부분 선택.
   pending 주문은 PG 호출 없이 즉시 취소된다.
   ============================================================ */

interface RefundSectionProps {
  orderId: string;
  orderNo: string;
  status: OrderStatus;
  total: number;
  payments: Payment[];
  onDone: (status: OrderStatus) => void;
}

export default function RefundSection({
  orderId,
  orderNo,
  status,
  total,
  payments,
  onDone,
}: RefundSectionProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<"full" | "partial">("full");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isPending = status === "pending";
  const done = status === "cancelled" || status === "refunded";
  const payment = payments.find(
    (p) => (p.status === "paid" || p.status === "partial_refunded") && p.payment_key
  );

  const parsedAmount = Number.parseInt(amount, 10);
  const amountValid =
    mode === "full" ||
    (Number.isInteger(parsedAmount) && parsedAmount > 0 && parsedAmount <= (payment?.amount ?? total));
  const canSubmit = reason.trim().length > 0 && amountValid && !busy;

  function openModal() {
    setReason("");
    setMode("full");
    setAmount("");
    setError(null);
    setOpen(true);
  }

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { reason: reason.trim() };
      if (!isPending && mode === "partial") body.amount = parsedAmount;
      const res = await fetch(`/api/admin/orders/${orderId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "환불 처리에 실패했습니다.");
      onDone(json.status as OrderStatus);
      if (json.refunded === "partial") {
        setNotice(`부분 환불 ${krw(parsedAmount)}원이 처리되었습니다.`);
      } else if (json.alreadyProcessed) {
        setNotice(json.message ?? "이미 처리된 주문입니다.");
      } else {
        setNotice(isPending ? "주문이 취소되었습니다." : "전액 환불이 완료되었습니다.");
      }
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "환불 처리에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border border-ink-200 bg-cream-50">
      <div className="px-5 py-3.5 hairline-b">
        <h2 className="label-caps text-ink-400">환불 · 취소</h2>
      </div>
      <div className="p-5">
        {done ? (
          <p className="text-sm text-ink-400">이미 취소/환불 처리된 주문입니다.</p>
        ) : (
          <>
            <button
              type="button"
              onClick={openModal}
              className="w-full border border-signal-red px-4 py-2.5 text-sm text-signal-red transition-colors hover:bg-signal-red hover:text-cream-50"
            >
              {isPending ? "주문 취소" : "환불 처리"}
            </button>
            <Help>
              {isPending
                ? "결제 전 주문 — PG 호출 없이 즉시 취소됩니다."
                : "전액 환불 시 결제가 취소되고 재고가 복구됩니다."}
            </Help>
          </>
        )}
        {notice && <p className="mt-3 text-xs text-forest-700">{notice}</p>}
      </div>

      <Modal
        open={open}
        onClose={busy ? () => undefined : () => setOpen(false)}
        title={isPending ? "주문 취소" : "환불 처리"}
        footer={
          <>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="border border-ink-200 bg-cream-50 px-4 py-2 text-sm text-ink-700 transition-colors hover:bg-cream-100 disabled:opacity-50"
            >
              닫기
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="bg-signal-red px-4 py-2 text-sm text-cream-50 transition-colors hover:bg-[#9c3c27] disabled:opacity-50"
            >
              {busy ? "처리 중…" : isPending ? "취소 확정" : "환불 확정"}
            </button>
          </>
        }
      >
        <div className="space-y-5">
          <p className="text-sm leading-relaxed text-ink-600">
            주문 <span className="krw font-medium text-ink-900">{orderNo}</span>
            {isPending
              ? " 을(를) 취소합니다. 결제 전 주문이므로 PG 호출 없이 즉시 취소됩니다."
              : " 의 결제를 취소합니다. 이 작업은 되돌릴 수 없습니다."}
          </p>

          <div>
            <Label htmlFor="refund-reason" requiredMark>
              사유
            </Label>
            <Input
              id="refund-reason"
              value={reason}
              placeholder="예: 고객 요청, 재고 부족"
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          {!isPending && payment && (
            <div>
              <Label requiredMark>환불 범위</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode("full")}
                  aria-pressed={mode === "full"}
                  className={`flex-1 border px-3 py-2.5 text-sm transition-colors ${
                    mode === "full"
                      ? "border-forest-700 bg-forest-700 text-cream-50"
                      : "border-ink-200 bg-cream-50 text-ink-700 hover:bg-cream-100"
                  }`}
                >
                  전액 ({krw(payment.amount)}원)
                </button>
                <button
                  type="button"
                  onClick={() => setMode("partial")}
                  aria-pressed={mode === "partial"}
                  className={`flex-1 border px-3 py-2.5 text-sm transition-colors ${
                    mode === "partial"
                      ? "border-forest-700 bg-forest-700 text-cream-50"
                      : "border-ink-200 bg-cream-50 text-ink-700 hover:bg-cream-100"
                  }`}
                >
                  부분 환불
                </button>
              </div>
              {mode === "partial" && (
                <div className="mt-3">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={payment.amount}
                    value={amount}
                    placeholder={`환불 금액 (최대 ${krw(payment.amount)}원)`}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  <Help>부분 환불은 주문 상태와 재고를 변경하지 않고 메모에 기록됩니다.</Help>
                </div>
              )}
              {mode === "full" && (
                <Help>전액 환불 시 재고가 복구되고 주문이 취소/환불 상태로 전환됩니다.</Help>
              )}
            </div>
          )}

          {!isPending && !payment && (
            <Help tone="error">
              결제 기록을 찾을 수 없습니다. 환불 확정 시 서버에서 다시 확인합니다.
            </Help>
          )}

          {error && <Help tone="error">{error}</Help>}
        </div>
      </Modal>
    </section>
  );
}
