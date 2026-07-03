"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export interface ShopModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** 기본 max-w-md, wide면 max-w-xl */
  wide?: boolean;
}

/**
 * 스토어 톤 모달 — 모바일은 하단 시트, sm 이상은 중앙 정렬.
 * ESC/백드롭 닫기, 배경 스크롤 잠금, 열릴 때 패널 포커스.
 */
export default function ShopModal({
  open,
  onClose,
  title,
  children,
  footer,
  wide = false,
}: ShopModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const html = document.documentElement;
    const prevOverflow = html.style.overflow;
    html.style.overflow = "hidden";
    const raf = requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      window.removeEventListener("keydown", onKey);
      html.style.overflow = prevOverflow;
      cancelAnimationFrame(raf);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:px-5">
      <div className="absolute inset-0 bg-ink-900/40" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-lenis-prevent
        className={`relative max-h-[88vh] w-full overflow-y-auto border border-ink-200 bg-cream-50 focus-visible:outline-none ${
          wide ? "sm:max-w-xl" : "sm:max-w-md"
        }`}
      >
        <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4">
          <h2 className="headline-serif text-lg text-ink-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="-mr-1.5 p-1.5 text-ink-500 transition-colors hover:text-ink-900"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-ink-100 px-6 py-4">{footer}</div>
        )}
      </div>
    </div>
  );
}
