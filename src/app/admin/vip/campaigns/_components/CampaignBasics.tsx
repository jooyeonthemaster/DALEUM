"use client";

import ImageUploader from "@/components/admin/ImageUploader";
import { FieldRow, Input, Select, Textarea, Toggle } from "@/components/admin/Field";
import { TOGGLE_LABELS } from "@/lib/admin-labels";
import CustomerSearch from "../../_components/CustomerSearch";
import KoreanDateField, {
  expiryQuickPicks,
  formatKoreanDate,
  isPastDate,
} from "../../_components/KoreanDateField";
import type { GroupRow } from "../../_components/vipApi";
import type { CampaignDraft } from "./campaignDraft";

/* ============================================================
   캠페인 폼의 '기본 정보'와 '누가 볼 수 있는지' 구역.

   고친 것:
   · 만료일이 브라우저 기본 날짜칸이라 mm/dd/yyyy 로 떴다 → 한국식 달력 + 해석 문장.
   · 히어로 이미지에 권장 규격이 없어 올린 사진이 잘려 나갔다 → 권장 크기와
     잘리는 방향을 미리 알려 주고, 미리보기 틀도 실제 비율(가로형)로 맞췄다.
   · '히어로'·'활성' 같은 말을 관리자가 알아들을 수 있는 말로 바꿨다.
   ============================================================ */

const MESSAGE_PLACEHOLDER =
  "고객님께 드리는 감사의 마음을 담아, 이곳에서만 만나실 수 있는 가격으로 준비했습니다.";

export interface CampaignBasicsProps {
  draft: CampaignDraft;
  onPatch: (patch: Partial<CampaignDraft>) => void;
  groups: GroupRow[];
}

export default function CampaignBasics({ draft, onPatch, groups }: CampaignBasicsProps) {
  return (
    <>
      <section className="border border-ink-200 bg-cream-50 p-5">
        <h2 className="mb-2 text-sm font-medium text-ink-900">기본 정보</h2>
        <div className="divide-y divide-ink-100">
          <FieldRow label="제목" required htmlFor="camp-title" help="캠페인 페이지 맨 위에 큰 글씨로 나옵니다.">
            <Input
              id="camp-title"
              value={draft.title}
              maxLength={100}
              onChange={(e) => onPatch({ title: e.target.value })}
              placeholder="예: 단골 고객님을 위한 여름 감사전"
            />
          </FieldRow>

          <FieldRow
            label="인사말"
            htmlFor="camp-message"
            help="제목 아래에 이어지는 문장입니다. 비워 두어도 됩니다."
          >
            <Textarea
              id="camp-message"
              rows={4}
              value={draft.message}
              maxLength={2000}
              onChange={(e) => onPatch({ message: e.target.value })}
              placeholder={MESSAGE_PLACEHOLDER}
            />
          </FieldRow>

          <FieldRow
            label="배경 사진"
            help="캠페인 페이지 맨 위에 넓게 깔리는 사진입니다. 가로 2,400 × 세로 1,350픽셀 안팎의 가로형을 권합니다. 화면 폭에 맞춰 채워지므로 위아래가 조금 잘립니다 — 사진 안에 글자를 넣지 마세요. 어두운 톤이 흰 글씨와 잘 어울립니다."
          >
            <ImageUploader
              value={draft.heroUrl ? [{ url: draft.heroUrl }] : []}
              onChange={(next) => onPatch({ heroUrl: next[next.length - 1]?.url ?? null })}
              bucket="banners"
              prefix="vip-campaigns"
              multiple={false}
              previewAspect={16 / 9}
            />
          </FieldRow>

          <FieldRow label="언제까지 열어 둘지" help="고른 날 밤 12시까지 열립니다. 비워 두면 닫히지 않습니다.">
            <KoreanDateField
              value={draft.expires}
              onChange={(next) => onPatch({ expires: next })}
              emptyLabel="계속 열어 두기"
              quickPicks={expiryQuickPicks()}
              ariaLabel="캠페인 만료일"
            />
            {draft.expires && (
              <p
                className={`mt-2 text-xs ${
                  isPastDate(draft.expires) ? "text-signal-red" : "text-ink-500"
                }`}
              >
                {isPastDate(draft.expires)
                  ? `지난 날짜입니다 — ${formatKoreanDate(draft.expires)}. 이대로 저장하면 링크를 받은 고객에게 '이미 종료되었습니다'만 보입니다.`
                  : `${formatKoreanDate(draft.expires)} 밤 12시까지 열립니다.`}
              </p>
            )}
          </FieldRow>

          <FieldRow label="지금 열기" help="끄면 링크를 받은 고객에게 종료 안내가 보입니다.">
            <Toggle
              checked={draft.active}
              onChange={(next) => onPatch({ active: next })}
              label={draft.active ? TOGGLE_LABELS.on : TOGGLE_LABELS.off}
            />
          </FieldRow>
        </div>
      </section>

      <section className="mt-4 border border-ink-200 bg-cream-50 p-5">
        <h2 className="mb-2 text-sm font-medium text-ink-900">누가 볼 수 있는지</h2>
        <div className="divide-y divide-ink-100">
          <FieldRow label="열람 범위" help="링크를 받은 사람 외에는 이 페이지를 찾을 수 없습니다.">
            <div className="flex flex-wrap gap-4 pb-3">
              {(
                [
                  { key: "none", label: "링크를 받은 사람 누구나" },
                  { key: "group", label: "특정 그룹만" },
                  { key: "user", label: "고객 한 명만" },
                ] as const
              ).map((option) => (
                <label
                  key={option.key}
                  className="flex cursor-pointer items-center gap-1.5 text-sm text-ink-700"
                >
                  <input
                    type="radio"
                    name="camp-target"
                    checked={draft.targetType === option.key}
                    onChange={() => onPatch({ targetType: option.key })}
                    className="accent-forest-700"
                  />
                  {option.label}
                </label>
              ))}
            </div>
            {draft.targetType === "group" && (
              <Select
                value={draft.groupId}
                onChange={(e) => onPatch({ groupId: e.target.value })}
                aria-label="대상 그룹"
              >
                <option value="">그룹 선택</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            )}
            {draft.targetType === "user" && (
              <CustomerSearch
                value={draft.customer}
                onChange={(customer) => onPatch({ customer })}
              />
            )}
          </FieldRow>

          <FieldRow
            label="암호 한 겹 더"
            htmlFor="camp-code"
            help="넣으면 링크를 열 때 이 글자를 물어봅니다. 링크가 새어 나가도 막을 수 있습니다. 비워 두면 묻지 않습니다."
          >
            <Input
              id="camp-code"
              value={draft.requireCode}
              maxLength={20}
              onChange={(e) => onPatch({ requireCode: e.target.value.toUpperCase() })}
              placeholder="예: THANKS2026"
              className="krw max-w-56 uppercase tracking-[0.08em]"
            />
          </FieldRow>
        </div>
      </section>
    </>
  );
}
