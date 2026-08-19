"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Truck } from "lucide-react";
import DataTable, { type DataTableColumn } from "@/components/admin/DataTable";
import Pagination from "@/components/admin/Pagination";
import StatusChip from "@/components/admin/StatusChip";
import OrdersTabs from "./OrdersTabs";
import OrdersFilterBar from "./OrdersFilterBar";
import OrdersEmpty from "./OrdersEmpty";
import OrdersBulkNotice from "./OrdersBulkNotice";
import ExportDialog from "./ExportDialog";
import TrackingUploadDialog from "./TrackingUploadDialog";
import { ORDER_TABS, type DateRangeValue } from "./orders-list";
import { krw, formatDateTime, formatPhone } from "@/lib/format";
import type { OrderStatus, OrdererInfo } from "@/lib/types";

/* ============================================================
   관리자 주문 목록 — 상태 탭 / 검색 / 기간 / 엑셀 / 운송장 일괄 등록
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

interface Props {
  initialTab: string;
  initialSearch: string;
  initialFrom: string;
  initialTo: string;
}

function itemSummary(items: { name_snapshot: string; qty: number }[]): string {
  if (!items || items.length === 0) return "—";
  const first = items[0].name_snapshot;
  return items.length > 1 ? `${first} 외 ${items.length - 1}건` : first;
}

export default function OrdersClient({
  initialTab,
  initialSearch,
  initialFrom,
  initialTo,
}: Props) {
  const router = useRouter();

  const [tab, setTab] = useState(initialTab);
  const [search, setSearch] = useState(initialSearch);
  const [range, setRange] = useState<DateRangeValue>({ from: initialFrom, to: initialTo });
  const [page, setPage] = useState(1);
  /** 일괄 작업 후 목록을 다시 읽기 위한 신호 */
  const [reloadKey, setReloadKey] = useState(0);

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

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
  }, [tab, search, range.from, range.to, page, reloadKey]);

  // ---------- 주소에 조건 싣기 ----------
  // 목록을 다시 읽지 않도록 화면 전환 없이 주소만 갈아 끼운다.
  // 이렇게 해야 대시보드 → 주문 관리로 넘어온 조건이 유지되고, 그 주소를 그대로 공유할 수 있다.
  useEffect(() => {
    const params = new URLSearchParams();
    if (tab !== "all") params.set("tab", tab);
    if (search) params.set("q", search);
    if (range.from) params.set("from", range.from);
    if (range.to) params.set("to", range.to);
    const query = params.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }, [tab, search, range.from, range.to]);

  const resetAnd = useCallback((fn: () => void) => {
    setPage(1);
    fn();
  }, []);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

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
            <span className="krw mt-0.5 block text-xs text-ink-400">
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
          <span className="text-xs text-forest-700">등록됨</span>
        ) : (
          <span className="text-ink-300">—</span>
        ),
    },
  ];

  const counts = data?.counts ?? {};
  const rows = data?.orders ?? [];
  const isEmpty = !loading && rows.length === 0;

  return (
    <div>
      {/* 툴바 */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="inline-flex items-center gap-2 border border-ink-200 bg-cream-50 px-4 py-2.5 text-sm text-ink-700 transition-colors hover:bg-cream-100"
        >
          <Truck size={16} strokeWidth={1.5} />
          운송장 일괄 등록
        </button>
        <button
          type="button"
          onClick={() => setExportOpen(true)}
          className="inline-flex items-center gap-2 border border-ink-200 bg-cream-50 px-4 py-2.5 text-sm text-ink-700 transition-colors hover:bg-cream-100"
        >
          <Download size={16} strokeWidth={1.5} />
          엑셀 내려받기
        </button>
      </div>

      <OrdersFilterBar
        search={search}
        range={range}
        onSearch={(value) => resetAnd(() => setSearch(value))}
        onRange={(next) => resetAnd(() => setRange(next))}
        onReset={() =>
          resetAnd(() => {
            setSearch("");
            setRange({ from: "", to: "" });
          })
        }
      />

      <OrdersTabs
        tabs={ORDER_TABS.map((t) => ({ key: t.key, label: t.label, count: counts[t.key] }))}
        active={tab}
        onChange={(key) => resetAnd(() => setTab(key))}
      />

      {tab === "shipped" && <OrdersBulkNotice scope="deliverStaleShipped" onApplied={reload} />}
      {tab === "pending" && (
        <>
          <p className="mb-3 text-xs leading-relaxed text-ink-500">
            결제 전 주문입니다. 재고는 아직 줄지 않았고, 취소해도 결제사 취소는 일어나지 않습니다.
          </p>
          <OrdersBulkNotice scope="cancelStalePending" onApplied={reload} />
        </>
      )}

      {error && <p className="mb-4 text-sm text-signal-red">{error}</p>}

      {isEmpty ? (
        <OrdersEmpty
          tab={tab}
          search={search}
          range={range}
          counts={counts}
          onReset={() =>
            resetAnd(() => {
              setSearch("");
              setRange({ from: "", to: "" });
            })
          }
          onTab={(key) => resetAnd(() => setTab(key))}
        />
      ) : (
        <DataTable<OrderRow>
          columns={columns}
          rows={rows}
          loading={loading}
          onRowClick={(o) => router.push(`/admin/orders/${o.id}`)}
          pagination={
            <Pagination page={page} totalPages={data?.totalPages ?? 1} onChange={setPage} />
          }
        />
      )}

      <ExportDialog
        open={exportOpen}
        tab={tab}
        search={search}
        range={range}
        onClose={() => setExportOpen(false)}
      />
      <TrackingUploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onApplied={reload}
      />
    </div>
  );
}
