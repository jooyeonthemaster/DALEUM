"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

export interface CheckoutModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * 체크아웃 공용 모달 셸 — 헤어라인, cream 배경, 모바일에서는 하단 시트처럼.
 * 내부 스크롤 영역에 data-lenis-prevent 적용.
 */
export default function CheckoutModal({ open, title, onClose, children }: CheckoutModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink-900/40"
      />
      <div
        data-lenis-prevent
        className="relative max-h-[85vh] w-full overflow-y-auto border border-ink-200 bg-cream-50 sm:max-w-lg"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink-200 bg-cream-50 px-5 py-4">
          <h3 className="headline-serif text-base text-ink-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="-mr-1 p-1 text-ink-500 transition-colors hover:text-ink-900"
          >
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
