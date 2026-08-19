"use client";

import { useState } from "react";
import Modal from "./Modal";

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  /** Promise 반환 시 완료까지 버튼이 잠기고, 성공하면 자동으로 닫힌다 */
  onConfirm: () => void | Promise<void>;
  /**
   * 확인 뒤 스스로 닫을지 (기본 true).
   *
   * false 로 두어야 하는 자리가 있다 — **확인이 다음 단계를 여는** 경우다.
   * 상품 삭제 1단계가 그랬다: onConfirm 이 단계를 2로 올리면 곧바로 onClose 가 0으로
   * 되돌려, 2단계 확인창이 뜨자마자 사라지고 삭제 요청은 영영 나가지 않았다
   * (관리자 화면에서 상품이 삭제되지 않던 원인). 대화상자의 열림을 호출부가
   * 직접 쥐고 있는 자리에서는 여기서 닫지 않는다.
   */
  closeOnConfirm?: boolean;
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
  closeOnConfirm = true,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
      if (closeOnConfirm) onClose();
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
