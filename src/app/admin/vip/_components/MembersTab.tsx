"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import DataTable from "@/components/admin/DataTable";
import Modal from "@/components/admin/Modal";
import Pagination from "@/components/admin/Pagination";
import { FieldRow, Input, Select } from "@/components/admin/Field";
import { formatDate, formatPhone } from "@/lib/format";
import CustomerSearch from "./CustomerSearch";
import NextStepCard from "./NextStepCard";
import {
  api,
  BTN_GHOST,
  BTN_PRIMARY,
  customerLabel,
  type CustomerHit,
  type GroupRow,
  type MemberRow,
} from "./vipApi";

/* ============================================================
   [멤버] 탭 — vip_members: 고객 검색 → 그룹 배정, 메모, 해제

   왜 그룹을 위에서 받아 오나:
   예전에는 이 탭이 그룹을 따로 읽었고, 그룹이 하나도 없어도 '멤버 추가'가
   그대로 열렸다. 고객까지 골라 저장을 누르면 그제서야 '배정할 그룹을
   선택해 주세요.' 라고만 뜨고, 그룹을 만들 방법도 안내도 없어 길이 끊겼다.
   이제 그룹이 없으면 추가 버튼을 잠그고 그룹 탭으로 보낸다.
   ============================================================ */

export interface MembersTabProps {
  groups: GroupRow[];
  /** 그룹을 아직 읽는 중이면 true — 읽기 전에 '그룹이 없다'고 단정하면 안내가 깜빡인다 */
  groupsLoading: boolean;
  /** 그룹이 없을 때 그룹 탭으로 보내는 통로 */
  onGoToGroups: () => void;
  /** 멤버 수가 바뀌면 상단 진행 안내를 다시 계산하게 한다 */
  onChanged: () => void | Promise<void>;
}

const PAGE_SIZE = 20;

interface MemberDraft {
  id: string | null; // null이면 새 배정
  customer: CustomerHit | null;
  groupId: string;
  note: string;
}

