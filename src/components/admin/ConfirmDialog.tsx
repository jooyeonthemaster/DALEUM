"use client";

import { useState } from "react";
import Modal from "./Modal";

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  /** Promise 반환 시 완료까지 버튼이 잠기고, 성공하면 자동으로 닫힌다 */
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  confirmLabel?: string;
  /** 파괴적 액션이면 true — 확인 버튼이 signal-red */
  danger?: boolean;
}

/** 파괴적/중요 액션 확인 다이얼로그 */
export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "확인",
  danger = false,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="border border-ink-200 bg-cream-50 px-4 py-2.5 text-sm text-ink-700 transition-colors hover:bg-cream-100 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            className={`px-4 py-2.5 text-sm text-cream-50 transition-colors disabled:opacity-50 ${
              danger
                ? "bg-signal-red hover:bg-[#9c3c27]"
                : "bg-forest-700 hover:bg-forest-800"
            }`}
          >
            {busy ? "처리 중…" : confirmLabel}
          </button>
        </>
      }
    >
      <p className="whitespace-pre-line text-sm leading-relaxed text-ink-600">{description}</p>
    </Modal>
  );
}
