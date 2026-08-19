"use client";

/* ============================================================
   빈 상태 — "없습니다" 로 끝내지 않고 다음에 할 일을 준다.

   기존 빈 화면은 '등록된 배너가 없습니다.' 한 줄이었다. 처음 들어온 사람은
   그 배너가 고객 화면 어디에 나오는 물건인지도, 무엇부터 눌러야 하는지도
   알 수 없어 그대로 멈춘다.
   ============================================================ */

import type { ReactNode } from "react";

export interface EmptyHintProps {
  title: string;
  /** 이게 고객 화면 어디에 나오는 물건인지 */
  description: string;
  actionLabel: string;
  onAction: () => void;
  /** 고객 화면을 직접 확인할 수 있는 링크 등 */
  extra?: ReactNode;
}

export default function EmptyHint({
  title,
  description,
  actionLabel,
  onAction,
  extra,
}: EmptyHintProps) {
  return (
    <div className="border border-dashed border-ink-200 px-6 py-14 text-center">
      <p className="text-sm text-ink-900">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-ink-500">{description}</p>
      <button
        type="button"
        onClick={onAction}
        className="mt-5 bg-forest-700 px-4 py-2.5 text-sm text-cream-50 transition-colors hover:bg-forest-800"
      >
        {actionLabel}
      </button>
      {extra && <div className="mt-3 text-xs text-ink-400">{extra}</div>}
    </div>
  );
}
