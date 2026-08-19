"use client";

import { useCallback, useEffect, useState } from "react";
import DataTable, { type DataTableColumn } from "@/components/admin/DataTable";
import Modal from "@/components/admin/Modal";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { FieldRow, Input, Textarea, Toggle, Help } from "@/components/admin/Field";
// 고객이 보게 될 모습을 그대로 보여 주려고 고객 화면 컴포넌트를 읽기 전용으로 가져다 쓴다.
// (고객 화면 코드는 손대지 않는다 — 미리보기가 실물과 갈라지면 미리보기의 뜻이 없다)
import Accordion, { type AccordionItem } from "@/components/about/Accordion";
import { formatDate } from "@/lib/format";
import { TOGGLE_LABELS } from "@/lib/admin-labels";
import type { Notice } from "@/lib/types";
import { EditModalFooter, requestJson, StorefrontLink } from "./shared";
import EmptyHint from "./_components/EmptyHint";

interface NoticeForm {
  title: string;
  content: string;
  is_pinned: boolean;
  is_active: boolean;
}

const EMPTY_FORM: NoticeForm = {
  title: "",
  content: "",
  is_pinned: false,
  is_active: true,
};

/**
 * 공지 관리.
 *
 * 고객 화면(src/app/(shop)/support/page.tsx:205-211)은 공지를 고객센터 아코디언
 * 안에 **접힌 채로** 넣고, 본문은 whitespace-pre-line 평문으로 그린다.
 * 즉 굵게·목록·링크 같은 서식은 애초에 지원되지 않는다 — 마크다운 기호를 쓰면
 * 그 기호가 그대로 고객에게 보인다(상세페이지에서 났던 사고와 같은 종류다).
 * 그래서 서식 도구를 붙이는 대신, 실제로 지원되는 것(줄바꿈)만 알려 주고
 * 고객이 볼 모습 그대로를 미리보기로 붙였다.
 */
