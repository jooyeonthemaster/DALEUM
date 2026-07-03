"use client";

import { useCallback, useEffect, useState } from "react";
import DataTable, { type DataTableColumn } from "@/components/admin/DataTable";
import Modal from "@/components/admin/Modal";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { FieldRow, Input, Textarea, Toggle, Help } from "@/components/admin/Field";
import { formatDate } from "@/lib/format";
import type { Notice } from "@/lib/types";
import { EditModalFooter, requestJson } from "./shared";

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

  const columns: DataTableColumn<Notice>[] = [
    {
      key: "title",
      label: "제목",
      render: (n) => (
        <span className="flex items-center gap-2">
          {n.is_pinned && (
            <span className="shrink-0 bg-forest-100 px-2 py-0.5 text-[11px] text-forest-800">
              고정
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
      label: "활성",
      align: "center",
      width: "80px",
      render: (n) => (
        <span onClick={(e) => e.stopPropagation()}>
          <Toggle checked={n.is_active} onChange={(next) => toggleActive(n, next)} />
        </span>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-4">
        <p className="text-sm text-ink-400 krw">총 {rows.length}개</p>
        <button
          type="button"
          onClick={openCreate}
          className="bg-forest-700 px-4 py-2.5 text-sm text-cream-50 transition-colors hover:bg-forest-800"
        >
          새 공지
        </button>
      </div>

      <DataTable<Notice>
        columns={columns}
        rows={rows}
        loading={loading}
        emptyMessage="등록된 공지가 없습니다."
        onRowClick={openEdit}
      />

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
          <FieldRow label="제목" required htmlFor="notice-title">
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
          </FieldRow>
          <FieldRow label="상단 고정" help="고정된 공지는 목록 맨 위에 노출됩니다.">
            <Toggle
              checked={form.is_pinned}
              onChange={(v) => setForm({ ...form, is_pinned: v })}
              label={form.is_pinned ? "고정됨" : "고정 안 함"}
            />
          </FieldRow>
          <FieldRow label="활성">
            <Toggle
              checked={form.is_active}
              onChange={(v) => setForm({ ...form, is_active: v })}
              label={form.is_active ? "노출 중" : "숨김"}
            />
          </FieldRow>
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
