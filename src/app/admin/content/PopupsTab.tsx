"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ChevronUp, ChevronDown } from "lucide-react";
import DataTable, { type DataTableColumn } from "@/components/admin/DataTable";
import Modal from "@/components/admin/Modal";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { Toggle, Help } from "@/components/admin/Field";
import { TOGGLE_LABELS } from "@/lib/admin-labels";
import type { Popup } from "@/lib/types";
import {
  isoToKstDate,
  dateToStartIso,
  dateToEndIso,
  EditModalFooter,
  periodLabel,
  requestJson,
  StorefrontLink,
} from "./shared";
import PopupForm, {
  EMPTY_POPUP_FORM,
  POSITION_LABELS,
  type PopupFormState,
} from "./_components/PopupForm";
import ExposureBadge, { exposureState, type ExposureState } from "./_components/ExposureBadge";
import SavedExposureNotice from "./_components/SavedExposureNotice";
import EmptyHint from "./_components/EmptyHint";
import { linkBlockingError } from "./_components/LinkPicker";
import { periodBlockingError } from "./_components/PeriodField";
import { describeLink } from "./_components/link-targets";
import { useLinkTargets } from "./_components/useLinkTargets";

/**
 * 홈 팝업 관리.
 *
 * 배너와 같은 함정이 있다 — 켜 둔 팝업이 여러 개여도 홈에는 기간이 유효한
 * **첫 한 건만** 뜬다(src/app/(shop)/page.tsx:86-87). 순서 숫자를 손으로 넣던
 * 자리를 위·아래 버튼으로 바꾸고, 실제로 뜨는 한 건에 배지를 단다.
 */
