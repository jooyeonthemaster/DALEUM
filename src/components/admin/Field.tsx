"use client";

/* ============================================================
   관리자 폼 프리미티브 — Label / Input / Textarea / Select /
   Toggle / FieldRow / Help
   헤어라인 보더, 포커스 시 forest-600, rounded-none.
   ============================================================ */

import type { ComponentProps, ReactNode } from "react";
import { ChevronDown } from "lucide-react";

const fieldBase =
  "w-full rounded-none border border-ink-200 bg-cream-50 px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-300 transition-colors focus:border-forest-600 focus:outline-none disabled:cursor-not-allowed disabled:bg-cream-100 disabled:text-ink-400";

export interface LabelProps extends ComponentProps<"label"> {
  /** 필수 표시 (*) */
  requiredMark?: boolean;
}

export function Label({ className = "", requiredMark, children, ...props }: LabelProps) {
  return (
    <label className={`mb-1.5 block text-[13px] font-medium text-ink-700 ${className}`} {...props}>
      {children}
      {requiredMark && (
        <span aria-hidden className="ml-0.5 text-signal-red">
          *
        </span>
      )}
    </label>
  );
}

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return <input className={`${fieldBase} ${className}`} {...props} />;
}

export function Textarea({ className = "", rows = 4, ...props }: ComponentProps<"textarea">) {
  return <textarea rows={rows} className={`${fieldBase} resize-y leading-relaxed ${className}`} {...props} />;
}

/** className은 래퍼 div에 적용된다 (폭 조절용) */
export function Select({ className = "", children, ...props }: ComponentProps<"select">) {
  return (
    <div className={`relative ${className}`}>
      <select className={`${fieldBase} appearance-none pr-9`} {...props}>
        {children}
      </select>
      <ChevronDown
        size={16}
        strokeWidth={1.5}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400"
      />
    </div>
  );
}

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** 스위치 우측 라벨 (aria-label로도 사용) */
  label?: string;
  className?: string;
}

export function Toggle({ checked, onChange, disabled, label, className = "" }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`inline-flex items-center gap-2.5 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      <span
        className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors duration-300 ${
          checked ? "bg-forest-600" : "bg-ink-200"
        }`}
      >
        <span
          className={`absolute left-0.5 h-5 w-5 rounded-full bg-cream-50 transition-transform duration-300 ease-hall ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </span>
      {label && <span className="text-sm text-ink-700">{label}</span>}
    </button>
  );
}

export interface FieldRowProps {
  label: string;
  required?: boolean;
  /** 입력 아래 도움말 */
  help?: string;
  /** Label의 htmlFor */
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}

/**
 * 라벨 + 입력 수평 배치 행 (md 미만에서는 세로 스택).
 * 여러 행을 쌓을 땐 부모에 divide-y divide-ink-100 권장.
 */
export function FieldRow({
  label,
  required,
  help,
  htmlFor,
  children,
  className = "",
}: FieldRowProps) {
  return (
    <div className={`py-4 md:grid md:grid-cols-[11rem_1fr] md:items-start md:gap-6 ${className}`}>
      <Label htmlFor={htmlFor} requiredMark={required} className="md:mb-0 md:pt-2.5">
        {label}
      </Label>
      <div>
        {children}
        {help && <Help>{help}</Help>}
      </div>
    </div>
  );
}

export interface HelpProps {
  children: ReactNode;
  tone?: "default" | "error";
  className?: string;
}

export function Help({ children, tone = "default", className = "" }: HelpProps) {
  return (
    <p
      className={`mt-1.5 text-xs leading-relaxed ${
        tone === "error" ? "text-signal-red" : "text-ink-400"
      } ${className}`}
    >
      {children}
    </p>
  );
}
