"use client";

import { useEffect } from "react";
import { CheckCircle2, X, XCircle } from "lucide-react";

export interface ToastMessage {
  /** 같은 문구를 다시 띄워도 타이머가 새로 돌게 하는 일련번호 */
  id: number;
  text: string;
  tone: "ok" | "error";
}

export interface InventoryToastProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

/**
 * 저장 결과 알림.
 * 전에는 입고를 저장해도 창만 조용히 닫혀서 "된 건가?" 싶어 같은 입고를 두 번 넣는 일이 있었다.
 * 그래서 무엇이 몇 개에서 몇 개가 됐는지를 문장으로 남긴다.
 */
export default function InventoryToast({ toast, onDismiss }: InventoryToastProps) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDismiss, 6000);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  if (!toast) return null;
  const ok = toast.tone === "ok";

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-[120] w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 sm:left-auto sm:right-6 sm:translate-x-0"
    >
      <div
        className={`flex items-start gap-3 border px-4 py-3 shadow-sm ${
          ok ? "border-forest-600 bg-forest-50" : "border-signal-red bg-[#fbf1ee]"
        }`}
      >
        {ok ? (
          <CheckCircle2 size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-forest-700" />
        ) : (
          <XCircle size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-signal-red" />
        )}
        <p className="flex-1 text-sm leading-relaxed text-ink-700">{toast.text}</p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="알림 닫기"
          className="-my-1 -mr-1 shrink-0 p-1 text-ink-400 transition-colors hover:text-ink-900"
        >
          <X size={15} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
