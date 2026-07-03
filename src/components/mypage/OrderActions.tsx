"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { OrderStatus } from "@/lib/types";
import ShopModal from "./ShopModal";

export interface OrderActionsProps {
  orderId: string;
  status: OrderStatus;
}

const CANCELLABLE: OrderStatus[] = ["pending", "paid", "preparing"];

/**
 * 주문 상세 액션 — 주문 취소(사유 입력 모달) / 구매 확정.
 * 취소: POST /api/orders/[id]/cancel · 확정: POST /api/mypage/orders/[id]/confirm
 */
export default function OrderActions({ orderId, status }: OrderActionsProps) {
  const router = useRouter();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancellable = CANCELLABLE.includes(status);
  const confirmable = status === "delivered";
  if (!cancellable && !confirmable) return null;

  const closeCancel = () => {
    if (busy) return;
    setCancelOpen(false);
    setError(null);
  };
  const closeConfirm = () => {
    if (busy) return;
    setConfirmOpen(false);
    setError(null);
  };

  const submitCancel = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(json?.error ?? "주문 취소에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      setCancelOpen(false);
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const submitConfirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/mypage/orders/${orderId}/confirm`, { method: "POST" });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(json?.error ?? "구매 확정에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      setConfirmOpen(false);
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
      {cancellable && (
        <button
          type="button"
          onClick={() => setCancelOpen(true)}
          className="border border-ink-200 px-6 py-3 text-sm text-ink-700 transition-colors hover:border-ink-400 hover:text-ink-900"
        >
          주문 취소
        </button>
      )}
      {confirmable && (
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="bg-forest-700 px-6 py-3 text-sm font-medium text-cream-50 transition-colors hover:bg-forest-800"
        >
          구매 확정
        </button>
      )}

      {/* 취소 사유 입력 모달 */}
      <ShopModal
        open={cancelOpen}
        onClose={closeCancel}
        title="주문 취소"
        footer={
          <>
            <button
              type="button"
              onClick={closeCancel}
              disabled={busy}
              className="h-11 border border-ink-200 px-5 text-sm text-ink-700 transition-colors hover:bg-cream-100 disabled:opacity-50"
            >
              돌아가기
            </button>
            <button
              type="button"
              onClick={submitCancel}
              disabled={busy}
              className="h-11 bg-signal-red px-5 text-sm text-cream-50 transition-colors hover:bg-[#9c3c27] disabled:opacity-50"
            >
              {busy ? "처리 중…" : "취소하기"}
            </button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-ink-600">
          {status === "pending"
            ? "결제 전 주문을 취소합니다."
            : "결제하신 금액은 결제 수단으로 전액 환불됩니다."}{" "}
          취소 후에는 되돌릴 수 없습니다.
        </p>
        <label htmlFor="cancel-reason" className="mt-5 mb-1.5 block text-[13px] text-ink-600">
          취소 사유 <span className="text-ink-400">(선택)</span>
        </label>
        <textarea
          id="cancel-reason"
          rows={3}
          maxLength={200}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="예: 단순 변심, 주문 정보 수정"
          className="w-full border border-ink-200 bg-transparent px-3.5 py-3 text-sm text-ink-900 transition-colors placeholder:text-ink-300 focus:border-forest-600 focus-visible:outline-none"
        />
        {error && (
          <p role="alert" className="mt-3 text-[13px] text-signal-red">
            {error}
          </p>
        )}
      </ShopModal>

      {/* 구매 확정 모달 */}
      <ShopModal
        open={confirmOpen}
        onClose={closeConfirm}
        title="구매 확정"
        footer={
          <>
            <button
              type="button"
              onClick={closeConfirm}
              disabled={busy}
              className="h-11 border border-ink-200 px-5 text-sm text-ink-700 transition-colors hover:bg-cream-100 disabled:opacity-50"
            >
              돌아가기
            </button>
            <button
              type="button"
              onClick={submitConfirm}
              disabled={busy}
              className="h-11 bg-forest-700 px-5 text-sm text-cream-50 transition-colors hover:bg-forest-800 disabled:opacity-50"
            >
              {busy ? "처리 중…" : "확정하기"}
            </button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-ink-600">
          상품을 잘 받으셨나요? 구매를 확정하면 취소와 환불 신청이 불가능해집니다.
          확정 후에는 상품별로 리뷰를 남길 수 있습니다.
        </p>
        {error && (
          <p role="alert" className="mt-3 text-[13px] text-signal-red">
            {error}
          </p>
        )}
      </ShopModal>
    </div>
  );
}
