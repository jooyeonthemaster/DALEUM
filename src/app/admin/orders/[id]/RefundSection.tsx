"use client";

import { useState } from "react";
import Modal from "@/components/admin/Modal";
import { Input, Label, Help, Toggle } from "@/components/admin/Field";
import { krw } from "@/lib/format";
import type { OrderStatus } from "@/lib/types";
import type { RefundLedgerView } from "./order-detail-types";

/* ============================================================
   환불 · 취소

   왜 화면 위쪽에 3줄 요약이 고정으로 붙는가:
   예전에는 결제 원금만 보고 "전액 (100,000원)", "최대 100,000원" 이라고 안내했다.
   부분 환불을 해도 payments.amount 는 줄지 않으므로, 3만원씩 두 번 환불한 뒤에도
   같은 문구가 떴다. 대표는 남은 잔액이 4만원인지 10만원인지 화면만 보고는 알 수 없었고,
   초과 금액을 넣으면 결제사 원문 오류만 떴으며, '전액' 버튼을 누르면 장부는 전액 환불로
   적히고 재고까지 전량 복구돼 실제 환급액과 어긋났다.

   이제 남은 금액은 **서버가 계산해서 내려 준다.** 화면은 그 값을 그대로 보여주고,
   확정할 때 서버가 한 번 더 강제한다(화면만 고쳐서는 돈을 지킬 수 없다).

   왜 '반품 입고 처리' 스위치가 따로 있는가:
   전액 환불은 주문 상태와 무관하게 재고를 **무조건** 전량 되채우고 이력에도 "재고를 다시
   채웠습니다" 를 적었다. 배송이 끝난 주문을 환불하면 물건은 아직 고객에게 있는데 장부만
   늘어난다 — 그 수량은 팔 수 없는 수량이라 그대로 초과판매가 된다.
   그래서 되돌릴지 말지를 사람이 정하게 하고, 기본값만 배송 전 주문에서 켜 둔다.
   ============================================================ */

interface RefundSectionProps {
  orderId: string;
  orderNo: string;
  status: OrderStatus;
  ledger: RefundLedgerView | null;
  onDone: (status: OrderStatus, ledger: RefundLedgerView | null) => void;
}

