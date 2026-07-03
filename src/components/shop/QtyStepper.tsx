"use client";

import { Minus, Plus } from "lucide-react";

export interface QtyStepperProps {
  value: number;
  onChange: (value: number) => void;
  /** 기본 1 */
  min?: number;
  /** 기본 99 (재고 상한을 넘기면 안 될 때 지정) */
  max?: number;
  className?: string;
}

/** 수량 조절 스테퍼 — 헤어라인 보더, − / 숫자 / + */
export default function QtyStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  className = "",
}: QtyStepperProps) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));

  return (
    <div
      className={`inline-flex items-stretch border border-ink-200 bg-cream-50 ${className}`}
    >
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        disabled={value <= min}
        aria-label="수량 줄이기"
        className="flex h-10 w-10 items-center justify-center text-ink-600 transition-colors hover:text-ink-900 disabled:opacity-30 disabled:hover:text-ink-600"
      >
        <Minus size={15} strokeWidth={1.5} />
      </button>
      <span
        aria-live="polite"
        className="krw flex w-11 select-none items-center justify-center border-x border-ink-200 text-sm font-medium text-ink-900"
      >
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        disabled={value >= max}
        aria-label="수량 늘리기"
        className="flex h-10 w-10 items-center justify-center text-ink-600 transition-colors hover:text-ink-900 disabled:opacity-30 disabled:hover:text-ink-600"
      >
        <Plus size={15} strokeWidth={1.5} />
      </button>
    </div>
  );
}