export default function NoticesTab() {
  const [rows, setRows] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Notice | null>(null);
  const [form, setForm] = useState<NoticeForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Notice | null>(null);

  const load = useCallback(async () => {
    try {
      const body = await requestJson<{ notices: Notice[] }>("/api/admin/content/notices", {
        cache: "no-store",
      });
      setRows(body.notices);
    } catch {
      // 목록 로드 실패 시 빈 상태 유지
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 데이터 로드 — setState는 모두 fetch 완료(await) 이후에만 실행된다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(n: Notice) {
    setEditing(n);
    setForm({
      title: n.title,
      content: n.content,
      is_pinned: n.is_pinned,
      is_active: n.is_active,
    });
    setFormError(null);
    setModalOpen(true);
  }

  async function save() {
    if (!form.title.trim()) {
      setFormError("제목을 입력해 주세요.");
      return;
    }
    if (!form.content.trim()) {
      setFormError("내용을 입력해 주세요.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await requestJson(
        editing ? `/api/admin/content/notices/${editing.id}` : "/api/admin/content/notices",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }
      );
      setModalOpen(false);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(n: Notice, next: boolean) {
    setRows((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_active: next } : x)));
    try {
      await requestJson(`/api/admin/content/notices/${n.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: next }),
      });
    } catch {
      setRows((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_active: !next } : x)));
    }
  }

  async function remove() {
    if (!deleting) return;
    await requestJson(`/api/admin/content/notices/${deleting.id}`, { method: "DELETE" });
    setDeleting(null);
    setModalOpen(false);
    await load();
  }

  // 미리보기는 고객 화면과 같은 부품·같은 구조로 만든다 (support/page.tsx 의 noticeItems 와 동일)
  const previewItems: AccordionItem[] = [
    {
      id: "preview",
      overline: form.is_pinned ? "고정" : "공지",
      title: form.title || "제목을 입력하면 여기에 보입니다",
      meta: formatDate(editing?.created_at ?? new Date()),
      content: (
        <div className="whitespace-pre-line">
          {form.content || "내용을 입력하면 여기에 그대로 보입니다."}
        </div>
      ),
    },
  ];

  const columns: DataTableColumn<Notice>[] = [
    {
      key: "title",
      label: "제목",
      render: (n) => (
        <span className="flex items-center gap-2">
          {n.is_pinned && (
            <span className="shrink-0 bg-forest-100 px-2 py-0.5 text-[11px] text-forest-800">
              맨 위 고정
            </span>
          )}
          <span className="truncate font-medium text-ink-900">{n.title}</span>
        </span>
      ),
    },
    {
      key: "content",
      label: "내용",
      hideOnMobile: true,
      render: (n) => <span className="line-clamp-1 max-w-md text-ink-500">{n.content}</span>,
    },
    {
      key: "created_at",
      label: "작성일",
      align: "center",
      width: "110px",
      render: (n) => formatDate(n.created_at),
    },
    {
      key: "is_active",
      label: TOGGLE_LABELS.switch,
      align: "center",
      width: "90px",
      render: (n) => (
        <span onClick={(e) => e.stopPropagation()}>
          <Toggle checked={n.is_active} onChange={(next) => toggleActive(n, next)} />
        </span>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-500">
          공지는 <b className="text-ink-900">고객센터 &gt; 공지사항</b>에 제목만 보이게 접힌 채로
          쌓입니다. 고객이 제목을 눌러야 내용이 펼쳐집니다.{" "}
          <StorefrontLink href="/support#notices">고객 화면 보기</StorefrontLink>
        </p>
        {rows.length > 0 && (
          <button
            type="button"
            onClick={openCreate}
            className="bg-forest-700 px-4 py-2.5 text-sm text-cream-50 transition-colors hover:bg-forest-800"
          >
            새 공지 쓰기
          </button>
        )}
      </div>

      {!loading && rows.length === 0 ? (
        <EmptyHint
          title="아직 올린 공지가 없습니다."
          description="배송 일정이나 휴무처럼 모든 고객에게 알려야 할 내용을 올립니다. 고객센터 페이지 맨 위에 쌓입니다."
          actionLabel="첫 공지 쓰기"
          onAction={openCreate}
          extra={<StorefrontLink href="/support#notices">지금 고객센터 화면 보기</StorefrontLink>}
        />
      ) : (
        <DataTable<Notice>
          columns={columns}
          rows={rows}
          loading={loading}
          emptyMessage="등록된 공지가 없습니다."
          onRowClick={openEdit}
        />
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "공지 수정" : "새 공지"}
        size="lg"
        footer={
          <EditModalFooter
            editing={editing !== null}
            saving={saving}
            onDelete={() => setDeleting(editing)}
            onCancel={() => setModalOpen(false)}
            onSave={save}
          />
        }
      >
        <div className="divide-y divide-ink-100">
          <FieldRow
            label="제목"
            required
            htmlFor="notice-title"
            help="고객센터 목록에는 이 제목만 보입니다. 무슨 내용인지 제목에서 알 수 있게 적어 주세요."
          >
            <Input
              id="notice-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="설 연휴 배송 일정 안내"
            />
          </FieldRow>
          <FieldRow label="내용" required htmlFor="notice-content">
            <Textarea
              id="notice-content"
              rows={8}
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
            />
            <Help>
              굵게·목록·링크 같은 서식은 고객 화면이 지원하지 않습니다. 별표(*)나 우물정(#) 같은
              기호를 쓰면 그 기호가 고객에게 그대로 보입니다. 엔터로 줄만 나누어 주세요.
            </Help>
          </FieldRow>
          <FieldRow
            label="맨 위 고정"
            help="켜면 다른 공지보다 위에 놓이고 제목 옆에 '고정' 표시가 붙습니다."
          >
            <Toggle
              checked={form.is_pinned}
              onChange={(v) => setForm({ ...form, is_pinned: v })}
              label={form.is_pinned ? "맨 위에 고정" : "고정 안 함"}
            />
          </FieldRow>
          <FieldRow label={TOGGLE_LABELS.switch} help="끄면 고객센터에서 사라집니다.">
            <Toggle
              checked={form.is_active}
              onChange={(v) => setForm({ ...form, is_active: v })}
              label={form.is_active ? TOGGLE_LABELS.on : TOGGLE_LABELS.off}
            />
          </FieldRow>
        </div>

        <div className="mt-5 border border-ink-200 bg-cream-50 px-4 py-3">
          <p className="text-[10px] tracking-[0.18em] text-ink-400">
            고객센터에서 이렇게 보입니다 (제목을 눌러 펼쳐 보세요)
          </p>
          <div className="mt-2">
            <Accordion items={previewItems} />
          </div>
        </div>

        {formError && <Help tone="error">{formError}</Help>}
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        title="공지 삭제"
        description={`"${deleting?.title ?? ""}" 공지를 삭제합니다. 복구할 수 없습니다. 계속하시겠습니까?`}
        confirmLabel="삭제"
        danger
      />
    </div>
  );
}
