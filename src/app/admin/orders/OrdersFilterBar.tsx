"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";
import {
  DATE_PRESETS,
  describeRange,
  matchedPreset,
  parseKoreanDate,
  presetRange,
  toKoreanDate,
  type DateRangeValue,
} from "./orders-list";

/* ============================================================
   주문 목록 툴바 — 검색 · 기간(한국식) · 걸린 조건 칩 · 초기화

   왜 브라우저 기본 날짜 입력을 쓰지 않는가: orders-list.ts 머리말 참고
   (en-US 로케일에서 'mm/dd/yyyy' 로 떠서 한국 대표가 날짜를 넣을 수 없었다)
   ============================================================ */

interface Props {
  search: string;
  range: DateRangeValue;
  onSearch: (value: string) => void;
  onRange: (value: DateRangeValue) => void;
  onReset: () => void;
}

const inputBase =
  "w-full rounded-none border border-ink-200 bg-cream-50 px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-300 transition-colors focus:border-forest-600 focus:outline-none";

export default function OrdersFilterBar({ search, range, onSearch, onRange, onReset }: Props) {
  const [q, setQ] = useState(search);
  const [fromText, setFromText] = useState(toKoreanDate(range.from));
  const [toText, setToText] = useState(toKoreanDate(range.to));
  const [dateError, setDateError] = useState<string | null>(null);

  // 빈 화면의 '필터 초기화' 처럼 바깥에서 조건이 지워질 수도 있다.
  // 그때 입력칸에 옛 글자가 남아 있으면 "지웠는데 왜 아직 있지" 가 된다 — 렌더 중에 맞춰 둔다.
  // 검색어와 기간은 따로 맞춘다 — 기간을 바꿨다고 입력 중이던 검색어를 지워 버리면 안 된다.
  const [synced, setSynced] = useState({ search, from: range.from, to: range.to });
  if (synced.search !== search) {
    setSynced((s) => ({ ...s, search }));
    setQ(search);
  }
  if (synced.from !== range.from || synced.to !== range.to) {
    setSynced((s) => ({ ...s, from: range.from, to: range.to }));
    setFromText(toKoreanDate(range.from));
    setToText(toKoreanDate(range.to));
    setDateError(null);
  }

  const active = matchedPreset(range);
  const hasFilter = Boolean(search || range.from || range.to);

  function applyPreset(key: (typeof DATE_PRESETS)[number]["key"]) {
    const next = presetRange(key);
    setFromText(toKoreanDate(next.from));
    setToText(toKoreanDate(next.to));
    setDateError(null);
    onRange(next);
  }

  function applyTyped(which: "from" | "to", raw: string) {
    const parsed = parseKoreanDate(raw);
    if (parsed === null) {
      setDateError("날짜를 읽지 못했습니다. 예) 2026.08.19");
      return;
    }
    setDateError(null);
    onRange({ ...range, [which]: parsed });
  }

  function clearAll() {
    setQ("");
    setFromText("");
    setToText("");
    setDateError(null);
    onReset();
  }

  return (
    <div className="mb-5 space-y-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        {/* 검색 */}
        <div className="relative xl:max-w-96 xl:flex-1">
          <Search
            size={16}
            strokeWidth={1.5}
            aria-hidden
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-300"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSearch(q.trim());
            }}
            placeholder="주문번호 · 주문자/받는분 이름 · 연락처 · 주소"
            aria-label="주문 검색"
            className={`${inputBase} pl-10`}
          />
        </div>

        {/* 기간 */}
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => applyPreset(p.key)}
                aria-pressed={active === p.key}
                className={`border px-3 py-1.5 text-xs transition-colors ${
                  active === p.key
                    ? "border-forest-700 bg-forest-700 text-cream-50"
                    : "border-ink-200 bg-cream-50 text-ink-600 hover:bg-cream-100"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={fromText}
              onChange={(e) => setFromText(e.target.value)}
              onBlur={() => applyTyped("from", fromText)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyTyped("from", fromText);
              }}
              placeholder="2026.08.01"
              aria-label="시작일"
              className={`${inputBase} krw w-32`}
            />
            <span aria-hidden className="text-ink-300">
              –
            </span>
            <input
              value={toText}
              onChange={(e) => setToText(e.target.value)}
              onBlur={() => applyTyped("to", toText)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyTyped("to", toText);
              }}
              placeholder="2026.08.19"
              aria-label="종료일"
              className={`${inputBase} krw w-32`}
            />
          </div>
          {dateError && <p className="text-xs text-signal-red">{dateError}</p>}
        </div>
      </div>

      {/* 걸린 조건 칩 — 목록이 비었을 때 "내가 뭘 걸었더라" 를 화면이 대신 답한다 */}
      {hasFilter && (
        <div className="flex flex-wrap items-center gap-2">
          {search && (
            <FilterChip label={`검색: ${search}`} onRemove={() => { setQ(""); onSearch(""); }} />
          )}
          {(range.from || range.to) && (
            <FilterChip
              label={describeRange(range)}
              onRemove={() => {
                setFromText("");
                setToText("");
                onRange({ from: "", to: "" });
              }}
            />
          )}
          <button
            type="button"
            onClick={clearAll}
            className="text-xs text-ink-500 underline underline-offset-4 transition-colors hover:text-ink-900"
          >
            필터 초기화
          </button>
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 border border-ink-200 bg-cream-100 px-2.5 py-1 text-xs text-ink-700">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`${label} 조건 지우기`}
        className="-mr-0.5 p-0.5 text-ink-400 transition-colors hover:text-ink-900"
      >
        <X size={12} strokeWidth={2} />
      </button>
    </span>
  );
}
