"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import DataTable, { type DataTableColumn } from "@/components/admin/DataTable";
import Modal from "@/components/admin/Modal";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import ImageUploader from "@/components/admin/ImageUploader";
import { FieldRow, Input, Select, Textarea, Toggle, Help } from "@/components/admin/Field";
import type { Popup } from "@/lib/types";
import {
  isoToKstDate,
  dateToStartIso,
  dateToEndIso,
  PeriodInputs,
  EditModalFooter,
  periodLabel,
  requestJson,
} from "./shared";

const POSITION_LABELS: Record<Popup["position"], string> = {
  center: "중앙",
  "bottom-left": "좌측 하단",
  bottom: "하단",
};

interface PopupForm {
  title: string;
  image_url: string;
  content: string;
  link_url: string;
  position: Popup["position"];
  starts_at: string;
  ends_at: string;
  sort_order: string;
  is_active: boolean;
}

const EMPTY_FORM: PopupForm = {
  title: "",
  image_url: "",
  content: "",
  link_url: "",
  position: "center",
  starts_at: "",
  ends_at: "",
  sort_order: "0",
  is_active: true,
};

export default function PopupsTab() {
  const [rows, setRows] = useState<Popup[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Popup | null>(null);
  const [form, setForm] = useState<PopupForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Popup | null>(null);

  const load = useCallback(async () => {
    try {
      const body = await requestJson<{ popups: Popup[] }>("/api/admin/content/popups", {
        cache: "no-store",
      });
      setRows(body.popups);
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

  function openEdit(p: Popup) {
    setEditing(p);
    setForm({
      title: p.title,
      image_url: p.image_url ?? "",
      content: p.content ?? "",
      link_url: p.link_url ?? "",
      position: p.position,
      starts_at: isoToKstDate(p.starts_at),
      ends_at: isoToKstDate(p.ends_at),
      sort_order: String(p.sort_order),
      is_active: p.is_active,
    });
    setFormError(null);
    setModalOpen(true);
  }

  async function save() {
    setSaving(true);
    setFormError(null);
    try {
      await requestJson(
        editing ? `/api/admin/content/popups/${editing.id}` : "/api/admin/content/popups",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: form.title,
            image_url: form.image_url,
            content: form.content,
            link_url: form.link_url,
            position: form.position,
            starts_at: dateToStartIso(form.starts_at),
            ends_at: dateToEndIso(form.ends_at),
            sort_order: form.sort_order,
            is_active: form.is_active,
          }),
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

  async function toggleActive(p: Popup, next: boolean) {
    setRows((prev) => prev.map((x) => (x.id === p.id ? { ...x, is_active: next } : x)));
    try {
      await requestJson(`/api/admin/content/popups/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: next }),
      });
    } catch {
      setRows((prev) => prev.map((x) => (x.id === p.id ? { ...x, is_active: !next } : x)));
    }
  }

  async function remove() {
    if (!deleting) return;
    await requestJson(`/api/admin/content/popups/${deleting.id}`, { method: "DELETE" });
    setDeleting(null);
    setModalOpen(false);
    await load();
  }

  const columns: DataTableColumn<Popup>[] = [
    {
      key: "title",
      label: "팝업",
      render: (p) => (
        <span className="flex items-center gap-3">
          <span className="relative hidden h-12 w-10 shrink-0 overflow-hidden border border-ink-200 bg-cream-100 md:block">
            {p.image_url && (
              <Image src={p.image_url} alt="" fill sizes="40px" className="object-cover" />
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium text-ink-900">{p.title}</span>
            {p.link_url && <span className="block truncate text-xs text-ink-400">{p.link_url}</span>}
          </span>
        </span>
      ),
    },
    {
      key: "position",
      label: "위치",
      align: "center",
      width: "100px",
      render: (p) => POSITION_LABELS[p.position] ?? p.position,
    },
    {
      key: "period",
      label: "노출 기간",
      hideOnMobile: true,
      width: "190px",
      render: (p) => periodLabel(p.starts_at, p.ends_at),
    },
    { key: "sort_order", label: "순서", align: "center", width: "70px", hideOnMobile: true },
    {
      key: "is_active",
      label: "활성",
      align: "center",
      width: "80px",
      render: (p) => (
        <span onClick={(e) => e.stopPropagation()}>
          <Toggle checked={p.is_active} onChange={(next) => toggleActive(p, next)} />
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
          className="bg-forest-700 px-4 py-2 text-sm text-cream-50 transition-colors hover:bg-forest-800"
        >
          새 팝업
        </button>
      </div>

      <DataTable<Popup>
        columns={columns}
        rows={rows}
        loading={loading}
        emptyMessage="등록된 팝업이 없습니다."
        onRowClick={openEdit}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "팝업 수정" : "새 팝업"}
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
          <FieldRow label="제목" required htmlFor="popup-title">
            <Input
              id="popup-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="추석 배송 안내"
            />
          </FieldRow>
          <FieldRow label="이미지" help="1장만 등록됩니다. 새로 올리면 교체됩니다.">
            <ImageUploader
              value={form.image_url ? [{ url: form.image_url }] : []}
              onChange={(next) => setForm({ ...form, image_url: next[0]?.url ?? "" })}
              bucket="banners"
              prefix="popups"
              multiple={false}
            />
          </FieldRow>
          <FieldRow label="내용" htmlFor="popup-content" help="이미지 없이 텍스트만 노출할 수도 있습니다.">
            <Textarea
              id="popup-content"
              rows={3}
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
            />
          </FieldRow>
          <FieldRow label="링크 URL" htmlFor="popup-link" help="비워 두면 클릭해도 이동하지 않습니다.">
            <Input
              id="popup-link"
              value={form.link_url}
              onChange={(e) => setForm({ ...form, link_url: e.target.value })}
              placeholder="/support"
            />
          </FieldRow>
          <FieldRow label="위치" htmlFor="popup-position">
            <Select
              id="popup-position"
              className="max-w-52"
              value={form.position}
              onChange={(e) => setForm({ ...form, position: e.target.value as Popup["position"] })}
            >
              <option value="center">중앙</option>
              <option value="bottom-left">좌측 하단</option>
              <option value="bottom">하단</option>
            </Select>
          </FieldRow>
          <FieldRow label="노출 기간" help="비워 두면 상시 노출됩니다.">
            <PeriodInputs
              from={form.starts_at}
              to={form.ends_at}
              onChange={({ from, to }) => setForm({ ...form, starts_at: from, ends_at: to })}
            />
          </FieldRow>
          <FieldRow label="순서" htmlFor="popup-sort" help="숫자가 작을수록 먼저 노출됩니다.">
            <Input
              id="popup-sort"
              type="number"
              className="max-w-32"
              value={form.sort_order}
              onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
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
        title="팝업 삭제"
        description={`"${deleting?.title ?? ""}" 팝업을 삭제합니다. 복구할 수 없습니다. 계속하시겠습니까?`}
        confirmLabel="삭제"
        danger
      />
    </div>
  );
}
