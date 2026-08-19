"use client";

/* ============================================================
   노출 기간 한 쌍 — 언제부터 언제까지 보이는지를 문장으로 되돌려 준다.

   기존 입력은 브라우저 기본 날짜칸 두 개였다(미국식 mm/dd/yyyy 로 떴다).
   게다가 "비워 두면 상시 노출됩니다" 한 줄만 있어서, 고른 결과가 실제로
   무엇을 뜻하는지 — 오늘 보이는지, 이미 끝났는지 — 화면이 말해 주지 않았다.
   ============================================================ */

import { Help } from "@/components/admin/Field";
import DateField, { describeKoreanDate, kstToday } from "./DateField";

export interface PeriodFieldProps {
  /** yyyy-mm-dd, 빈 값이면 제한 없음 */
  from: string;
  to: string;
  onChange: (next: { from: string; to: string }) => void;
  /** "배너" / "팝업" — 안내 문장에 넣는다 */
  kind: string;
}

/** 고른 기간을 사람 문장으로 */
export function describePeriod(from: string, to: string, kind: string): string {
  if (!from && !to) return `기간 제한 없이 계속 노출됩니다.`;
  if (from && !to) return `${describeKoreanDate(from)}부터 내릴 때까지 노출됩니다.`;
  if (!from && to) return `지금부터 ${describeKoreanDate(to)}까지 노출됩니다.`;
  return `${describeKoreanDate(from)}부터 ${describeKoreanDate(to)}까지 이 ${kind}가 노출됩니다.`;
}

export default function PeriodField({ from, to, onChange, kind }: PeriodFieldProps) {
  const today = kstToday();
  const reversed = Boolean(from && to && to < from);
  const alreadyOver = Boolean(to && to < today);

  return (
    <div>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div>
          <p className="mb-1 text-xs text-ink-500">시작</p>
          <DateField
            ariaLabel="노출 시작일"
            value={from}
            onChange={(next) => onChange({ from: next, to })}
            quick
          />
        </div>
        <div>
          <p className="mb-1 text-xs text-ink-500">종료</p>
          <DateField
            ariaLabel="노출 종료일"
            value={to}
            onChange={(next) => onChange({ from, to: next })}
            quick
          />
        </div>
      </div>

      {reversed ? (
        <Help tone="error">종료일이 시작일보다 빠릅니다. 두 날짜를 다시 확인해 주세요.</Help>
      ) : alreadyOver ? (
        <Help tone="error">
          종료일이 이미 지났습니다. 이대로 저장하면 고객 화면에 나오지 않습니다.
        </Help>
      ) : (
        <Help>{describePeriod(from, to, kind)} 두 칸 다 비워 두면 계속 노출됩니다.</Help>
      )}
    </div>
  );
}

/** 저장을 막아야 하는 상태인지 — 폼이 물어본다 */
export function periodBlockingError(from: string, to: string): string | null {
  if (from && to && to < from) return "종료일이 시작일보다 빠릅니다. 두 날짜를 다시 확인해 주세요.";
  return null;
}
