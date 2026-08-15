"use client";

import { useCallback, useEffect, useState } from "react";
import DataTable, { type DataTableColumn } from "@/components/admin/DataTable";
import Tabs from "@/components/admin/Tabs";
import Modal from "@/components/admin/Modal";
import SearchInput from "@/components/admin/SearchInput";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { Label, Select, Textarea } from "@/components/admin/Field";
import { formatDateTime } from "@/lib/format";
import {
  BULK_INQUIRY_PURPOSE_LABELS,
  BULK_INQUIRY_STATUS_LABELS,
  BULK_INQUIRY_STATUS_TONES,
} from "@/lib/constants";
import type { BulkInquiry, BulkInquiryStatus } from "@/lib/types";

const STATUSES: BulkInquiryStatus[] = ["new", "contacted", "quoted", "closed", "spam"];

function StatusPill({ status }: { status: BulkInquiryStatus }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${BULK_INQUIRY_STATUS_TONES[status]}`}
    >
      {BULK_INQUIRY_STATUS_LABELS[status]}
    </span>
  );
}

export default function BulkInquiriesClient() {
  const [rows, setRows] = useState<BulkInquiry[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");

  const [selected, setSelected] = useState<BulkInquiry | null>(null);
  const [status, setStatus] = useState<BulkInquiryStatus>("new");
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // 로딩 표시는 필터를 바꾸는 이벤트 핸들러에서 켜고, 여기서는 끄기만 한다.
  // (effect 안에서 동기적으로 setState 하면 연쇄 렌더가 된다 — ReviewsClient 와 같은 방식)
  const load = useCallback(async () => {
    try {
      const sp = new URLSearchParams({ status: tab });
      if (q.trim()) sp.set("q", q.trim());
      const res = await fetch(`/api/admin/bulk-inquiries?${sp}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) {
        setRows(json.inquiries ?? []);
        setCounts(json.counts ?? {});
      }
    } finally {
      setLoading(false);
    }
  }, [tab, q]);

  useEffect(() => {
    void load();
  }, [load]);

  function changeTab(key: string) {
    setLoading(true);
    setTab(key);
  }

  function changeQuery(value: string) {
    setLoading(true);
    setQ(value);
  }

  function open(row: BulkInquiry) {
    setSelected(row);
    setStatus(row.status);
    setMemo(row.admin_memo ?? "");
    setModalError(null);
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    setModalError(null);
    try {
      const res = await fetch(`/api/admin/bulk-inquiries/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, admin_memo: memo }),
      });
      const json = await res.json();
      if (!res.ok) {
        setModalError(json.error ?? "저장하지 못했습니다.");
        return;
      }
      setSelected(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/bulk-inquiries/${selected.id}`, { method: "DELETE" });
      if (res.ok) {
        setConfirmDelete(false);
        setSelected(null);
        await load();
      }
    } finally {
      setSaving(false);
    }
  }

  const columns: DataTableColumn<BulkInquiry>[] = [
    {
      key: "created_at",
      label: "접수일",
      width: "150px",
      render: (r) => <span className="krw text-ink-500">{formatDateTime(r.created_at)}</span>,
    },
    {
      key: "company",
      label: "회사",
      render: (r) => (
        <div>
          <p className="font-medium text-ink-900">{r.company}</p>
          <p className="text-xs text-ink-500">
            {r.contact_name} · {r.phone}
          </p>
        </div>
      ),
    },
    {
      key: "purpose",
      label: "유형",
      width: "130px",
      hideOnMobile: true,
      render: (r) => (r.purpose ? BULK_INQUIRY_PURPOSE_LABELS[r.purpose] : "—"),
    },
    {
      key: "product_slugs",
      label: "관심 품목",
      width: "110px",
      align: "center",
      hideOnMobile: true,
      render: (r) =>
        r.product_slugs.length > 0 ? (
          <span className="krw text-ink-600">{r.product_slugs.length}개</span>
        ) : (
          <span className="text-ink-300">—</span>
        ),
    },
    {
      key: "status",
      label: "상태",
      width: "110px",
      align: "center",
      render: (r) => <StatusPill status={r.status} />,
    },
  ];

  const tabs = [
    { key: "all", label: "전체", count: Object.values(counts).reduce((a, b) => a + b, 0) },
    ...STATUSES.map((s) => ({
      key: s,
      label: BULK_INQUIRY_STATUS_LABELS[s],
      count: counts[s] ?? 0,
    })),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-ink-500">
          업소용 벌크·OEM 견적 문의함입니다. 비회원 거래처가 <code className="text-ink-700">/b2b</code> 에서 남긴 문의가 여기로 모입니다.
        </p>
        <SearchInput value={q} onChange={changeQuery} placeholder="회사명·담당자·이메일" />
      </div>

      <Tabs tabs={tabs} active={tab} onChange={changeTab} />

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        onRowClick={open}
        emptyMessage="접수된 문의가 없습니다."
      />

      <Modal
        open={selected != null}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.company} — 견적 문의` : ""}
        size="lg"
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-[13px] text-ink-400 transition-colors hover:text-signal-red"
            >
              삭제
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="border border-ink-200 px-4 py-2.5 text-sm text-ink-700 transition-colors hover:border-ink-400"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="bg-forest-900 px-5 py-2.5 text-sm text-cream-50 transition-colors hover:bg-forest-950 disabled:bg-ink-200 disabled:text-ink-400"
              >
                {saving ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        }
      >
        {selected && (
          <div className="space-y-6">
            <dl className="hairline-t">
              {[
                ["담당자", selected.contact_name],
                ["연락처", selected.phone],
                ["이메일", selected.email],
                ["사업자등록번호", selected.biz_no ?? "—"],
                ["문의 유형", selected.purpose ? BULK_INQUIRY_PURPOSE_LABELS[selected.purpose] : "—"],
                ["예상 물량·주기", selected.volume ?? "—"],
                [
                  "관심 품목",
                  selected.product_slugs.length > 0 ? selected.product_slugs.join(", ") : "—",
                ],
                ["접수일", formatDateTime(selected.created_at)],
              ].map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-baseline justify-between gap-6 border-b border-ink-100 py-2.5"
                >
                  <dt className="shrink-0 text-[13px] text-ink-500">{k}</dt>
                  <dd className="text-right text-[13px] text-ink-900">{v}</dd>
                </div>
              ))}
            </dl>

            <div>
              <Label>문의 내용</Label>
              <p className="whitespace-pre-line border border-ink-200 bg-cream-50 px-4 py-3.5 text-sm leading-relaxed text-ink-800">
                {selected.message}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href={`mailto:${selected.email}?subject=${encodeURIComponent(
                    `[다름] ${selected.company} 견적 문의 회신`
                  )}`}
                  className="border border-ink-200 px-3 py-2 text-[13px] text-ink-700 transition-colors hover:border-ink-400"
                >
                  이메일로 회신
                </a>
                <a
                  href={`tel:${selected.phone.replace(/[^0-9+]/g, "")}`}
                  className="border border-ink-200 px-3 py-2 text-[13px] text-ink-700 transition-colors hover:border-ink-400"
                >
                  전화 걸기
                </a>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[180px_1fr]">
              <div>
                <Label htmlFor="bi-status">처리 상태</Label>
                <Select
                  id="bi-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as BulkInquiryStatus)}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {BULK_INQUIRY_STATUS_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="bi-memo">내부 메모</Label>
                <Textarea
                  id="bi-memo"
                  rows={4}
                  value={memo}
                  maxLength={2000}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="견적 발송 내역, 통화 결과 등"
                />
              </div>
            </div>

            {modalError && (
              <p role="alert" className="text-sm text-signal-red">
                {modalError}
              </p>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title="문의를 삭제할까요?"
        description="삭제하면 되돌릴 수 없습니다. 스팸이라면 상태를 '스팸'으로 바꿔 보관하는 편이 좋습니다."
        confirmLabel="삭제"
        danger
      />
    </div>
  );
}
