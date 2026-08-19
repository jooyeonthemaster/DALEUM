"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ChevronUp, ChevronDown } from "lucide-react";
import DataTable, { type DataTableColumn } from "@/components/admin/DataTable";
import Modal from "@/components/admin/Modal";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { Toggle, Help } from "@/components/admin/Field";
import { TOGGLE_LABELS } from "@/lib/admin-labels";
import type { Banner } from "@/lib/types";
import {
  isoToKstDate,
  dateToStartIso,
  dateToEndIso,
  EditModalFooter,
  periodLabel,
  requestJson,
  StorefrontLink,
} from "./shared";
import BannerForm, {
  EMPTY_BANNER_FORM,
  PLACEMENT_LABELS,
  RENDERED_PLACEMENT,
  type BannerFormState,
} from "./_components/BannerForm";
import ExposureBadge from "./_components/ExposureBadge";
import { orderBanners, bannerStates } from "./_components/banner-rows";
import SavedExposureNotice from "./_components/SavedExposureNotice";
import EmptyHint from "./_components/EmptyHint";
import { linkBlockingError } from "./_components/LinkPicker";
import { periodBlockingError } from "./_components/PeriodField";
import { describeLink } from "./_components/link-targets";
import { useLinkTargets } from "./_components/useLinkTargets";

/**
 * 홈 대문 배너 관리.
 *
 * 목록의 핵심은 "지금 무엇이 나가고 있는가" 다. 스토어프론트는 활성 배너 중
 * 사진이 있고 기간이 유효한 **첫 한 건만** 홈에 올린다(src/app/(shop)/page.tsx:64-67).
 * 예전 목록에는 켜짐 스위치와 순서 숫자만 있어서, 세 개를 켜 두면 세 개가 도는 줄
 * 알기 쉬웠다. 그래서 실제로 나가는 한 건에 배지를 달고 나머지는 이유를 말해 준다.
 */
