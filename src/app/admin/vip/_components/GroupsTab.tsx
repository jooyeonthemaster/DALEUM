"use client";

import { useCallback, useEffect, useState } from "react";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import Modal from "@/components/admin/Modal";
import { FieldRow, Input, Textarea, Toggle } from "@/components/admin/Field";
import { api, BTN_GHOST, BTN_PRIMARY, type GroupRow } from "./vipApi";

/* ============================================================
   [그룹] 탭 — vip_groups CRUD
   ============================================================ */

interface GroupDraft {
  id: string | null; // null이면 새 그룹
  name: string;
  description: string;
  discountRate: string;
  isActive: boolean;
}

const EMPTY_DRAFT: GroupDraft = {
  id: null,
  name: "",
  description: "",
  discountRate: "0",
  isActive: true,
};

export default function GroupsTab() {
  const [groups, setGroups] = useState<GroupRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<GroupDraft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<GroupRow | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ groups: GroupRow[] }>("/api/admin/vip/groups");
      setGroups(data.groups);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "그룹 목록을 불러오지 못했습니다.");
      setGroups([]);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  function openCreate() {
    setDraftError(null);
    setDraft({ ...EMPTY_DRAFT });
  }

  function openEdit(group: GroupRow) {
    setDraftError(null);
    setDraft({
      id: group.id,
      name: group.name,
      description: group.description ?? "",
      discountRate: String(group.discount_rate),
      isActive: group.is_active,
    });
  }

  async function saveDraft() {
    if (!draft) return;
    if (!draft.name.trim()) {
      setDraftError("그룹 이름을 입력해 주세요.");
      return;
    }
    const rate = Number(draft.discountRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      setDraftError("할인율은 0~100 사이 숫자여야 합니다.");
      return;
    }

    setSaving(true);
    setDraftError(null);
    try {
      const payload = JSON.stringify({
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        discount_rate: rate,
        is_active: draft.isActive,
      });
      if (draft.id) {
        await api(`/api/admin/vip/groups/${draft.id}`, { method: "PATCH", body: payload });
      } else {
        await api("/api/admin/vip/groups", { method: "POST", body: payload });
      }
      setDraft(null);
      await load();
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(group: GroupRow, next: boolean) {
    setGroups((prev) =>
      prev ? prev.map((g) => (g.id === group.id ? { ...g, is_active: next } : g)) : prev
    );
    try {
      await api(`/api/admin/vip/groups/${group.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: next }),
      });
    } catch {
      // 실패 시 되돌림
      setGroups((prev) =>
        prev ? prev.map((g) => (g.id === group.id ? { ...g, is_active: !next } : g)) : prev
      );
    }
  }

  const loading = groups === null;

  return (
    <div>
      {/* 툴바 */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <p className="text-sm text-ink-500">
          그룹 단위로 전체 할인율을 정하고, 멤버·입장 코드·전용 가격을 연결합니다.
        </p>
        <button type="button" onClick={openCreate} className={`shrink-0 ${BTN_PRIMARY}`}>
          새 그룹
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-signal-red">{error}</p>}

      {/* 그룹 카드 그리드 */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse border border-ink-200 bg-cream-100" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="border border-ink-200 bg-cream-50 px-6 py-16 text-center">
          <p className="headline-serif text-lg text-ink-900">아직 만들어진 VIP 그룹이 없습니다.</p>
          <p className="mt-2 text-sm text-ink-500">
            첫 그룹을 만들어 특별한 고객을 위한 혜택을 시작해 보세요.
          </p>
          <button type="button" onClick={openCreate} className={`mt-6 ${BTN_GHOST}`}>
            첫 그룹 만들기
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => (
            <div key={group.id} className="flex flex-col border border-ink-200 bg-cream-50 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-[15px] font-semibold text-ink-900">{group.name}</h3>
                  <p className="krw mt-0.5 text-sm text-forest-700">
                    {group.discount_rate > 0 ? `전체 ${group.discount_rate}% 할인` : "전체 할인 없음"}
                  </p>
                </div>
                <Toggle
                  checked={group.is_active}
                  onChange={(next) => toggleActive(group, next)}
                  label={group.is_active ? "활성" : "비활성"}
                />
              </div>

              {group.description && (
                <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-ink-500">
                  {group.description}
                </p>
              )}

              <div className="mt-auto flex items-center justify-between pt-5">
                <p className="label-caps text-ink-400">
                  멤버 {group.member_count} · 코드 {group.code_count}
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => openEdit(group)}
                    className="text-sm text-ink-600 transition-colors hover:text-forest-700"
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(group)}
                    className="text-sm text-ink-600 transition-colors hover:text-signal-red"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 생성/수정 모달 */}
      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? "그룹 수정" : "새 VIP 그룹"}
        footer={
          <>
            <button type="button" onClick={() => setDraft(null)} className={BTN_GHOST}>
              취소
            </button>
            <button type="button" onClick={saveDraft} disabled={saving} className={BTN_PRIMARY}>
              {saving ? "저장 중…" : "저장"}
            </button>
          </>
        }
      >
        {draft && (
          <div className="divide-y divide-ink-100">
            <FieldRow label="그룹 이름" required htmlFor="group-name">
              <Input
                id="group-name"
                value={draft.name}
                maxLength={50}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="예: 패밀리, 단골 고객"
              />
            </FieldRow>
            <FieldRow label="설명" htmlFor="group-desc">
              <Textarea
                id="group-desc"
                rows={3}
                value={draft.description}
                maxLength={300}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="운영 메모 — 고객에게는 보이지 않습니다."
              />
            </FieldRow>
            <FieldRow
              label="전체 할인율 (%)"
              htmlFor="group-rate"
              help="그룹 멤버 전 상품에 기본 적용됩니다. 상품별 가격이 있으면 그 가격이 우선합니다."
            >
              <Input
                id="group-rate"
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={draft.discountRate}
                onChange={(e) => setDraft({ ...draft, discountRate: e.target.value })}
                className="max-w-36"
              />
            </FieldRow>
            <FieldRow label="활성 상태" help="끄면 이 그룹의 모든 VIP 혜택이 중지됩니다.">
              <Toggle
                checked={draft.isActive}
                onChange={(next) => setDraft({ ...draft, isActive: next })}
                label={draft.isActive ? "활성" : "비활성"}
              />
            </FieldRow>
            {draftError && <p className="pt-3 text-sm text-signal-red">{draftError}</p>}
          </div>
        )}
      </Modal>

      {/* 삭제 확인 */}
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          await api(`/api/admin/vip/groups/${deleting.id}`, { method: "DELETE" });
          await load();
        }}
        title="그룹 삭제"
        description={
          deleting && deleting.member_count > 0
            ? `'${deleting.name}' 그룹에는 멤버 ${deleting.member_count}명이 소속되어 있습니다. 삭제하면 멤버 배정, 입장 코드, 전용 가격이 모두 함께 삭제되며 되돌릴 수 없습니다.`
            : `'${deleting?.name ?? ""}' 그룹을 삭제합니다. 연결된 입장 코드와 전용 가격도 함께 삭제되며 되돌릴 수 없습니다.`
        }
        confirmLabel="삭제"
        danger
      />
    </div>
  );
}
