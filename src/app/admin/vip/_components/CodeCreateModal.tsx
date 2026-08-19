"use client";

import { useState } from "react";
import Modal from "@/components/admin/Modal";
import { FieldRow, Input, Select } from "@/components/admin/Field";
import KoreanDateField, { expiryQuickPicks, isPastDate } from "./KoreanDateField";
import { api, BTN_GHOST, BTN_PRIMARY, generateCode, type GroupRow } from "./vipApi";

/* ============================================================
   입장 코드 만들기 모달.

   CodesTab 에서 떼어 냈다 — 표·복사 안내·만들기 폼이 한 파일에 있으면
   400줄을 넘어 어디를 고치는지 알기 어려워진다.

   만료일은 브라우저 기본 날짜 위젯(mm/dd/yyyy)이 아니라 한국식 달력을 쓴다.
   '9월 5일'을 05/09 로 넣어 코드가 5월에 죽는 사고를 막기 위해서다.
   ============================================================ */

export interface CodeCreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
  groups: GroupRow[];
}

interface CodeDraft {
  code: string;
  groupId: string;
  label: string;
  maxUses: string;
  expiresAt: string;
}

function emptyDraft(groups: GroupRow[]): CodeDraft {
  return {
    code: generateCode(8),
    groupId: groups[0]?.id ?? "",
    label: "",
    maxUses: "",
    expiresAt: "",
  };
}

export default function CodeCreateModal({
  open,
  onClose,
  onCreated,
  groups,
}: CodeCreateModalProps) {
  const [draft, setDraft] = useState<CodeDraft>(() => emptyDraft(groups));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function close() {
    setError(null);
    onClose();
  }

  async function save() {
    const code = draft.code.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,20}$/.test(code)) {
      setError("코드는 영문 대문자와 숫자만으로 4~20자를 입력해 주세요.");
      return;
    }
    if (!draft.groupId) {
      setError("이 코드로 들어온 고객을 어느 그룹으로 대접할지 골라 주세요.");
      return;
    }
    if (draft.maxUses.trim() !== "") {
      const n = Number(draft.maxUses);
      if (!Number.isInteger(n) || n < 1) {
        setError("사용 가능 횟수는 1 이상의 정수로 입력해 주세요.");
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      await api("/api/admin/vip/codes", {
        method: "POST",
        body: JSON.stringify({
          code,
          group_id: draft.groupId,
          label: draft.label.trim() || null,
          max_uses: draft.maxUses.trim() === "" ? null : Number(draft.maxUses),
          // 그 날 밤 12시까지 쓸 수 있게 — 날짜만 고르고 시각은 관리자가 신경 쓰지 않는다
          expires_at: draft.expiresAt ? `${draft.expiresAt}T23:59:59+09:00` : null,
        }),
      });
      setDraft(emptyDraft(groups));
      await onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "코드를 만들지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="입장 코드 만들기"
      footer={
        <>
          <button type="button" onClick={close} className={BTN_GHOST}>
            취소
          </button>
          <button type="button" onClick={save} disabled={saving} className={BTN_PRIMARY}>
            {saving ? "만드는 중…" : "만들기"}
          </button>
        </>
      }
    >
      <div className="divide-y divide-ink-100">
        <FieldRow
          label="입장 코드"
          required
          htmlFor="code-value"
          help="고객이 VIP 라운지에서 입력할 글자입니다. 자동으로 만든 코드를 그대로 쓰거나 기억하기 쉬운 말로 바꿔도 됩니다."
        >
          <div className="flex gap-2">
            <Input
              id="code-value"
              value={draft.code}
              maxLength={20}
              onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
              className="krw uppercase tracking-[0.08em]"
            />
            <button
              type="button"
              onClick={() => setDraft({ ...draft, code: generateCode(8) })}
              className={`shrink-0 whitespace-nowrap ${BTN_GHOST}`}
            >
              새로 뽑기
            </button>
          </div>
        </FieldRow>

        <FieldRow
          label="연결할 그룹"
          required
          htmlFor="code-group"
          help="이 코드로 들어온 고객은 이 그룹의 할인율과 전용 가격을 받습니다."
        >
          <Select
            id="code-group"
            value={draft.groupId}
            onChange={(e) => setDraft({ ...draft, groupId: e.target.value })}
          >
            <option value="">그룹 선택</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
                {g.discount_rate > 0 ? ` — 전체 ${g.discount_rate}% 할인` : " — 전체 할인 없음"}
              </option>
            ))}
          </Select>
        </FieldRow>

        <FieldRow
          label="메모"
          htmlFor="code-label"
          help="어디에 뿌린 코드인지 적어 두세요. 고객에게는 보이지 않습니다."
        >
          <Input
            id="code-label"
            value={draft.label}
            maxLength={100}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            placeholder="예: 2026 설 선물세트 거래처용"
          />
        </FieldRow>

        <FieldRow
          label="사용 가능 횟수"
          htmlFor="code-max"
          help="비워 두면 횟수 제한이 없습니다. 결제가 끝날 때마다 1회씩 줄어듭니다."
        >
          <Input
            id="code-max"
            type="number"
            min={1}
            value={draft.maxUses}
            onChange={(e) => setDraft({ ...draft, maxUses: e.target.value })}
            placeholder="제한 없음"
            className="max-w-36"
          />
        </FieldRow>

        <FieldRow
          label="만료일"
          help="고른 날 밤 12시까지 쓸 수 있습니다. 비워 두면 만료되지 않습니다."
        >
          <KoreanDateField
            value={draft.expiresAt}
            onChange={(next) => setDraft({ ...draft, expiresAt: next })}
            emptyLabel="만료 없음"
            quickPicks={expiryQuickPicks()}
            ariaLabel="코드 만료일"
          />
          {isPastDate(draft.expiresAt) && (
            <p className="mt-2 text-xs text-signal-red">
              지난 날짜입니다. 이대로 만들면 코드가 곧바로 만료된 상태가 됩니다.
            </p>
          )}
        </FieldRow>

        {error && <p className="pt-3 text-sm text-signal-red">{error}</p>}
      </div>
    </Modal>
  );
}
