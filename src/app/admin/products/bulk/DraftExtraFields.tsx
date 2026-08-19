"use client";

/* ============================================================
   상품 카드의 '더 넣기' 칸 — 한줄 소개 · 배지 · 태그 · 영양 · 표시사항

   DraftCard 에서 떼어 냈다(한 파일 500줄 상한).

   영양·표시사항은 예전에 `열량=15kcal|나트륨=10mg` 처럼 등호와 세로줄을 지켜
   타이핑하게 했다. 한 글자만 틀려도 조용히 누락되는데 화면에는 아무 표시도 없었다.
   지금은 항목/값 두 칸짜리 행으로 받고, 자주 쓰는 항목 이름은 눌러서 깔 수 있다.
   ============================================================ */

import KeyValueEditor from "../KeyValueEditor";
import { Help, Input } from "@/components/admin/Field";
import { NUTRITION_PRESETS, SPEC_PRESETS } from "@/components/admin/detail/kv-presets";
import { BADGE_OPTIONS } from "../product-ui";
import type { KvRow } from "../form-types";
import ChipEditor from "./ChipEditor";
import type { ProductDraft } from "./bulk-types";

/** 항목 이름을 눌러 빈 행으로 깔아 주는 줄 — 34행을 손으로 타이핑하지 않게 */
function PresetKeys({
  groups,
  rows,
  onChange,
  disabled,
}: {
  groups: { label: string; keys: string[] }[];
  rows: KvRow[];
  onChange: (rows: KvRow[]) => void;
  disabled: boolean;
}) {
  return (
    <div className="mb-2 space-y-1.5">
      {groups.map((group) => (
        <div key={group.label} className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-ink-400">{group.label}</span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              const existing = new Set(rows.map((r) => r.key.trim()));
              const added = group.keys
                .filter((key) => !existing.has(key))
                .map((key) => ({ key, value: "" }));
              if (added.length > 0) onChange([...rows, ...added]);
            }}
            className="border border-ink-200 px-2 py-0.5 text-[11px] text-ink-600 transition-colors hover:bg-cream-100 disabled:opacity-50"
          >
            항목 한번에 깔기
          </button>
        </div>
      ))}
    </div>
  );
}

export interface DraftExtraFieldsProps {
  draft: ProductDraft;
  locked: boolean;
  onPatch: (patch: Partial<ProductDraft>) => void;
}

export default function DraftExtraFields({ draft, locked, onPatch }: DraftExtraFieldsProps) {
  return (
    <div className="space-y-4 border-t border-ink-100 pt-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label>
            <span className="mb-1.5 block text-[13px] font-medium text-ink-700">한줄 소개</span>
            <Input
              value={draft.subtitle}
              disabled={locked}
              onChange={(e) => onPatch({ subtitle: e.target.value })}
            />
          </label>
          <label>
            <span className="mb-1.5 block text-[13px] font-medium text-ink-700">상품 코드</span>
            <Input
              value={draft.sku}
              disabled={locked}
              onChange={(e) => onPatch({ sku: e.target.value })}
            />
            <Help>창고·주문서에서 쓰는 관리용 번호입니다. 비워 두어도 됩니다.</Help>
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <ChipEditor
            label="배지"
            value={draft.badges}
            disabled={locked}
            options={BADGE_OPTIONS}
            onChange={(badges) => onPatch({ badges })}
          />
          <ChipEditor
            label="태그"
            value={draft.tags}
            disabled={locked}
            allowCustom
            placeholder="저칼로리 · 적고 Enter"
            onChange={(tags) => onPatch({ tags })}
          />
        </div>

        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-ink-700">영양 정보</span>
          <PresetKeys
            groups={NUTRITION_PRESETS}
            rows={draft.nutrition}
            disabled={locked}
            onChange={(nutrition) => onPatch({ nutrition })}
          />
          <KeyValueEditor
            rows={draft.nutrition}
            onChange={(nutrition) => onPatch({ nutrition })}
            keyPlaceholder="열량"
            valuePlaceholder="15kcal"
          />
        </div>

        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-ink-700">
            상세 정보 · 식품 표시사항
          </span>
          <PresetKeys
            groups={SPEC_PRESETS}
            rows={draft.specs}
            disabled={locked}
            onChange={(specs) => onPatch({ specs })}
          />
          <KeyValueEditor
            rows={draft.specs}
            onChange={(specs) => onPatch({ specs })}
            keyPlaceholder="식품유형"
            valuePlaceholder="곤약가공품"
          />
        </div>
    </div>
  );
}
