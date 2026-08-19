"use client";

/* ============================================================
   한국식 날짜 고르기 — 브라우저 기본 <input type="date"> 를 대신한다.

   왜 만들었나:
   기존 만료일·적용기간 칸은 <input type="date"> 였고, 이 위젯의 표시 형식은
   브라우저 로케일이 정한다. 실제 화면에는 'mm/dd/yyyy' 로 떠 있었다.
   한국 사용자가 '9월 5일 종료'를 05/09 로 넣으면 5월 9일이 되어 캠페인이
   만들자마자 만료되거나, 반대로 코드가 넉 달을 더 살아남는다.
   저장 시점에 경고도 없고, 목록은 다시 2026.05.09 처럼 한국식으로 보여 주기 때문에
   본인이 무엇을 잘못 넣었는지 대조하기조차 어려웠다.

   그래서 표시 형식을 우리가 쥔다 — 언제나 '2026년 9월 5일 (금)' 로 보이고,
   고르는 방식도 달력 격자다. 값은 예전과 같은 'yyyy-mm-dd' 문자열로 주고받으므로
   kstDayStart/kstDayEnd 같은 기존 변환은 그대로 쓴다.
   ============================================================ */

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Date → 'yyyy-mm-dd' (그 지역 달력 기준. UTC 로 바꾸면 하루가 밀린다) */
export function toDateValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 'yyyy-mm-dd' → Date. 형식이 아니면 null */
export function parseDateValue(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** '2026년 9월 5일 (금)' — 화면에 날짜를 글자로 적을 때는 항상 이 모양 */
export function formatKoreanDate(value: string): string {
  const d = parseDateValue(value);
  if (!d) return "";
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
}

/** 오늘(그 지역 달력) */
export function todayValue(): string {
  return toDateValue(new Date());
}

/** 오늘부터 n일 뒤 */
export function daysFromToday(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return toDateValue(d);
}

/** 이번 달 마지막 날 */
export function endOfThisMonth(): string {
  const now = new Date();
  return toDateValue(new Date(now.getFullYear(), now.getMonth() + 1, 0));
}

/** 값이 오늘보다 이전인가 (yyyy-mm-dd 는 사전순 비교가 곧 날짜순 비교다) */
export function isPastDate(value: string): boolean {
  return Boolean(value) && value < todayValue();
}

export interface QuickPick {
  label: string;
  value: string;
}

/** 만료일 칸에 흔히 붙이는 빠른 선택 — 누를 때 계산해야 자정을 넘겨도 어긋나지 않는다 */
export function expiryQuickPicks(): QuickPick[] {
  return [
    { label: "1주일 뒤", value: daysFromToday(7) },
    { label: "1개월 뒤", value: daysFromToday(30) },
    { label: "이번 달 말", value: endOfThisMonth() },
  ];
}

export interface KoreanDateFieldProps {
  /** 'yyyy-mm-dd' — 빈 문자열은 '고르지 않음' */
  value: string;
  onChange: (next: string) => void;
  /** 값이 없을 때 칸에 보이는 말 (예: '만료 없음') */
  emptyLabel?: string;
  /** 빠른 선택 버튼 목록 */
  quickPicks?: QuickPick[];
  /** 이 날짜보다 앞은 고를 수 없다 ('yyyy-mm-dd') */
  min?: string;
  /** 이 날짜보다 뒤는 고를 수 없다 */
  max?: string;
  ariaLabel: string;
  className?: string;
}

export default function KoreanDateField({
  value,
  onChange,
  emptyLabel = "날짜 고르기",
  quickPicks,
  min,
  max,
  ariaLabel,
  className = "",
}: KoreanDateFieldProps) {
  const [open, setOpen] = useState(false);
  // 달력이 펼쳐 보여 줄 달. 값이 있으면 그 달, 없으면 이번 달에서 시작한다.
  const [cursor, setCursor] = useState(() => parseDateValue(value) ?? new Date());
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const start = new Date(year, month, 1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      return { value: toDateValue(d), day: d.getDate(), inMonth: d.getMonth() === month };
    });
  }, [cursor]);

  const today = todayValue();

  function togglePicker() {
    setCursor(parseDateValue(value) ?? new Date());
    setOpen((prev) => !prev);
  }

  function pick(next: string) {
    onChange(next);
    setOpen(false);
  }

  function shiftMonth(delta: number) {
    setCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  function blocked(target: string): boolean {
    if (min && target < min) return true;
    if (max && target > max) return true;
    return false;
  }

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={togglePicker}
          aria-label={ariaLabel}
          aria-expanded={open}
          className="inline-flex min-w-56 items-center gap-2 border border-ink-200 bg-cream-50 px-3.5 py-2.5 text-left text-sm transition-colors hover:border-forest-600"
        >
          <CalendarDays size={15} strokeWidth={1.5} className="shrink-0 text-ink-400" />
          <span className={value ? "text-ink-900" : "text-ink-300"}>
            {value ? formatKoreanDate(value) : emptyLabel}
          </span>
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-xs text-ink-400 underline-offset-2 transition-colors hover:text-signal-red hover:underline"
          >
            지우기
          </button>
        )}
      </div>

      {quickPicks && quickPicks.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {quickPicks.map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => onChange(option.value)}
              className="border border-ink-200 px-2.5 py-1 text-xs text-ink-600 transition-colors hover:border-forest-600 hover:text-forest-700"
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-72 border border-ink-200 bg-cream-50 p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="이전 달"
              className="p-1 text-ink-400 transition-colors hover:text-forest-700"
            >
              <ChevronLeft size={16} strokeWidth={1.5} />
            </button>
            <p className="text-sm font-medium text-ink-900">
              {cursor.getFullYear()}년 {cursor.getMonth() + 1}월
            </p>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="다음 달"
              className="p-1 text-ink-400 transition-colors hover:text-forest-700"
            >
              <ChevronRight size={16} strokeWidth={1.5} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 text-center">
            {WEEKDAYS.map((w) => (
              <span key={w} className="py-1 text-[11px] text-ink-400">
                {w}
              </span>
            ))}
            {cells.map((cell) => {
              const selected = cell.value === value;
              const disabled = blocked(cell.value);
              return (
                <button
                  key={cell.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => pick(cell.value)}
                  className={`krw py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:text-ink-200 ${
                    selected
                      ? "bg-forest-700 text-cream-50"
                      : cell.inMonth
                        ? "text-ink-700 hover:bg-cream-100"
                        : "text-ink-300 hover:bg-cream-100"
                  } ${!selected && cell.value === today ? "border border-forest-600" : ""}`}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-ink-100 pt-2">
            <button
              type="button"
              onClick={() => pick(today)}
              className="text-xs text-forest-700 underline-offset-2 hover:underline"
            >
              오늘
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-ink-500 underline-offset-2 hover:underline"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
