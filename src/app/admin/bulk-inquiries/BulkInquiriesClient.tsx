"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import DataTable, { type DataTableColumn } from "@/components/admin/DataTable";
import Tabs from "@/components/admin/Tabs";
import SearchInput from "@/components/admin/SearchInput";
import { formatDateTime, formatPhone } from "@/lib/format";
import { BULK_INQUIRY_PURPOSE_LABELS, BULK_INQUIRY_STATUS_LABELS } from "@/lib/constants";
import type { BulkInquiryStatus } from "@/lib/types";
import InquiryDetailModal from "./InquiryDetailModal";
import {
  itemsSummary,
  STATUS_MEANINGS,
  STATUS_ORDER,
  StatusPill,
  type AdminBulkInquiry,
} from "./inquiry-ui";

/* ============================================================
   업소용·OEM 견적 문의함

   화면 규칙 두 가지가 여기서 지켜져야 한다.
   1) 관심 품목을 상품 주소(konjac-rice-500g)가 아니라 상품명으로 보여준다 —
      서버가 이름으로 바꿔 내려주고, 목록은 '곤약밥 500g 외 2건' 으로 줄여 적는다.
   2) 안내문에 개발자용 경로(/b2b)를 코드 서체로 박아 두지 않는다.
      대신 고객이 실제로 보는 문의 화면을 새 탭으로 열어 확인할 수 있게 한다.
   ============================================================ */

export default function BulkInquiriesClient() {
  const [rows, setRows] = useState<AdminBulkInquiry[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 로딩 표시는 필터를 바꾸는 이벤트 핸들러에서 켜고, 여기서는 끄기만 한다.
  // (effect 안에서 동기적으로 setState 하면 연쇄 렌더가 된다 — ReviewsClient 와 같은 방식)
  const load = useCallback(async () => {
    const sp = new URLSearchParams({ status: tab });
    if (q.trim()) sp.set("q", q.trim());
    try {
      // try/catch 블록 대신 promise 의 catch 를 쓴다 — 동기 구간에서 setState 가 일어나면
      // effect 안 연쇄 렌더로 잡히고(React 19 규칙), 실제로 lint 가 막는다.
      const res = await fetch(`/api/admin/bulk-inquiries?${sp}`, { cache: "no-store" }).catch(
        () => null
      );
      if (!res) {
        setLoadError("네트워크 문제로 문의 목록을 불러오지 못했습니다.");
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(json.error ?? "문의 목록을 불러오지 못했습니다.");
        return;
      }
      setLoadError(null);
      setRows(json.inquiries ?? []);
      setCounts(json.counts ?? {});
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

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  const columns: DataTableColumn<AdminBulkInquiry>[] = [
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
            {r.contact_name} · <span className="krw">{formatPhone(r.phone)}</span>
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
      key: "items",
      label: "관심 품목",
      width: "220px",
      render: (r) =>
        r.items.length > 0 ? (
          <span className="line-clamp-1 text-ink-700">{itemsSummary(r.items)}</span>
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
    ...STATUS_ORDER.map((s) => ({
      key: s,
      label: BULK_INQUIRY_STATUS_LABELS[s],
      count: counts[s] ?? 0,
    })),
  ];

  const emptyMessage = q.trim()
    ? "검색 조건에 맞는 문의가 없습니다."
    : tab === "all"
      ? "아직 접수된 문의가 없습니다."
      : `'${BULK_INQUIRY_STATUS_LABELS[tab as BulkInquiryStatus]}' 상태인 문의가 없습니다.`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-ink-700">
            고객이 스토어의 업소용·OEM 문의 화면에서 남긴 견적 문의가 여기로 모입니다.
          </p>
          <a
            href="/b2b"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 inline-flex items-center gap-1 text-[13px] text-forest-700 transition-colors hover:text-forest-900"
          >
            고객이 보는 문의 화면 열기
            <ArrowUpRight size={14} strokeWidth={1.5} />
          </a>
        </div>
        <SearchInput
          value={q}
          onChange={changeQuery}
          placeholder="회사명·담당자·이메일"
          className="w-full sm:w-72"
        />
      </div>

      <div>
        <Tabs tabs={tabs} active={tab} onChange={changeTab} />
        {tab !== "all" && (
          <p className="mt-3 text-xs leading-relaxed text-ink-500">
            {STATUS_MEANINGS[tab as BulkInquiryStatus]}
          </p>
        )}
      </div>

      {loadError && (
        <p role="alert" className="border border-signal-red/40 bg-signal-red/5 px-4 py-3 text-sm text-signal-red">
          {loadError}
        </p>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        onRowClick={(r) => setSelectedId(r.id)}
        emptyMessage={emptyMessage}
      />

      {selected && (
        <InquiryDetailModal
          key={selected.id}
          inquiry={selected}
          onClose={() => setSelectedId(null)}
          onUpdated={(next) => {
            setRows((prev) => prev.map((r) => (r.id === next.id ? next : r)));
            void load();
          }}
          onDeleted={() => {
            setSelectedId(null);
            void load();
          }}
        />
      )}
    </div>
  );
}