export default function PopupsTab() {
  const [rows, setRows] = useState<Popup[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Popup | null>(null);
  const [form, setForm] = useState<PopupFormState>(EMPTY_POPUP_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Popup | null>(null);
  // 방금 저장한 행의 id. 불리언이던 것을 id 로 바꾼 이유 —
  // "저장했다" 와 "그래서 고객에게 뜬다" 는 다른 말이고, 후자는 그 행의 상태를 봐야 안다.
  const [savedId, setSavedId] = useState<string | null>(null);

  const { targets, loading: targetsLoading } = useLinkTargets();

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

  /** 스토어프론트와 같은 순서(sort_order 오름차순)로 훑는다 */
  const ordered = useMemo(
    () =>
      [...rows].sort((a, b) =>
        a.sort_order !== b.sort_order
          ? a.sort_order - b.sort_order
          : a.created_at < b.created_at
            ? 1
            : -1
      ),
    [rows]
  );

  const states = useMemo(() => {
    const now = new Date();
    const map = new Map<string, ExposureState>();
    let taken = false;
    for (const row of ordered) {
      const state = exposureState(
        { is_active: row.is_active, starts_at: row.starts_at, ends_at: row.ends_at },
        taken,
        now
      );
      if (state === "live") taken = true;
      map.set(row.id, state);
    }
    return map;
  }, [ordered]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_POPUP_FORM);
    setFormError(null);
    setSavedId(null);
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
      is_active: p.is_active,
    });
    setFormError(null);
    setSavedId(null);
    setModalOpen(true);
  }

  function validate(): string | null {
    if (!form.title.trim()) return "제목을 입력해 주세요.";
    if (!form.image_url && !form.content.trim()) {
      return "사진이나 본문 중 하나는 있어야 고객에게 보여 줄 것이 생깁니다.";
    }
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
      const body = await requestJson<{ popup: Popup }>(
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
            // 순서는 목록의 위·아래 버튼이 매긴다. 새 팝업은 맨 뒤로 붙인다.
            sort_order: editing ? undefined : rows.length,
            is_active: form.is_active,
          }),
        }
      );
      setModalOpen(false);
      setSavedId(body.popup.id);
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

  /** 위·아래로 옮기기 — 저장하며 0..n-1 로 다시 매겨 같은 번호가 겹치지 않게 한다 */
  async function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= ordered.length) return;
    const next = [...ordered];
    [next[index], next[target]] = [next[target], next[index]];
    setRows((prev) =>
      prev.map((row) => {
        const at = next.findIndex((r) => r.id === row.id);
        return at >= 0 ? { ...row, sort_order: at } : row;
      })
    );
    for (const [at, row] of next.entries()) {
      if (row.sort_order === at) continue;
      await requestJson(`/api/admin/content/popups/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sort_order: at }),
      }).catch(() => null);
    }
    await load();
  }

  async function remove() {
    if (!deleting) return;
    await requestJson(`/api/admin/content/popups/${deleting.id}`, { method: "DELETE" });
    setDeleting(null);
    setModalOpen(false);
    await load();
  }

  // 대기 안내에서 "무엇에 밀려 대기인지" 를 이름으로 짚어 준다
  const liveTitle = ordered.find((r) => states.get(r.id) === "live")?.title ?? null;

  const columns: DataTableColumn<Popup>[] = [
    {
      key: "title",
      label: "팝업",
      render: (p) => (
        <span className="flex items-center gap-3">
          <span className="relative hidden h-12 w-16 shrink-0 overflow-hidden border border-ink-200 bg-cream-100 md:block">
            {p.image_url && (
              <Image src={p.image_url} alt="" fill sizes="64px" className="object-cover" />
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium text-ink-900">{p.title}</span>
            <span className="block truncate text-xs text-ink-400">
              {describeLink(p.link_url ?? "", targets)
                ? `누르면 ${describeLink(p.link_url ?? "", targets)}로 이동`
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
      width: "110px",
      render: (p) => <ExposureBadge state={states.get(p.id) ?? "hidden"} />,
    },
    {
      key: "position",
      label: "뜨는 자리",
      align: "center",
      width: "120px",
      hideOnMobile: true,
      render: (p) => POSITION_LABELS[p.position] ?? "화면 가운데",
    },
    {
      key: "period",
      label: "노출 기간",
      hideOnMobile: true,
      width: "180px",
      render: (p) => periodLabel(p.starts_at, p.ends_at),
    },
    {
      key: "order",
      label: "순서",
      align: "center",
      width: "90px",
      hideOnMobile: true,
      render: (p) => {
        const index = ordered.findIndex((r) => r.id === p.id);
        return (
          <span className="inline-flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              aria-label="위로 올리기"
              disabled={index <= 0}
              onClick={() => void move(index, -1)}
              className="border border-ink-200 p-1 text-ink-600 transition-colors hover:border-forest-600 hover:text-forest-700 disabled:opacity-30"
            >
              <ChevronUp size={13} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              aria-label="아래로 내리기"
              disabled={index === ordered.length - 1}
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
      render: (p) => (
        <span onClick={(e) => e.stopPropagation()}>
          <Toggle checked={p.is_active} onChange={(next) => toggleActive(p, next)} />
        </span>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-500">
          홈에 들어온 고객에게 한 번 띄우는 알림창입니다. 켜 둔 것 중{" "}
          <b className="text-ink-900">맨 위 하나만</b> 뜹니다.{" "}
          <StorefrontLink href="/">홈 화면 확인하기</StorefrontLink>
        </p>
        {rows.length > 0 && (
          <button
            type="button"
            onClick={openCreate}
            className="bg-forest-700 px-4 py-2.5 text-sm text-cream-50 transition-colors hover:bg-forest-800"
          >
            새 팝업 만들기
          </button>
        )}
      </div>

      {savedId && (
        <SavedExposureNotice
          kind="팝업"
          state={states.get(savedId) ?? null}
          blockedBy={liveTitle}
          extra="팝업은 한 번 닫으면 그 브라우저에서 24시간 동안 다시 뜨지 않습니다."
        />
      )}

      {!loading && rows.length === 0 ? (
        <EmptyHint
          title="아직 만든 팝업이 없습니다."
          description="배송 지연이나 이벤트처럼 꼭 알려야 할 일이 있을 때 홈에 들어온 고객에게 한 번 띄웁니다."
          actionLabel="첫 팝업 만들기"
          onAction={openCreate}
          extra={<StorefrontLink href="/">지금 홈 화면 보기</StorefrontLink>}
        />
      ) : (
        <DataTable<Popup>
          columns={columns}
          rows={ordered}
          loading={loading}
          emptyMessage="등록된 팝업이 없습니다."
          onRowClick={openEdit}
        />
      )}

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
        <PopupForm
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
        title="팝업 삭제"
        description={`"${deleting?.title ?? ""}" 팝업을 삭제합니다. 복구할 수 없습니다. 계속하시겠습니까?`}
        confirmLabel="삭제"
        danger
      />
    </div>
  );
}
