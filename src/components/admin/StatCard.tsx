import type { ReactNode } from "react";

export interface StatCardProps {
  label: string;
  value: ReactNode;
  /** 보조 문구 — 예: "어제보다 +12%" */
  sub?: ReactNode;
  /** sub 문구 색: up=forest, down=signal-red */
  tone?: "default" | "up" | "down";
  className?: string;
}

const SUB_TONE = {
  default: "text-ink-400",
  up: "text-forest-600",
  down: "text-signal-red",
} as const;

/** 대시보드 KPI 카드 — 절제된 헤어라인 박스 */
export default function StatCard({
  label,
  value,
  sub,
  tone = "default",
  className = "",
}: StatCardProps) {
  return (
    <div className={`border border-ink-200 bg-cream-50 p-5 ${className}`}>
      <p className="label-caps text-ink-400">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-ink-900 krw">{value}</p>
      {sub !== undefined && sub !== null && (
        <p className={`mt-1.5 text-xs ${SUB_TONE[tone]}`}>{sub}</p>
      )}
    </div>
  );
}
