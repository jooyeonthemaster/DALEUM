"use client";

/* ============================================================
   빈 화면에서 '다음에 뭘 해야 하는지'를 알려 주는 카드.

   왜 만들었나:
   멤버·입장코드·상품별 가격 탭의 빈 상태는 '아직 배정된 VIP 멤버가 없습니다.'
   한 줄이 전부였다. 다음 행동 버튼이 없어서, 특히 그룹이 하나도 없을 때는
   무엇을 눌러도 저장이 거부되는 막다른 길이 됐다.
   ============================================================ */

import type { ReactNode } from "react";
import { BTN_GHOST, BTN_PRIMARY } from "./vipApi";

export interface NextStepCardProps {
  title: string;
  description: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  /** 보조 행동 (예: '그룹 탭으로 가기') */
  secondaryLabel?: string;
  onSecondary?: () => void;
}

export default function NextStepCard({
  title,
  description,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}: NextStepCardProps) {
  return (
    <div className="border border-ink-200 bg-cream-50 px-6 py-14 text-center">
      <p className="headline-serif text-lg text-ink-900">{title}</p>
      <div className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-500">
        {description}
      </div>
      {(actionLabel || secondaryLabel) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {actionLabel && onAction && (
            <button type="button" onClick={onAction} className={BTN_PRIMARY}>
              {actionLabel}
            </button>
          )}
          {secondaryLabel && onSecondary && (
            <button type="button" onClick={onSecondary} className={BTN_GHOST}>
              {secondaryLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
