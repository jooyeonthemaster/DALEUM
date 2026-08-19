"use client";

/* ============================================================
   숫자 입력칸 — 천단위 쉼표를 보여주면서 값은 숫자로 지킨다.

   왜 만들었나:
   대표는 공급사 엑셀에서 `14,300` 을 그대로 복사해 붙여넣는다. 옛 입력칸은 그 문자열을
   그대로 담고 있다가 저장 직전에 숫자로 못 읽어 **아무 말 없이 버렸다**. 화면은
   "저장되었습니다" 라고 말하고, 다시 열면 그 칸만 비어 있다. 원인을 알 방법이 없다.
   또 '198000' 처럼 0 을 하나 더 친 오타는 쉼표가 없으면 눈으로 잡히지 않는다.

   그래서 이 칸은
   (1) 쉼표·공백·'원'·₩·전각숫자를 정상 입력으로 흡수하고,
   (2) 화면에는 항상 천단위 쉼표를 찍어 자릿수를 눈으로 세게 하고,
   (3) 숫자로 못 읽는 글자는 지우지 않고 남겨 둔 채 부모가 빨간 안내를 띄우게 한다.
       (몰래 고치면 관리자가 자기 오타를 영영 못 본다)
   ============================================================ */

import { useEffect, useRef } from "react";
import { Input } from "@/components/admin/Field";
import { formatNumberForInput } from "../form-types";

export interface NumberFieldProps {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** 라벨이 따로 없을 때 화면 낭독기용 이름 */
  ariaLabel?: string;
  /** 입력칸 오른쪽에 고정 표시할 단위 (원 / 개 …) */
  suffix?: string;
  /** 래퍼 폭 조절용 */
  className?: string;
  invalid?: boolean;
  disabled?: boolean;
}

/** 문자열 안의 숫자 글자 수 */
function countDigits(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code >= 48 && code <= 57) n += 1;
  }
  return n;
}

/** 앞에서부터 숫자 count 개를 지난 직후 위치 (쉼표가 끼어들어도 캐럿이 밀리지 않게) */
function caretAfterDigits(text: string, count: number): number {
  if (count <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code >= 48 && code <= 57) {
      seen += 1;
      if (seen === count) return i + 1;
    }
  }
  return text.length;
}

export default function NumberField({
  id,
  value,
  onChange,
  placeholder,
  ariaLabel,
  suffix,
  className = "",
  invalid,
  disabled,
}: NumberFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // 쉼표를 다시 찍으면 브라우저가 커서를 맨 뒤로 보낸다 — 가운데 숫자를 고치던 사람이
  // 매 글자마다 끝으로 튕겨 나가므로, 입력 직후 커서를 원래 자리로 되돌려 놓는다.
  const caretRef = useRef<number | null>(null);

  useEffect(() => {
    const el = inputRef.current;
    const pos = caretRef.current;
    caretRef.current = null;
    if (!el || pos == null || document.activeElement !== el) return;
    el.setSelectionRange(pos, pos);
  });

  const display = formatNumberForInput(value);

  return (
    <div className={`relative ${className}`}>
      <Input
        ref={inputRef}
        id={id}
        inputMode="numeric"
        autoComplete="off"
        value={display}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => {
          const el = e.currentTarget;
          const typed = el.value;
          const caret = el.selectionStart ?? typed.length;
          const digitsBefore = countDigits(typed.slice(0, caret));
          const next = formatNumberForInput(typed);
          caretRef.current = caretAfterDigits(next, digitsBefore);
          onChange(next);
        }}
        className={`krw ${suffix ? "pr-9" : ""} ${
          invalid ? "border-signal-red focus:border-signal-red" : ""
        }`}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-400">
          {suffix}
        </span>
      )}
    </div>
  );
}
