"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import DataTable, { type DataTableColumn } from "@/components/admin/DataTable";
import Modal from "@/components/admin/Modal";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import ImageUploader from "@/components/admin/ImageUploader";
import { FieldRow, Input, Select, Toggle, Help } from "@/components/admin/Field";
import type { Banner } from "@/lib/types";
import {
  isoToKstDate,
  dateToStartIso,
  dateToEndIso,
  PeriodInputs,
  EditModalFooter,
  periodLabel,
  requestJson,
} from "./shared";

const PLACEMENT_LABELS: Record<Banner["placement"], string> = {
  hero: "홈 히어로",
  strip: "띠 배너",
  mid: "중간 배너",
  footer: "푸터",
};

interface BannerForm {
  title: string;
  subtitle: string;
  placement: Banner["placement"];
  text_theme: Banner["text_theme"];
  image_url: string;
  link_url: string;
  starts_at: string;
  ends_at: string;
  sort_order: string;
  is_active: boolean;
}

const EMPTY_FORM: BannerForm = {
  title: "",
  subtitle: "",
  placement: "hero",
  text_theme: "dark",
  image_url: "",
  link_url: "",
  starts_at: "",
  ends_at: "",
  sort_order: "0",
  is_active: true,
};

export default function BannersTab() {
  const [rows, setRows] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Banner | null>(null);
  const [form, setForm] = useState<BannerForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Banner | null>(null);

  const load = useCallback(async () => {
    try {
      const body = await requestJson<{ banners: Banner[] }>("/api/admin/content/banners", {
        cache: "no-store",
      });
      setRows(body.banners);
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

  function openEdit(b: Banner) {
    setEditing(b);
    setForm({
      title: b.title,
      subtitle: b.subtitle ?? "",
      placement: b.placement,
      text_theme: b.text_theme,
      image_url: b.image_url ?? "",
      link_url: b.link_url ?? "",
      starts_at: isoToKstDate(b.starts_at),
      ends_at: isoToKstDate(b.ends_at),
      sort_order: String(b.sort_order),
      is_active: b.is_active,
    });
    setFormError(null);
    setModalOpen(true);
  }

  async function save() {
    setSaving(true);
    setFormError(null);
    try {
      await requestJson(
        editing ? `/api/admin/content/banners/${editing.id}` : "/api/admin/content/banners",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: form.title,
            subtitle: form.subtitle,
            placement: form.placement,
            text_theme: form.text_theme,
            image_url: form.image_url,
            link_url: form.link_url,
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

  async function toggleActive(b: Banner, next: boolean) {
    setRows((prev) => prev.map((x) => (x.id === b.id ? { ...x, is_active: next } : x)));
    try {
      await requestJson(`/api/admin/content/banners/${b.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: next }),
      });
    } catch {
      setRows((prev) => prev.map((x) => (x.id === b.id ? { ...x, is_active: !next } : x)));
    }
  }

  async function remove() {
    if (!deleting) return;
    await requestJson(`/api/admin/content/banners/${deleting.id}`, { method: "DELETE" });
    setDeleting(null);
    setModalOpen(false);
    await load();
  }

  const columns: DataTableColumn<Banner>[] = [
    {
      key: "title",
      label: "배너",
      render: (b) => (
        <span className="flex items-center gap-3">
          <span className="relative hidden h-10 w-16 shrink-0 overflow-hidden border border-ink-200 bg-cream-100 md:block">
            {b.image_url && (
              <Image src={b.image_url} alt="" fill sizes="64px" className="object-cover" />
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium text-ink-900">{b.title}</span>
            {b.subtitle && <span className="block truncate text-xs text-ink-400">{b.subtitle}</span>}
          </span>
        </span>
      ),
    },
    {
      key: "placement",
      label: "위치",
      align: "center",
      width: "110px",
      render: (b) => PLACEMENT_LABELS[b.placement] ?? b.placement,
    },
    {
      key: "period",
      label: "노출 기간",
      hideOnMobile: true,
      width: "190px",
      render: (b) => periodLabel(b.starts_at, b.ends_at),
    },
    { key: "sort_order", label: "순서", align: "center", width: "70px", hideOnMobile: true },
    {
      key: "is_active",
      label: "활성",
      align: "center",
      width: "80px",
      render: (b) => (
        <span onClick={(e) => e.stopPropagation()}>
          <Toggle checked={b.is_active} onChange={(next) => toggleActive(b, next)} />
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
          새 배너
        </button>
      </div>

      <DataTable<Banner>
        columns={columns}
        rows={rows}
        loading={loading}
        emptyMessage="등록된 배너가 없습니다."
        onRowClick={openEdit}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "배너 수정" : "새 배너"}
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
          <FieldRow label="제목" required htmlFor="banner-title">
            <Input
              id="banner-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="발효가 완성한 곤약의 식탁"
            />
          </FieldRow>
          <FieldRow label="부제" htmlFor="banner-subtitle">
            <Input
              id="banner-subtitle"
              value={form.subtitle}
              onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
            />
          </FieldRow>
          <FieldRow label="위치" htmlFor="banner-placement">
            <Select
              id="banner-placement"
              className="max-w-52"
              value={form.placement}
              onChange={(e) =>
                setForm({ ...form, placement: e.target.value as Banner["placement"] })
              }
            >
              <option value="hero">홈 히어로</option>
              <option value="strip">띠 배너</option>
              <option value="mid">중간 배너</option>
            </Select>
          </FieldRow>
          <FieldRow
            label="텍스트 테마"
            htmlFor="banner-theme"
            help="이미지 위에 올라갈 글자 색을 정합니다. 밝은 이미지에는 어두운 글자를 쓰세요."
          >
            <Select
              id="banner-theme"
              className="max-w-52"
              value={form.text_theme}
              onChange={(e) =>
                setForm({ ...form, text_theme: e.target.value as Banner["text_theme"] })
              }
            >
              <option value="dark">어두운 글자</option>
              <option value="light">밝은 글자</option>
            </Select>
          </FieldRow>
          <FieldRow label="이미지" help="1장만 등록됩니다. 새로 올리면 교체됩니다.">
            <ImageUploader
              value={form.image_url ? [{ url: form.image_url }] : []}
              onChange={(next) => setForm({ ...form, image_url: next[0]?.url ?? "" })}
              bucket="banners"
              prefix="banners"
              multiple={false}
            />
          </FieldRow>
          <FieldRow label="링크 URL" htmlFor="banner-link" help="비워 두면 클릭해도 이동하지 않습니다.">
            <Input
              id="banner-link"
              value={form.link_url}
              onChange={(e) => setForm({ ...form, link_url: e.target.value })}
              placeholder="/products"
            />
          </FieldRow>
          <FieldRow label="노출 기간" help="비워 두면 상시 노출됩니다.">
            <PeriodInputs
              from={form.starts_at}
              to={form.ends_at}
              onChange={({ from, to }) => setForm({ ...form, starts_at: from, ends_at: to })}
            />
          </FieldRow>
          <FieldRow label="순서" htmlFor="banner-sort" help="숫자가 작을수록 먼저 노출됩니다.">
            <Input
              id="banner-sort"
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
        title="배너 삭제"
        description={`"${deleting?.title ?? ""}" 배너를 삭제합니다. 복구할 수 없습니다. 계속하시겠습니까?`}
        confirmLabel="삭제"
        danger
      />
    </div>
  );
}