export default function MembersTab({ groups, groupsLoading, onGoToGroups, onChanged }: MembersTabProps) {
  const [members, setMembers] = useState<MemberRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState("");
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<MemberDraft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<MemberRow | null>(null);

  const load = useCallback(async (filter: string) => {
    setMembers(null);
    try {
      const qs = filter ? `?group_id=${filter}` : "";
      const data = await api<{ members: MemberRow[] }>(`/api/admin/vip/members${qs}`);
      setMembers(data.members);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "멤버 목록을 불러오지 못했습니다.");
      setMembers([]);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => load(groupFilter), 0);
    return () => clearTimeout(timer);
  }, [groupFilter, load]);

  const hasGroup = groups.length > 0;
  // 그룹이 없거나 배정된 멤버가 없으면 표 대신 '다음에 할 일' 카드를 보여 준다
  // 그룹을 아직 읽는 중일 때는 아무 단정도 하지 않는다(안내가 깜빡이는 것을 막는다)
  const showEmptyState =
    !groupsLoading && (!hasGroup || (members !== null && members.length === 0));

  const totalPages = Math.max(1, Math.ceil((members?.length ?? 0) / PAGE_SIZE));
  const pageRows = useMemo(
    () => (members ?? []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [members, page]
  );

  function openCreate() {
    setDraftError(null);
    setDraft({ id: null, customer: null, groupId: groups[0]?.id ?? "", note: "" });
  }

  function openEdit(member: MemberRow) {
    setDraftError(null);
    setDraft({
      id: member.id,
      customer: member.profiles
        ? { ...member.profiles, phone: member.profiles.phone ?? null }
        : null,
      groupId: member.group_id,
      note: member.note ?? "",
    });
  }

  async function saveDraft() {
    if (!draft) return;
    if (!draft.id && !draft.customer) {
      setDraftError("배정할 고객을 검색해 선택해 주세요.");
      return;
    }
    if (!draft.groupId) {
      setDraftError("배정할 그룹을 선택해 주세요.");
      return;
    }

    setSaving(true);
    setDraftError(null);
    try {
      if (draft.id) {
        await api(`/api/admin/vip/members/${draft.id}`, {
          method: "PATCH",
          body: JSON.stringify({ group_id: draft.groupId, note: draft.note.trim() || null }),
        });
      } else {
        await api("/api/admin/vip/members", {
          method: "POST",
          body: JSON.stringify({
            user_id: draft.customer!.id,
            group_id: draft.groupId,
            note: draft.note.trim() || null,
          }),
        });
      }
      setDraft(null);
      await load(groupFilter);
      await onChanged();
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {/* 툴바 */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Select
          value={groupFilter}
          onChange={(e) => {
            setGroupFilter(e.target.value);
            setPage(1);
          }}
          className="sm:max-w-56"
          aria-label="그룹 필터"
        >
          <option value="">전체 그룹</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
        <button
          type="button"
          onClick={openCreate}
          disabled={!hasGroup}
          title={hasGroup ? undefined : "먼저 VIP 그룹을 만들어야 합니다"}
          className={`shrink-0 ${BTN_PRIMARY}`}
        >
          멤버 추가
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-signal-red">{error}</p>}

      {showEmptyState ? (
        <NextStepCard
          title={hasGroup ? "아직 배정된 VIP 멤버가 없습니다." : "먼저 VIP 그룹을 만들어야 합니다."}
          description={
            hasGroup
              ? "가입한 고객을 그룹에 배정하면 그 그룹의 할인율과 전용 가격이 바로 적용됩니다."
              : "멤버는 그룹에 배정하는 것이라, 그룹이 하나도 없으면 배정할 곳이 없습니다. 그룹을 먼저 만들어 주세요."
          }
          actionLabel={hasGroup ? "멤버 추가" : "그룹 만들러 가기"}
          onAction={hasGroup ? openCreate : onGoToGroups}
        />
      ) : (
      <DataTable<MemberRow>
        columns={[
          {
            key: "customer",
            label: "고객",
            render: (m) => (
              <div className="min-w-0">
                <p className="truncate text-ink-900">{customerLabel(m.profiles)}</p>
                {m.profiles?.email && (
                  <p className="truncate text-xs text-ink-400">{m.profiles.email}</p>
                )}
              </div>
            ),
          },
          {
            key: "group",
            label: "그룹",
            width: "160px",
            render: (m) => m.vip_groups?.name ?? <span className="text-ink-300">—</span>,
          },
          {
            key: "phone",
            label: "연락처",
            width: "140px",
            hideOnMobile: true,
            render: (m) =>
              m.profiles?.phone ? (
                <span className="krw">{formatPhone(m.profiles.phone)}</span>
              ) : (
                <span className="text-ink-300">—</span>
              ),
          },
          {
            key: "created_at",
            label: "배정일",
            width: "110px",
            render: (m) => formatDate(m.created_at),
          },
          {
            key: "note",
            label: "메모",
            hideOnMobile: true,
            render: (m) =>
              m.note ? (
                <span className="line-clamp-1 text-ink-600">{m.note}</span>
              ) : (
                <span className="text-ink-300">—</span>
              ),
          },
          {
            key: "actions",
            label: "관리",
            width: "120px",
            align: "right",
            render: (m) => (
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => openEdit(m)}
                  className="text-sm text-ink-600 transition-colors hover:text-forest-700"
                >
                  수정
                </button>
                <button
                  type="button"
                  onClick={() => setRemoving(m)}
                  className="text-sm text-ink-600 transition-colors hover:text-signal-red"
                >
                  해제
                </button>
              </div>
            ),
          },
        ]}
        rows={pageRows}
        loading={members === null}
        emptyMessage="아직 배정된 VIP 멤버가 없습니다."
        pagination={<Pagination page={page} totalPages={totalPages} onChange={setPage} />}
      />
      )}

      {/* 추가/수정 모달 */}
      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? "멤버 수정" : "멤버 추가"}
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
            <FieldRow label="고객" required>
              {draft.id ? (
                <div className="border border-ink-200 bg-cream-100 px-3.5 py-2.5">
                  <p className="text-sm text-ink-900">{customerLabel(draft.customer)}</p>
                  {draft.customer?.email && (
                    <p className="text-xs text-ink-400">{draft.customer.email}</p>
                  )}
                </div>
              ) : (
                <CustomerSearch
                  value={draft.customer}
                  onChange={(customer) => setDraft({ ...draft, customer })}
                />
              )}
            </FieldRow>
            <FieldRow
              label="배정할 그룹"
              required
              htmlFor="member-group"
              help="그룹에 걸린 할인율이 이 고객에게 그대로 적용됩니다."
            >
              <Select
                id="member-group"
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
            <FieldRow label="메모" htmlFor="member-note" help="운영 메모 — 고객에게는 보이지 않습니다.">
              <Input
                id="member-note"
                value={draft.note}
                maxLength={200}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                placeholder="예: 도매 거래처, 오픈 이벤트 초대"
              />
            </FieldRow>
            {draftError && <p className="pt-3 text-sm text-signal-red">{draftError}</p>}
          </div>
        )}
      </Modal>

      {/* 해제 확인 */}
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          await api(`/api/admin/vip/members/${removing.id}`, { method: "DELETE" });
          await load(groupFilter);
          await onChanged();
        }}
        title="멤버십 해제"
        description={`${customerLabel(removing?.profiles)} 고객의 VIP 멤버십을 해제합니다. 그룹 할인과 전용 가격이 더 이상 적용되지 않습니다.`}
        confirmLabel="해제"
        danger
      />
    </div>
  );
}
