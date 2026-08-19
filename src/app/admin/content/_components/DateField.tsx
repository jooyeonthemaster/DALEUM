"use client";

/* ============================================================
   한국식 날짜 선택 — 브라우저 기본 <input type="date"> 를 쓰지 않는다.

   왜 갈아엎었나:
   기본 날짜 위젯은 표시 형식이 브라우저 로케일에 종속된다. 실제 스크린샷에서
   쿠폰·캠페인의 날짜 칸이 전부 `mm/dd/yyyy` 로 떴다. 화면 전체가 한국어인데
   이 칸만 미국식이라, "9월 5일" 을 넣으려던 사람이 05/09 를 쳐서 5월 9일로
   저장되는 사고가 난다(쿠폰이 넉 달 더 살아남거나, 캠페인이 만들자마자 만료된다).

   그래서 연/월/일을 각각 고르게 한다. 순서가 화면에 한국어로 박혀 있으니
   뒤집어 넣을 여지가 없고, 고른 결과를 바로 아래에 문장으로 되돌려 보여 준다.
   값의 형식(yyyy-mm-dd)은 그대로라 저장 경로는 손댈 필요가 없다.
   ============================================================ */

import { Select } from "@/components/admin/Field";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 오늘(한국 시간) — yyyy-mm-dd */
export function kstToday(): string {
  return new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** yyyy-mm-dd 를 며칠 뒤로 민 값 */
export function shiftDays(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00Z`).getTime();
  return new Date(base + days * 86400000).toISOString().slice(0, 10);
}

/** 그 달의 마지막 날 */
export function endOfMonth(date: string): string {
  const [y, m] = date.split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-${String(daysInMonth(y, m)).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number): number {
  // 0일 = 이전 달의 마지막 날. UTC 로 계산해야 실행 환경 표준시에 흔들리지 않는다.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** "2026년 9월 5일 (금)" — 고른 날짜를 사람 문장으로 되돌려 준다 */
export function describeKoreanDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const [y, m, d] = value.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(`${value}T00:00:00Z`).getUTCDay()];
  return `${y}년 ${m}월 ${d}일 (${weekday})`;
}

/** 두 날짜(yyyy-mm-dd)의 대소 비교 — 문자열 비교로 충분한 형식이다 */
export function isBefore(a: string, b: string): boolean {
  return Boolean(a) && Boolean(b) && a < b;
}

export interface DateFieldProps {
  /** yyyy-mm-dd, 비어 있으면 "정하지 않음" */
  value: string;
  onChange: (next: string) => void;
  /** 각 select 에 붙일 접근성 이름 — 예: "노출 시작일" */
  ariaLabel: string;
  /** 오늘 기준 빠른 선택 버튼을 붙일지 */
  quick?: boolean;
  className?: string;
}

/** 고를 수 있는 연도 — 작년부터 3년 뒤까지. 저장된 값이 밖에 있으면 그 해도 끼워 넣는다. */
function yearOptions(current: number | null): number[] {
  const thisYear = Number(kstToday().slice(0, 4));
  const years: number[] = [];
  for (let y = thisYear - 1; y <= thisYear + 3; y += 1) years.push(y);
  if (current && !years.includes(current)) years.push(current);
  return years.sort((a, b) => a - b);
}

export default function DateField({
  value,
  onChange,
  ariaLabel,
  quick = false,
  className = "",
}: DateFieldProps) {
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const [y, m, d] = valid ? value.split("-").map(Number) : [null, null, null];

  /** 연·월·일 중 하나가 바뀔 때 — 아직 다 안 고른 상태도 자연스럽게 넘어가야 한다 */
  function patch(part: "y" | "m" | "d", raw: string) {
    if (raw === "") {
      onChange("");
      return;
    }
    const n = Number(raw);
    const today = kstToday();
    const nextY = part === "y" ? n : (y ?? Number(today.slice(0, 4)));
    const nextM = part === "m" ? n : (m ?? Number(today.slice(5, 7)));
    // 1월 31일에서 2월로 옮기면 31일이 없다 — 말없이 다음 달로 넘기지 말고 그 달 마지막 날로 당긴다
    const maxDay = daysInMonth(nextY, nextM);
    const nextD = Math.min(part === "d" ? n : (d ?? 1), maxDay);
    onChange(
      `${nextY}-${String(nextM).padStart(2, "0")}-${String(nextD).padStart(2, "0")}`
    );
  }

  const dayMax = y && m ? daysInMonth(y, m) : 31;
  const past = valid && value < kstToday();

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Select
          className="w-28"
          aria-label={`${ariaLabel} 연도`}
          value={y ?? ""}
          onChange={(e) => patch("y", e.target.value)}
        >
          <option value="">연도</option>
          {yearOptions(y).map((year) => (
            <option key={year} value={year}>
              {year}년
            </option>
          ))}
        </Select>
        <Select
          className="w-24"
          aria-label={`${ariaLabel} 월`}
          value={m ?? ""}
          onChange={(e) => patch("m", e.target.value)}
        >
          <option value="">월</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
            <option key={month} value={month}>
              {month}월
            </option>
          ))}
        </Select>
        <Select
          className="w-24"
          aria-label={`${ariaLabel} 일`}
          value={d ?? ""}
          onChange={(e) => patch("d", e.target.value)}
        >
          <option value="">일</option>
          {Array.from({ length: dayMax }, (_, i) => i + 1).map((day) => (
            <option key={day} value={day}>
              {day}일
            </option>
          ))}
        </Select>
        {valid && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="px-2 py-1 text-xs text-ink-500 underline-offset-2 hover:text-ink-900 hover:underline"
          >
            지우기
          </button>
        )}
      </div>

      {quick && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {[
            { label: "오늘", get: () => kstToday() },
            { label: "7일 뒤", get: () => shiftDays(kstToday(), 7) },
            { label: "30일 뒤", get: () => shiftDays(kstToday(), 30) },
            { label: "이번 달 말", get: () => endOfMonth(kstToday()) },
          ].map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => onChange(preset.get())}
              className="border border-ink-200 bg-cream-50 px-2.5 py-1 text-xs text-ink-600 transition-colors hover:border-forest-600 hover:text-forest-700"
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}

      {valid && (
        <p className={`mt-1.5 text-xs ${past ? "text-signal-red" : "text-ink-500"}`}>
          {describeKoreanDate(value)}
          {past && " · 이미 지난 날짜입니다"}
        </p>
      )}
    </div>
  );
}
