"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import DataTable from "@/components/admin/DataTable";
import Pagination from "@/components/admin/Pagination";
import { Toggle } from "@/components/admin/Field";
import { TOGGLE_LABELS } from "@/lib/admin-labels";
import { formatDate, krw } from "@/lib/format";
import CodeCreateModal from "./CodeCreateModal";
import NextStepCard from "./NextStepCard";
import {
  api,
  BTN_PRIMARY,
  copyText,
  inviteMessage,
  type CodeRow,
  type GroupRow,
} from "./vipApi";

/* ============================================================
   [입장 코드] 탭 — 코드를 만들어 고객에게 전달한다.

   무엇이 문제였나:
   · 안내문이 "코드를 아는 고객만 /vip 라운지에 입장할 수 있습니다." 였다.
     '/vip' 가 주소의 일부인지 명령어인지 알 수 없어, 문자에 그대로 '/vip' 라고
     적어 보내는 사고가 났다.
   · 코드 복사와 'URL 복사'가 따로 있어 거래처 한 곳에 보내려면 붙여넣기를
     두 번 해야 했다. 결국 '고객한테 뭐라고 보내면 되냐'를 개발자에게 물었다.

   그래서 복사 버튼을 하나로 합치고, 클립보드에 인사말·주소·코드가 다 들어간
   완성된 문장을 넣는다. 화면에는 주소 원문을 글자로 찍지 않는다.
   ============================================================ */

export interface CodesTabProps {
  groups: GroupRow[];
  /** 그룹을 아직 읽는 중이면 true — 읽기 전에 '그룹이 없다'고 단정하면 안내가 깜빡인다 */
  groupsLoading: boolean;
  onGoToGroups: () => void;
  onChanged: () => void | Promise<void>;
}

const PAGE_SIZE = 20;

