"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import DataTable from "@/components/admin/DataTable";
import Modal from "@/components/admin/Modal";
import Pagination from "@/components/admin/Pagination";
import { FieldRow, Input, Select, Toggle } from "@/components/admin/Field";
import { formatDate, krw } from "@/lib/format";
import {
  api,
  BTN_GHOST,
  BTN_PRIMARY,
  copyText,
  generateCode,
  vipEntryUrl,
  type CodeRow,
  type GroupRow,
} from "./vipApi";

/* ============================================================
   [입장 코드] 탭 — vip_access_codes: 생성/복사/사용현황/활성/삭제
   ============================================================ */

const PAGE_SIZE = 20;

interface CodeDraft {
  code: string;
  groupId: string;
  label: string;
  maxUses: string;
  expiresAt: string;
}

export default function CodesTab() {
  const [codes, setCodes] = useState<CodeRow[] | null>(null);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<CodeDraft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<CodeRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ codes: CodeRow[] }>("/api/admin/vip/codes");
      setCodes(data.codes);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "코드 목록을 불러오지 못했습니다.");
      setCodes([]);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    api<{ groups: GroupRow[] }>("/api/admin/vip/groups")
      .then((data) => setGroups(data.groups))
      .catch(() => setGroups([]));
    return () => {
      clearTimeout(timer);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, [load]);

  function showNotice(message: string) {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 5000);
  }

  async function copyCode(row: CodeRow) {
    const ok = await copyText(row.code);
    if (!ok) return;
    setCopiedId(row.id);
    setTimeout(() => setCopiedId((prev) => (prev === row.id ? null : prev)), 1500);
    showNotice(`코드 '${row.code}'가 복사되었습니다 — 고객에게 /vip 주소와 함께 전달하세요.`);
  }

  async function copyUrl() {
    const ok = await copyText(vipEntryUrl());
    if (ok) showNotice(`VIP 입장 주소(${vipEntryUrl()})가 복사되었습니다.`);
  }

  async function toggleActive(row: CodeRow, next: boolean) {
    setCodes((prev) =>
      prev ? prev.map((c) => (c.id === row.id ? { ...c, is_active: next } : c)) : prev
    );
    try {
      await api(`/api/admin/vip/codes/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: next }),
      });
    } catch {
      setCodes((prev) =>
        prev ? prev.map((c) => (c.id === row.id ? { ...c, is_active: !next } : c)) : prev
      );
    }
  }

  function openCreate() {
    setDraftError(null);
    setDraft({
      code: generateCode(8),
      groupId: groups[0]?.id ?? "",
      label: "",
      maxUses: "",
      expiresAt: "",
    });
  }

  async function saveDraft() {
    if (!draft) return;
    const code = draft.code.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,20}$/.test(code)) {
      setDraftError("코드는 영문 대문자·숫자 4~20자로 입력해 주세요.");
      return;
    }
    if (!draft.groupId) {
      setDraftError("코드를 연결할 그룹을 선택해 주세요.");
      return;
    }
    if (draft.maxUses.trim() !== "") {
      const n = Number(draft.maxUses);
      if (!Number.isInteger(n) || n < 1) {
        setDraftError("최대 사용 횟수는 1 이상의 정수여야 합니다.");
        return;
      }
    }

    setSaving(true);
    setDraftError(null);
    try {
      await api("/api/admin/vip/codes", {
        method: "POST",
        body: JSON.stringify({
          code,
          group_id: draft.groupId,
          label: draft.label.trim() || null,
          max_uses: draft.maxUses.trim() === "" ? null : Number(draft.maxUses),
          expires_at: draft.expiresAt ? `${draft.expiresAt}T23:59:59+09:00` : null,
        }),
      });
      setDraft(null);
      await load();
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : "코드 생성에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil((codes?.length ?? 0) / PAGE_SIZE));
  const pageRows = useMemo(
    () => (codes ?? []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [codes, page]
  );

  return (
    <div>
      {/* 툴바 */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-500">
          코드를 아는 고객만 <span className="text-forest-700">/vip</span> 라운지에 입장할 수
          있습니다.
        </p>
        <button type="button" onClick={openCreate} className={`shrink-0 ${BTN_PRIMARY}`}>
          코드 생성
        </button>
      </div>

      {/* 복사 안내 */}
      {notice && (
        <p className="mb-4 border border-forest-200 bg-forest-50 px-4 py-2.5 text-sm text-forest-800">
          {notice}
        </p>
      )}
      {error && <p className="mb-4 text-sm text-signal-red">{error}</p>}

      <DataTable<CodeRow>
        columns={[
          {
            key: "code",
            label: "코드",
            width: "220px",
            render: (row) => (
              <div className="flex items-center gap-2">
                <span className="krw font-semibold tracking-[0.08em] text-ink-900">
                  {row.code}
                </span>
                <button
                  type="button"
                  onClick={() => copyCode(row)}
                  aria-label="코드 복사"
                  className="p-1 text-ink-400 transition-colors hover:text-forest-700"
                >
                  {copiedId === row.id ? (
                    <Check size={15} strokeWidth={1.5} className="text-forest-700" />
                  ) : (
                    <Copy size={15} strokeWidth={1.5} />
                  )}
                </button>
                <button
                  type="button"
                  onClick={copyUrl}
                  className="whitespace-nowrap text-xs text-ink-400 transition-colors hover:text-forest-700"
                >
                  URL 복사
                </button>
              </div>
            ),
          },
          {
            key: "group",
            label: "그룹",
            width: "140px",
            render: (row) => row.vip_groups?.name ?? <span className="text-ink-300">—</span>,
          },
          {
            key: "label",
            label: "라벨",
            hideOnMobile: true,
            render: (row) =>
              row.label ? (
                <span className="line-clamp-1 text-ink-600">{row.label}</span>
              ) : (
                <span className="text-ink-300">—</span>
              ),
          },
          {
            key: "usage",
            label: "사용현황",
            width: "110px",
            align: "center",
            render: (row) => (
              <span className="krw text-ink-600">
                {krw(row.used_count)} / {row.max_uses != null ? krw(row.max_uses) : "무제한"}
              </span>
            ),
          },
          {
            key: "expires_at",
            label: "만료",
            width: "110px",
            render: (row) => {
              if (!row.expires_at) return <span className="text-ink-400">없음</span>;
              const expired = new Date(row.expires_at) < new Date();
              return (
                <span className={expired ? "text-signal-red" : "text-ink-600"}>
                  {formatDate(row.expires_at)}
                </span>
              );
            },
          },
          {
            key: "is_active",
            label: "활성",
            width: "90px",
            align: "center",
            render: (row) => (
              <Toggle
                checked={row.is_active}
                onChange={(next) => toggleActive(row, next)}
                label={undefined}
              />
            ),
          },
          {
            key: "actions",
            label: "관리",
            width: "70px",
            align: "right",
            render: (row) => (
              <button
                type="button"
                onClick={() => setDeleting(row)}
                className="text-sm text-ink-600 transition-colors hover:text-signal-red"
              >
                삭제
              </button>
            ),
          },
        ]}
        rows={pageRows}
        loading={codes === null}
        emptyMessage="아직 만들어진 입장 코드가 없습니다."
        pagination={<Pagination page={page} totalPages={totalPages} onChange={setPage} />}
      />

      {/* 생성 모달 */}
      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title="입장 코드 생성"
        footer={
          <>
            <button type="button" onClick={() => setDraft(null)} className={BTN_GHOST}>
              취소
            </button>
            <button type="button" onClick={saveDraft} disabled={saving} className={BTN_PRIMARY}>
              {saving ? "생성 중…" : "생성"}
            </button>
          </>
        }
      >
        {draft && (
          <div className="divide-y divide-ink-100">
            <FieldRow
              label="코드"
              required
              htmlFor="code-value"
              help="영문 대문자·숫자 4~20자. 자동 생성 코드를 그대로 쓰거나 직접 입력하세요."
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
                  자동 생성
                </button>
              </div>
            </FieldRow>
            <FieldRow label="그룹" required htmlFor="code-group">
              <Select
                id="code-group"
                value={draft.groupId}
                onChange={(e) => setDraft({ ...draft, groupId: e.target.value })}
              >
                <option value="">그룹 선택</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                    {g.discount_rate > 0 ? ` (${g.discount_rate}%)` : ""}
                  </option>
                ))}
              </Select>
            </FieldRow>
            <FieldRow label="라벨" htmlFor="code-label" help="운영 메모 — 어디에 배포한 코드인지 적어두세요.">
              <Input
                id="code-label"
                value={draft.label}
                maxLength={100}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                placeholder="예: 2026 설 선물세트 거래처용"
              />
            </FieldRow>
            <FieldRow label="최대 사용 횟수" htmlFor="code-max" help="비워두면 무제한입니다. 결제 완료 시마다 1회씩 차감됩니다.">
              <Input
                id="code-max"
                type="number"
                min={1}
                value={draft.maxUses}
                onChange={(e) => setDraft({ ...draft, maxUses: e.target.value })}
                placeholder="무제한"
                className="max-w-36"
              />
            </FieldRow>
            <FieldRow label="만료일" htmlFor="code-expires" help="해당 날짜의 자정까지 사용할 수 있습니다. 비워두면 만료 없음.">
              <Input
                id="code-expires"
                type="date"
                value={draft.expiresAt}
                onChange={(e) => setDraft({ ...draft, expiresAt: e.target.value })}
                className="max-w-44"
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
          await api(`/api/admin/vip/codes/${deleting.id}`, { method: "DELETE" });
          await load();
        }}
        title="코드 삭제"
        description={`코드 '${deleting?.code ?? ""}'를 삭제합니다. 이 코드로는 더 이상 VIP 라운지에 입장할 수 없습니다.`}
        confirmLabel="삭제"
        danger
      />
    </div>
  );
}
