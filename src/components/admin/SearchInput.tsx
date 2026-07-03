"use client";

import { Search, X } from "lucide-react";

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Enter 입력 시 호출 */
  onSubmit?: () => void;
  placeholder?: string;
  className?: string;
}

/** 검색 인풋 — 좌측 돋보기, 값 있을 때 지우기 버튼 */
export default function SearchInput({
  value,
  onChange,
  onSubmit,
  placeholder = "검색어 입력",
  className = "",
}: SearchInputProps) {
  return (
    <div className={`relative ${className}`}>
      <Search
        size={16}
        strokeWidth={1.5}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
      />
      <input
        type="text"
        role="searchbox"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit?.();
          }
        }}
        className="w-full rounded-none border border-ink-200 bg-cream-50 py-2.5 pl-9 pr-9 text-sm text-ink-900 placeholder:text-ink-300 transition-colors focus:border-forest-600 focus:outline-none"
      />
      {value && (
        <button
          type="button"
          aria-label="검색어 지우기"
          onClick={() => onChange("")}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-ink-400 transition-colors hover:text-ink-900"
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      )}
    </div>
  );
}