export default function RefundSection({
  orderId,
  orderNo,
  status,
  ledger,
  onDone,
}: RefundSectionProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<"full" | "partial">("full");
  const [amount, setAmount] = useState("");
  const [restock, setRestock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** 돈은 나갔는데 이력을 저장하지 못한 경우 — 초록 안내와 섞이면 안 되는 경고다 */
  const [warning, setWarning] = useState<string | null>(null);

  const isPending = status === "pending";
  /** 발송 전(결제 완료·상품 준비중)이면 상품이 아직 창고에 있다 — 되돌리는 것이 기본값이 된다 */
  const beforeShipping = status === "paid" || status === "preparing";
  const done = status === "cancelled" || status === "refunded";
  const remaining = ledger?.remaining ?? 0;
  const manual = ledger?.manual ?? false;

  const parsedAmount = Number.parseInt(amount, 10);
  const overflow = mode === "partial" && Number.isInteger(parsedAmount) && parsedAmount > remaining;
  const amountValid =
    mode === "full" || (Number.isInteger(parsedAmount) && parsedAmount > 0 && !overflow);
  const canSubmit = reason.trim().length > 0 && amountValid && !busy;

  function openModal() {
    setReason("");
    setMode("full");
    setAmount("");
    setRestock(beforeShipping);
    setError(null);
    setNotice(null);
    setWarning(null);
    setOpen(true);
  }

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { reason: reason.trim() };
      if (!isPending && mode === "partial") body.amount = parsedAmount;
      // 전액 환불만 재고를 건드린다. 부분 환불은 주문도 재고도 그대로 둔다.
      if (!isPending && mode === "full") body.restock = restock;
      const res = await fetch(`/api/admin/orders/${orderId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "환불 처리에 실패했습니다.");
      onDone(json.status as OrderStatus, (json.refund as RefundLedgerView) ?? null);
      setWarning(typeof json.warning === "string" ? json.warning : null);
      if (json.refunded === "partial") {
        setNotice(
          `${krw(parsedAmount)}원을 환불했습니다. 남은 환불 가능액은 ${krw(
            (json.refund as RefundLedgerView)?.remaining ?? remaining - parsedAmount
          )}원입니다.`
        );
      } else if (json.alreadyProcessed) {
        setNotice(json.message ?? "이미 처리된 주문입니다.");
      } else if (json.refunded === "manual") {
        setNotice("주문을 취소했습니다. 입금액은 고객에게 직접 송금해 주세요.");
      } else if (isPending) {
        setNotice("주문이 취소되었습니다.");
      } else {
        setNotice(
          json.restocked === true
            ? "남은 금액을 모두 환불하고 재고를 다시 채웠습니다."
            : "남은 금액을 모두 환불했습니다. 재고는 그대로 두었습니다."
        );
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
        <h2 className="text-[13px] font-semibold tracking-wide text-ink-500">환불 · 취소</h2>
      </div>
      <div className="p-5">
        {done ? (
          <p className="text-sm text-ink-400">이미 취소·환불 처리된 주문입니다.</p>
        ) : (
          <>
            {!isPending && ledger && <LedgerLines ledger={ledger} />}
            <button
              type="button"
              onClick={openModal}
              disabled={!isPending && remaining <= 0}
              className="mt-4 w-full border border-signal-red px-4 py-2.5 text-sm text-signal-red transition-colors hover:bg-signal-red hover:text-cream-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-signal-red"
            >
              {isPending ? "주문 취소" : "환불 처리"}
            </button>
            <Help>
              {isPending
                ? "입금 전 주문입니다. 결제사 호출 없이 바로 취소됩니다."
                : remaining <= 0
                  ? "더 환불할 금액이 남아 있지 않습니다."
                  : manual
                    ? "계좌이체 등 수기 결제 주문입니다. 카드 취소 없이 주문만 정리되고, 입금액은 직접 송금해야 합니다."
                    : "남은 금액을 모두 환불하면 주문이 마감됩니다. 재고를 되돌릴지는 확정 창에서 고릅니다."}
            </Help>
          </>
        )}
        {notice && <p className="mt-3 text-xs text-forest-700">{notice}</p>}
        {warning && (
          <p className="mt-3 border border-signal-red bg-[#fdf1ee] p-3 text-xs leading-relaxed text-signal-red">
            {warning}
          </p>
        )}
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
              className="border border-ink-200 bg-cream-50 px-4 py-2.5 text-sm text-ink-700 transition-colors hover:bg-cream-100 disabled:opacity-50"
            >
              닫기
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="bg-signal-red px-4 py-2.5 text-sm text-cream-50 transition-colors hover:bg-[#9c3c27] disabled:opacity-50"
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
              ? " 을(를) 취소합니다. 입금 전 주문이라 결제사 호출 없이 바로 취소됩니다."
              : " 의 결제를 취소합니다. 이 작업은 되돌릴 수 없습니다."}
          </p>

          {!isPending && ledger && (
            <div className="border border-ink-200 bg-cream-100 p-4">
              <LedgerLines ledger={ledger} />
              {manual && (
                <p className="mt-3 border-t border-ink-200 pt-3 text-xs leading-relaxed text-brass-700">
                  이 주문은 계좌이체 등 수기 결제라 카드 취소 없이 주문만 정리됩니다. 입금액 환급은
                  직접 송금해 주세요.
                </p>
              )}
            </div>
          )}

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

          {!isPending && remaining > 0 && (
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
                  잔액 전액 ({krw(remaining)}원)
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
                  일부만 환불
                </button>
              </div>
              {mode === "partial" ? (
                <div className="mt-3">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={remaining}
                    value={amount}
                    placeholder={`환불 금액 (최대 ${krw(remaining)}원)`}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  {overflow ? (
                    <Help tone="error">남은 환불 가능액은 {krw(remaining)}원입니다.</Help>
                  ) : (
                    <Help>주문 상태와 재고는 그대로 두고 금액만 돌려줍니다.</Help>
                  )}
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  <Help className="mt-0">
                    남은 {krw(remaining)}원을 모두 환불하고 주문을 마감합니다.
                  </Help>
                  <Toggle
                    checked={restock}
                    onChange={setRestock}
                    label="반품 입고 처리 (재고 되돌리기)"
                  />
                  <Help className="mt-0">
                    {restock
                      ? beforeShipping
                        ? "아직 발송 전이라 상품이 창고에 있습니다. 주문 수량만큼 재고를 다시 채웁니다."
                        : "이미 발송한 주문입니다. 물건이 실제로 돌아왔을 때만 켜 주세요 — 켜면 주문 수량만큼 재고가 늘어납니다."
                      : "재고는 그대로 둡니다. 나중에 반품이 도착하면 재고 관리에서 수량을 직접 더해 주세요."}
                  </Help>
                </div>
              )}
            </div>
          )}

          {error && <Help tone="error">{error}</Help>}
        </div>
      </Modal>
    </section>
  );
}

/** 결제 · 이미 환불 · 남은 금액 3줄 — 이 화면에서 가장 먼저 읽혀야 하는 숫자다 */
function LedgerLines({ ledger }: { ledger: RefundLedgerView }) {
  return (
    <dl className="space-y-1.5 text-sm">
      <div className="flex justify-between text-ink-600">
        <dt>{ledger.manual ? "받은 금액" : "결제 금액"}</dt>
        <dd className="krw">{krw(ledger.paid)}원</dd>
      </div>
      <div className="flex justify-between text-ink-600">
        <dt>이미 환불</dt>
        <dd className="krw">{krw(ledger.refunded)}원</dd>
      </div>
      <div className="flex justify-between border-t border-ink-200 pt-1.5 font-semibold text-ink-900">
        <dt>환불 가능 잔액</dt>
        <dd className="krw">{krw(ledger.remaining)}원</dd>
      </div>
      {/* 결제사 화면에서 부분 취소한 금액은 이 계산에 잡히지 않는다 — 그 사실을 숨기면
          대표가 이 숫자를 믿고 초과 환불을 시도한다(order-refund-ledger.ts 주석 참고) */}
      {ledger.pgCancelUnknown && (
        <div className="pt-1.5 text-xs leading-relaxed text-signal-red">
          결제사에서 취소된 금액이 있어 실제 잔액은 이보다 적을 수 있습니다. 결제사 화면에서 남은
          금액을 대조한 뒤 진행해 주세요.
        </div>
      )}
    </dl>
  );
}
