"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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
 * 등장 모션: 백드롭 페이드 + 패널이 아래에서 조용히 떠오른다.
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
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!open) {
      setShown(false);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const html = document.documentElement;
    const prevOverflow = html.style.overflow;
    html.style.overflow = "hidden";
    const raf = requestAnimationFrame(() => {
      panelRef.current?.focus();
      setShown(true);
    });
    return () => {
      window.removeEventListener("keydown", onKey);
      html.style.overflow = prevOverflow;
      cancelAnimationFrame(raf);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:px-5">
      <div
        className={`absolute inset-0 bg-ink-900/40 transition-opacity duration-500 ease-silk ${
          shown ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-lenis-prevent
        className={`relative max-h-[88vh] w-full overflow-y-auto border border-ink-200 bg-cream-50 pb-[env(safe-area-inset-bottom)] transition-[opacity,transform] duration-500 ease-silk focus-visible:outline-none sm:pb-0 ${
          shown ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0 sm:translate-y-3"
        } ${wide ? "sm:max-w-xl" : "sm:max-w-md"}`}
      >
        <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4">
          <h2 className="headline-serif text-lg text-ink-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="-mr-2.5 p-2.5 text-ink-500 transition-colors hover:text-ink-900"
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
