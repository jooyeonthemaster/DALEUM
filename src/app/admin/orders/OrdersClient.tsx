"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import DataTable, { type DataTableColumn } from "@/components/admin/DataTable";
import Pagination from "@/components/admin/Pagination";
import StatusChip from "@/components/admin/StatusChip";
import Tabs from "@/components/admin/Tabs";
import SearchInput from "@/components/admin/SearchInput";
import DateRange from "@/components/admin/DateRange";
import { krw, formatDateTime, formatPhone } from "@/lib/format";
import type { OrderStatus, OrdererInfo, RecipientInfo } from "@/lib/types";

/* ============================================================
   관리자 주문 목록 — 상태 탭 / 검색 / 기간 필터 / 엑셀(CJ 양식)
   ============================================================ */

interface OrderRow {
  id: string;
  order_no: string;
  created_at: string;
  status: OrderStatus;
  total: number;
  orderer: OrdererInfo;
  order_items: { name_snapshot: string; qty: number }[];
  shipments: { id: string }[];
}

interface ListResponse {
  orders: OrderRow[];
  total: number;
  totalPages: number;
  counts: Record<string, number>;
}

interface ExportRow {
  order_no: string;
  recipient: RecipientInfo;
  order_items: { name_snapshot: string; option_snapshot: string | null; qty: number }[];
}

const TABS = [
  { key: "all", label: "전체" },
  { key: "paid", label: "결제완료" },
  { key: "preparing", label: "준비중" },
  { key: "shipped", label: "배송중" },
  { key: "delivered", label: "배송완료" },
  { key: "cancelled", label: "취소·환불" },
];

function itemSummary(items: { name_snapshot: string; qty: number }[]): string {
  if (!items || items.length === 0) return "—";
  const first = items[0].name_snapshot;
  return items.length > 1 ? `${first} 외 ${items.length - 1}건` : first;
}