export default function BannersTab() {
  const [rows, setRows] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Banner | null>(null);
  const [form, setForm] = useState<BannerFormState>(EMPTY_BANNER_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Banner | null>(null);
  // 방금 저장한 행의 id. 불리언이던 것을 id 로 바꾼 이유 —
  // "저장했다" 와 "그래서 고객에게 나간다" 는 다른 말이고, 후자는 그 행의 상태를 봐야 안다.
  const [savedId, setSavedId] = useState<string | null>(null);

  const { targets, loading: targetsLoading } = useLinkTargets();

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

  // 정렬·상태 판정은 banner-rows.ts 로 옮겼다 — 스토어프론트와 같은 순서여야 한다는 사실이
  // 화면 코드 한가운데 묻혀 있으면 다음 사람이 그것을 모르고 손댄다
  const ordered = useMemo(() => orderBanners(rows), [rows]);
  const states = useMemo(() => bannerStates(ordered, new Date()), [ordered]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_BANNER_FORM);
    setFormError(null);
    setSavedId(null);
    setModalOpen(true);
  }

  function openEdit(b: Banner) {
    setEditing(b);
    setForm({
      title: b.title,
      subtitle: b.subtitle ?? "",
      placement: b.placement,
      image_url: b.image_url ?? "",
      link_url: b.link_url ?? "",
      starts_at: isoToKstDate(b.starts_at),
      ends_at: isoToKstDate(b.ends_at),
      is_active: b.is_active,
    });
    setFormError(null);
    setSavedId(null);
    setModalOpen(true);
  }

  /** 저장 전에 화면에서 막는다 — 서버까지 갔다가 거절당하면 무엇이 문제인지 흐려진다 */
  function validate(): string | null {
    if (!form.title.trim()) return "큰 제목을 입력해 주세요.";
    if (!form.image_url) return "배경 사진을 올려 주세요. 사진이 없으면 홈에 나가지 않습니다.";
    return linkBlockingError(form.link_url) ?? periodBlockingError(form.starts_at, form.ends_at);
  }

  async function save() {
    const invalid = validate();
    if (invalid) {
      setFormError(invalid);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const body = await requestJson<{ banner: Banner }>(
        editing ? `/api/admin/content/banners/${editing.id}` : "/api/admin/content/banners",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: form.title,
            subtitle: form.subtitle,
            placement: form.placement,
            image_url: form.image_url,
            link_url: form.link_url,
            starts_at: dateToStartIso(form.starts_at),
            ends_at: dateToEndIso(form.ends_at),
            // 순서는 목록의 위·아래 버튼이 매긴다. 새 배너는 맨 뒤로 붙인다.
            sort_order: editing ? undefined : rows.length,
            is_active: form.is_active,
          }),
        }
      );
      setModalOpen(false);
      setSavedId(body.banner.id);
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

  /**
   * 위·아래로 옮기기. 저장할 때 0..n-1 로 다시 매긴다 —
   * 예전처럼 숫자를 손으로 넣으면 0이 여럿 생겨 어느 것이 먼저인지 아무도 몰랐다.
   */
  async function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    const list = ordered.filter((r) => r.placement === RENDERED_PLACEMENT);
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    setRows((prev) =>
      prev.map((row) => {
        const at = next.findIndex((r) => r.id === row.id);
        return at >= 0 ? { ...row, sort_order: at } : row;
      })
    );
    for (const [at, row] of next.entries()) {
      if (row.sort_order === at) continue;
      await requestJson(`/api/admin/content/banners/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sort_order: at }),
      }).catch(() => null);
    }
    await load();
  }

  async function remove() {
    if (!deleting) return;
    await requestJson(`/api/admin/content/banners/${deleting.id}`, { method: "DELETE" });
    setDeleting(null);
    setModalOpen(false);
    await load();
  }

  const heroRows = ordered.filter((r) => r.placement === RENDERED_PLACEMENT);
  // 대기 안내에서 "무엇에 밀려 대기인지" 를 이름으로 짚어 준다. 제목의 줄바꿈은 한 줄로 편다.
  const liveTitle =
    ordered.find((r) => states.get(r.id) === "live")?.title.split("\n").join(" ") ?? null;

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
            <span className="block truncate font-medium text-ink-900">
              {b.title.split("\n").join(" ")}
            </span>
            <span className="block truncate text-xs text-ink-400">
              {describeLink(b.link_url ?? "", targets)
                ? `누르면 ${describeLink(b.link_url ?? "", targets)}로 이동`
                : "눌러도 이동하지 않음"}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: "state",
      label: "지금 상태",
      align: "center",
      width: "120px",
      render: (b) =>
        b.placement === RENDERED_PLACEMENT ? (
          <ExposureBadge state={states.get(b.id) ?? "hidden"} />
        ) : (
          <span className="text-[11px] text-signal-red">
            {PLACEMENT_LABELS[b.placement]} · 표시 안 됨
          </span>
        ),
    },
    {
      key: "period",
      label: "노출 기간",
      hideOnMobile: true,
      width: "180px",
      render: (b) => periodLabel(b.starts_at, b.ends_at),
    },
    {
      key: "order",
      label: "순서",
      align: "center",
      width: "90px",
      hideOnMobile: true,
      render: (b) => {
        const index = heroRows.findIndex((r) => r.id === b.id);
        if (index < 0) return <span className="text-ink-300">—</span>;
        return (
          <span className="inline-flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              aria-label="위로 올리기"
              disabled={index === 0}
              onClick={() => void move(index, -1)}
              className="border border-ink-200 p-1 text-ink-600 transition-colors hover:border-forest-600 hover:text-forest-700 disabled:opacity-30"
            >
              <ChevronUp size={13} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              aria-label="아래로 내리기"
              disabled={index === heroRows.length - 1}
              onClick={() => void move(index, 1)}
              className="border border-ink-200 p-1 text-ink-600 transition-colors hover:border-forest-600 hover:text-forest-700 disabled:opacity-30"
            >
              <ChevronDown size={13} strokeWidth={1.5} />
            </button>
          </span>
        );
      },
    },
    {
      key: "is_active",
      label: TOGGLE_LABELS.switch,
      align: "center",
      width: "90px",
      render: (b) => (
        <span onClick={(e) => e.stopPropagation()}>
          <Toggle checked={b.is_active} onChange={(next) => toggleActive(b, next)} />
        </span>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-500">
          홈 첫 화면에 깔리는 큰 배너입니다. 켜 둔 것 중 <b className="text-ink-900">맨 위 하나만</b>{" "}
          나갑니다. <StorefrontLink href="/">홈 화면 확인하기</StorefrontLink>
        </p>
        {rows.length > 0 && (
          <button
            type="button"
            onClick={openCreate}
            className="bg-forest-700 px-4 py-2.5 text-sm text-cream-50 transition-colors hover:bg-forest-800"
          >
            새 배너 만들기
          </button>
        )}
      </div>

      {savedId && (
        <SavedExposureNotice
          kind="배너"
          state={states.get(savedId) ?? null}
          blockedBy={liveTitle}
        />
      )}

      {!loading && rows.length === 0 ? (
        <EmptyHint
          title="아직 만든 배너가 없습니다."
          description="배너를 만들면 홈 첫 화면의 큰 사진과 문구가 바뀝니다. 만들지 않으면 기본 화면이 그대로 나갑니다."
          actionLabel="첫 배너 만들기"
          onAction={openCreate}
          extra={<StorefrontLink href="/">지금 홈 화면 보기</StorefrontLink>}
        />
      ) : (
        <DataTable<Banner>
          columns={columns}
          rows={ordered}
          loading={loading}
          emptyMessage="등록된 배너가 없습니다."
          onRowClick={openEdit}
        />
      )}

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
        <BannerForm
          form={form}
          onChange={setForm}
          targets={targets}
          targetsLoading={targetsLoading}
        />
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
