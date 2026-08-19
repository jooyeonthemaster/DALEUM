"use client";

/* ============================================================
   배지·태그 입력 — 쉼표로 구분한 문자열을 타이핑하게 하지 않는다

   옛 화면은 배지·태그를 "NEW, BEST" 처럼 한 줄에 적게 했다. 구분자를 잘못 쓰면
   조용히 한 덩어리가 되거나 통째로 누락되는데, 화면에는 아무 표시도 없었다.
   여기서는 눌러서 켜고 끄거나, 적고 Enter 를 눌러 조각으로 만든다.
   ============================================================ */

import { useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/admin/Field";

export interface ChipEditorProps {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  /** 정해진 보기가 있으면 눌러서 켜고 끄는 방식이 된다 */
  options?: readonly string[];
  /** 직접 적어 넣을 수 있는가 */
  allowCustom?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

export default function ChipEditor({
  label,
  value,
  onChange,
  options,
  allowCustom = false,
  placeholder,
  disabled = false,
}: ChipEditorProps) {
  const [typed, setTyped] = useState("");

  function toggle(item: string) {
    onChange(value.includes(item) ? value.filter((v) => v !== item) : [...value, item]);
  }

  function commitTyped() {
    const next = typed.trim();
    if (!next || value.includes(next)) {
      setTyped("");
      return;
    }
    onChange([...value, next]);
    setTyped("");
  }

  return (
    <div>
      <span className="mb-1.5 block text-[13px] font-medium text-ink-700">{label}</span>

      {options && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {options.map((option) => {
            const on = value.includes(option);
            return (
              <button
                key={option}
                type="button"
                disabled={disabled}
                aria-pressed={on}
                onClick={() => toggle(option)}
                className={`border px-2.5 py-1 text-xs transition-colors disabled:opacity-50 ${
                  on
                    ? "border-forest-700 bg-forest-700 text-cream-50"
                    : "border-ink-200 bg-cream-50 text-ink-600 hover:bg-cream-100"
                }`}
              >
                {option}
              </button>
            );
          })}
        </div>
      )}

      {/* 정해진 보기 밖에서 들어온 값도 지울 수 있게 그대로 보여 준다 */}
      {value.filter((item) => !options?.includes(item)).length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {value
            .filter((item) => !options?.includes(item))
            .map((item) => (
              <li
                key={item}
                className="inline-flex items-center gap-1 border border-ink-200 bg-cream-100 px-2.5 py-1 text-xs text-ink-700"
              >
                {item}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(value.filter((v) => v !== item))}
                  aria-label={`${item} 지우기`}
                  className="text-ink-400 transition-colors hover:text-signal-red disabled:opacity-50"
                >
                  <X size={12} strokeWidth={1.5} />
                </button>
              </li>
            ))}
        </ul>
      )}

      {allowCustom && (
        <Input
          value={typed}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => setTyped(e.target.value)}
          onBlur={commitTyped}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commitTyped();
            }
          }}
        />
      )}
    </div>
  );
}