export default function CodesTab({ groups, groupsLoading, onGoToGroups, onChanged }: CodesTabProps) {
  const [codes, setCodes] = useState<CodeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<CodeRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    return () => {
      clearTimeout(timer);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, [load]);

  function showNotice(message: string) {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 6000);
  }

  /** 고객에게 그대로 붙여넣을 수 있는 안내 문구를 통째로 복사한다 */
  async function copyInvite(row: CodeRow) {
    const ok = await copyText(
      inviteMessage({
        code: row.code,
        groupName: row.vip_groups?.name ?? null,
        expiresAt: row.expires_at,
      })
    );
    if (!ok) {
      showNotice("복사하지 못했습니다. 브라우저가 복사를 막고 있는지 확인해 주세요.");
      return;
    }
    setCopiedId(row.id);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopiedId(null), 1800);
    showNotice(
      `'${row.code}' 안내 문구가 복사되었습니다. 문자·카카오톡에 그대로 붙여넣어 보내세요 — 라운지 주소와 코드가 함께 들어 있습니다.`
    );
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
      showNotice("사용 여부를 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  const hasGroup = groups.length > 0;
  // 그룹을 아직 읽는 중일 때는 아무 단정도 하지 않는다(안내가 깜빡이는 것을 막는다)
  const showEmptyState =
    !groupsLoading && (!hasGroup || (codes !== null && codes.length === 0));

  const totalPages = Math.max(1, Math.ceil((codes?.length ?? 0) / PAGE_SIZE));
  const pageRows = useMemo(
    () => (codes ?? []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [codes, page]
  );

  return (
    <div>
      {/* 이 화면이 무엇을 하는 곳인지 — 코드가 고객에게 어떻게 닿는지 순서로 설명한다 */}
      <div className="mb-5 border border-ink-200 bg-cream-50 p-4">
        <p className="text-sm font-medium text-ink-900">입장 코드는 이렇게 쓰입니다</p>
        <ol className="mt-2 grid gap-1.5 text-sm leading-relaxed text-ink-600 sm:grid-cols-3">
          <li>① 코드를 만들고 그룹에 연결합니다.</li>
          <li>② ‘안내 문구 복사’를 눌러 문자·카카오톡으로 고객에게 보냅니다.</li>
          <li>③ 고객이 VIP 라운지에서 코드를 입력하면 그 그룹의 가격으로 볼 수 있습니다.</li>
        </ol>
        <p className="mt-2 text-xs text-ink-400">
          복사되는 문구에는 라운지 주소와 코드가 함께 들어 있어, 고객은 따로 주소를 물어볼 필요가
          없습니다.
        </p>
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-relaxed text-ink-500">
          코드를 아는 고객만 VIP 라운지에 들어올 수 있습니다.
        </p>
        <button
          type="button"
          onClick={() => setCreating(true)}
          disabled={!hasGroup}
          title={hasGroup ? undefined : "먼저 VIP 그룹을 만들어야 합니다"}
          className={`shrink-0 ${BTN_PRIMARY}`}
        >
          코드 만들기
        </button>
      </div>

      {notice && (
        <p className="mb-4 border border-forest-200 bg-forest-50 px-4 py-2.5 text-sm leading-relaxed text-forest-800">
          {notice}
        </p>
      )}
      {error && <p className="mb-4 text-sm text-signal-red">{error}</p>}

      {showEmptyState ? (
        <NextStepCard
          title={hasGroup ? "아직 만든 입장 코드가 없습니다." : "먼저 VIP 그룹을 만들어야 합니다."}
          description={
            hasGroup
              ? "코드를 하나 만들어 거래처나 단골 고객에게 보내 보세요. 회원 가입 없이도 VIP 가격으로 둘러볼 수 있습니다."
              : "코드는 그룹에 연결되어 그 그룹의 혜택을 열어 줍니다. 연결할 그룹이 없으면 코드를 만들 수 없습니다."
          }
          actionLabel={hasGroup ? "코드 만들기" : "그룹 만들러 가기"}
          onAction={hasGroup ? () => setCreating(true) : onGoToGroups}
        />
      ) : (
        <DataTable<CodeRow>
          columns={[
            {
              key: "code",
              label: "코드",
              width: "150px",
              render: (row) => (
                <span className="krw font-semibold tracking-[0.08em] text-ink-900">{row.code}</span>
              ),
            },
            {
              key: "group",
              label: "연결된 그룹",
              width: "150px",
              render: (row) => row.vip_groups?.name ?? <span className="text-ink-300">—</span>,
            },
            {
              key: "label",
              label: "메모",
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
              label: "사용 횟수",
              width: "110px",
              align: "center",
              render: (row) => (
                <span className="krw text-ink-600">
                  {krw(row.used_count)} / {row.max_uses != null ? krw(row.max_uses) : "제한 없음"}
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
                    {expired && " 종료"}
                  </span>
                );
              },
            },
            {
              key: "is_active",
              label: "사용",
              width: "90px",
              align: "center",
              render: (row) => (
                <Toggle
                  checked={row.is_active}
                  onChange={(next) => toggleActive(row, next)}
                  label={undefined}
                  className={row.is_active ? "" : "opacity-70"}
                />
              ),
            },
            {
              key: "actions",
              label: "관리",
              width: "190px",
              align: "right",
              render: (row) => (
                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => copyInvite(row)}
                    className="inline-flex items-center gap-1.5 text-sm text-forest-700 transition-colors hover:text-forest-800"
                  >
                    {copiedId === row.id ? (
                      <Check size={14} strokeWidth={1.5} />
                    ) : (
                      <Copy size={14} strokeWidth={1.5} />
                    )}
                    안내 문구 복사
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(row)}
                    className="text-sm text-ink-600 transition-colors hover:text-signal-red"
                  >
                    삭제
                  </button>
                </div>
              ),
            },
          ]}
          rows={pageRows}
          loading={codes === null}
          emptyMessage="아직 만든 입장 코드가 없습니다."
          pagination={<Pagination page={page} totalPages={totalPages} onChange={setPage} />}
        />
      )}

      {/* 노출 스위치가 무엇을 뜻하는지 표 아래에 한 줄로 못 박는다 */}
      {!showEmptyState && (
        <p className="mt-3 text-xs text-ink-400">
          ‘사용’을 끄면({TOGGLE_LABELS.off}) 이미 보낸 코드도 더 이상 입장에 쓸 수 없습니다.
        </p>
      )}

      <CodeCreateModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={async () => {
          setCreating(false);
          await load();
          await onChanged();
        }}
        groups={groups}
      />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          await api(`/api/admin/vip/codes/${deleting.id}`, { method: "DELETE" });
          await load();
          await onChanged();
        }}
        title="코드 삭제"
        description={`코드 '${deleting?.code ?? ""}'를 삭제합니다. 이미 이 코드를 받은 고객도 더 이상 VIP 라운지에 들어올 수 없습니다.`}
        confirmLabel="삭제"
        danger
      />
    </div>
  );
}