export default function OrdersClient() {
  const router = useRouter();

  const [tab, setTab] = useState("all");
  const [qInput, setQInput] = useState("");
  const [search, setSearch] = useState("");
  const [range, setRange] = useState({ from: "", to: "" });
  const [page, setPage] = useState(1);

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // ---------- 목록 조회 ----------
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ tab, page: String(page) });
        if (search) params.set("q", search);
        if (range.from) params.set("from", range.from);
        if (range.to) params.set("to", range.to);
        const res = await fetch(`/api/admin/orders?${params}`, { signal: controller.signal });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "주문 목록을 불러오지 못했습니다.");
        setData(json as ListResponse);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError(e instanceof Error ? e.message : "주문 목록을 불러오지 못했습니다.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [tab, search, range.from, range.to, page]);

  function resetAnd(fn: () => void) {
    setPage(1);
    fn();
  }

  // ---------- 엑셀 다운로드 (CJ대한통운 대량 등록 양식) ----------
  async function downloadExcel() {
    if (exporting) return;
    setExporting(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (range.from) params.set("from", range.from);
      if (range.to) params.set("to", range.to);
      const res = await fetch(`/api/admin/orders/export?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "발송 대상 조회에 실패했습니다.");

      const rows: ExportRow[] = json.rows ?? [];
      if (rows.length === 0) {
        setError("현재 조건에 내보낼 결제완료·준비중 주문이 없습니다.");
        return;
      }

      const XLSX = await import("xlsx");
      const header = [
        "받는분성명",
        "받는분전화번호",
        "받는분우편번호",
        "받는분주소",
        "배송메세지",
        "내품명",
        "수량",
        "주문번호",
      ];
      const aoa = rows.map((r) => {
        const rec = r.recipient ?? ({} as RecipientInfo);
        const items = r.order_items ?? [];
        const first = items[0];
        const itemName = first
          ? `${first.name_snapshot}${first.option_snapshot ? ` (${first.option_snapshot})` : ""}${
              items.length > 1 ? ` 외 ${items.length - 1}건` : ""
            }`
          : "";
        const totalQty = items.reduce((sum, i) => sum + i.qty, 0);
        return [
          rec.name ?? "",
          formatPhone(rec.phone ?? ""),
          rec.postcode ?? "",
          [rec.address1, rec.address2].filter(Boolean).join(" "),
          rec.memo ?? "",
          itemName,
          totalQty,
          r.order_no,
        ];
      });

      const ws = XLSX.utils.aoa_to_sheet([header, ...aoa]);
      ws["!cols"] = [
        { wch: 10 },
        { wch: 14 },
        { wch: 10 },
        { wch: 44 },
        { wch: 24 },
        { wch: 32 },
        { wch: 6 },
        { wch: 16 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "발송등록");
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      XLSX.writeFile(wb, `daleum-shipping-${stamp}.xlsx`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "엑셀 다운로드에 실패했습니다.");
    } finally {
      setExporting(false);
    }
  }

  // ---------- 테이블 ----------
  const columns: DataTableColumn<OrderRow>[] = [
    {
      key: "order_no",
      label: "주문번호",
      width: "150px",
      render: (o) => <span className="krw font-medium">{o.order_no}</span>,
    },
    {
      key: "created_at",
      label: "일시",
      width: "140px",
      hideOnMobile: true,
      render: (o) => <span className="krw text-ink-600">{formatDateTime(o.created_at)}</span>,
    },
    {
      key: "orderer",
      label: "주문자",
      width: "160px",
      render: (o) => (
        <span>
          {o.orderer?.name ?? "—"}
          {o.orderer?.phone && (
            <span className="mt-0.5 block text-xs text-ink-400 krw">
              {formatPhone(o.orderer.phone)}
            </span>
          )}
        </span>
      ),
    },
    { key: "items", label: "상품", render: (o) => itemSummary(o.order_items) },
    {
      key: "total",
      label: "총액",
      align: "right",
      width: "110px",
      render: (o) => <span className="krw">{krw(o.total)}원</span>,
    },
    {
      key: "status",
      label: "상태",
      align: "center",
      width: "100px",
      render: (o) => <StatusChip status={o.status} />,
    },
    {
      key: "tracking",
      label: "운송장",
      align: "center",
      width: "80px",
      hideOnMobile: true,
      render: (o) =>
        o.shipments && o.shipments.length > 0 ? (
          <span className="label-caps text-forest-700">등록</span>
        ) : (
          <span className="text-ink-300">—</span>
        ),
    },
  ];

  return (
    <div>
      {/* 툴바 */}
      <div className="mb-6 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <SearchInput
          value={qInput}
          onChange={setQInput}
          onSubmit={() => resetAnd(() => setSearch(qInput.trim()))}
          placeholder="주문번호 / 이름 / 연락처 검색"
          className="xl:max-w-80"
        />
        <div className="flex flex-wrap items-center gap-2">
          <DateRange
            from={range.from}
            to={range.to}
            onChange={(next) => resetAnd(() => setRange(next))}
          />
          <button
            type="button"
            onClick={downloadExcel}
            disabled={exporting}
            className="inline-flex items-center gap-2 border border-ink-200 bg-cream-50 px-4 py-2.5 text-sm text-ink-700 transition-colors hover:bg-cream-100 disabled:opacity-50"
          >
            <Download size={16} strokeWidth={1.5} />
            {exporting ? "생성 중…" : "엑셀 다운로드"}
          </button>
        </div>
      </div>

      {/* 상태 탭 */}
      <Tabs
        tabs={TABS.map((t) => ({ ...t, count: data?.counts?.[t.key] }))}
        active={tab}
        onChange={(key) => resetAnd(() => setTab(key))}
        className="mb-5"
      />

      {error && <p className="mb-4 text-sm text-signal-red">{error}</p>}

      <DataTable<OrderRow>
        columns={columns}
        rows={data?.orders ?? []}
        loading={loading}
        emptyMessage="조건에 맞는 주문이 없습니다."
        onRowClick={(o) => router.push(`/admin/orders/${o.id}`)}
        pagination={
          <Pagination
            page={page}
            totalPages={data?.totalPages ?? 1}
            onChange={setPage}
          />
        }
      />

      <p className="mt-4 text-xs text-ink-400">
        엑셀 다운로드는 현재 검색·기간 조건의 결제완료·준비중 주문을 CJ대한통운 대량 등록
        양식으로 내려받습니다.
      </p>
    </div>
  );
}
