"use client";

export interface DateRangeProps {
  /** yyyy-mm-dd (빈 문자열 허용) */
  from: string;
  to: string;
  onChange: (next: { from: string; to: string }) => void;
  className?: string;
}

const inputClass =
  "rounded-none border border-ink-200 bg-cream-50 px-3 py-2.5 text-sm text-ink-900 krw transition-colors focus:border-forest-600 focus:outline-none";

/** 기간 필터용 from/to 날짜 입력 쌍 */
export default function DateRange({ from, to, onChange, className = "" }: DateRangeProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <input
        type="date"
        aria-label="시작일"
        value={from}
        max={to || undefined}
        onChange={(e) => onChange({ from: e.target.value, to })}
        className={inputClass}
      />
      <span aria-hidden className="text-ink-300">
        –
      </span>
      <input
        type="date"
        aria-label="종료일"
        value={to}
        min={from || undefined}
        onChange={(e) => onChange({ from, to: e.target.value })}
        className={inputClass}
      />
    </div>
  );
}
