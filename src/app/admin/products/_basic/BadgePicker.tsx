"use client";

/* ============================================================
   뱃지 고르기 — 추천 세 개에 갇히지 않게.

   왜 바꿨나: 서버는 뱃지를 자유 문자열로 최대 10개까지 받는데(shared.ts) 화면만
   BEST·NEW·한정 세 개로 막혀 있었다. '설 선물', '1+1' 같은 시즌 뱃지를 붙이려면
   마케터가 개발자에게 코드 수정을 부탁해야 했고 프로모션이 개발 일정에 묶였다.
   그래서 세 개는 '추천' 으로 두고, 직접 적은 뱃지도 함께 칩으로 보여준다.
   ============================================================ */

import { useState } from "react";
import { Plus } from "lucide-react";
import { Help, Input } from "@/components/admin/Field";
import { BADGE_OPTIONS } from "../product-ui";

export interface BadgePickerProps {
  value: string[];
  onChange: (next: string[]) => void;
}

/** 서버가 받아 주는 한도 — 넘겨 보내면 조용히 잘리므로 화면에서 먼저 막는다 */
const MAX_BADGES = 10;
const MAX_BADGE_LEN = 20;

export default function BadgePicker({ value, onChange }: BadgePickerProps) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  // 추천 + 이 상품이 실제로 쓰고 있는 값(직접 적었거나 예전에 넣어 둔 것)을 한 줄에 보여준다
  const chips = [...BADGE_OPTIONS, ...value.filter((b) => !BADGE_OPTIONS.includes(b as never))];
  const full = value.length >= MAX_BADGES;

  function toggle(badge: string) {
    onChange(value.includes(badge) ? value.filter((b) => b !== badge) : [...value, badge]);
  }

  function addDraft() {
    const next = draft.trim().slice(0, MAX_BADGE_LEN);
    if (!next || value.includes(next) || full) return;
    onChange([...value, next]);
    setDraft("");
    setAdding(false);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {chips.map((badge) => {
          const on = value.includes(badge);
          return (
            <button
              key={badge}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(badge)}
              disabled={!on && full}
              className={`rounded-full border px-3.5 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                on
                  ? "border-forest-700 bg-forest-700 text-cream-50"
                  : "border-ink-200 bg-cream-50 text-ink-600 hover:border-forest-600 hover:text-forest-700"
              }`}
            >
              {badge}
            </button>
          );
        })}

        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={full}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-ink-200 bg-cream-50 px-3.5 py-1.5 text-xs text-ink-500 transition-colors hover:border-forest-600 hover:text-forest-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={12} strokeWidth={1.5} />
            직접 입력
          </button>
        )}
      </div>

      {adding && (
        <div className="mt-2 flex items-center gap-2">
          <Input
            autoFocus
            value={draft}
            maxLength={MAX_BADGE_LEN}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addDraft();
              }
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder="예: 설 선물"
            aria-label="새 뱃지"
            className="max-w-48"
          />
          <button
            type="button"
            onClick={addDraft}
            className="border border-ink-200 bg-cream-50 px-3 py-2 text-xs text-ink-700 transition-colors hover:border-forest-600 hover:text-forest-700"
          >
            추가
          </button>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="text-xs text-ink-400 transition-colors hover:text-ink-700"
          >
            취소
          </button>
        </div>
      )}

      <Help>
        여러 개를 동시에 고를 수 있고, 목록에 없는 뱃지는 직접 적어 넣을 수 있습니다. 한 상품에 최대{" "}
        {MAX_BADGES}개, 한 개당 {MAX_BADGE_LEN}자까지입니다.
      </Help>
      {full && <Help tone="error">뱃지는 {MAX_BADGES}개까지만 붙일 수 있습니다.</Help>}
    </div>
  );
}
