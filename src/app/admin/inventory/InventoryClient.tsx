"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import DataTable, { type DataTableColumn } from "@/components/admin/DataTable";
import Pagination from "@/components/admin/Pagination";
import SearchInput from "@/components/admin/SearchInput";
import StatCard from "@/components/admin/StatCard";
import { Select } from "@/components/admin/Field";
import { krw, formatDate, formatDateTime } from "@/lib/format";
import {
  BTN_PRIMARY,
  INVENTORY_REASON_LABELS,
} from "@/app/admin/products/product-ui";
import AdjustModal from "./AdjustModal";
import type {
  InventoryListResponse,
  InventoryLogItem,
  InventorySummary,
  InventoryUnit,
} from "./inventory-types";

const PAGE_SIZE = 20;
const LOGS_PAGE_SIZE = 15;

function DeltaText({ delta }: { delta: number }) {
  return (
    <span className={`krw font-medium ${delta > 0 ? "text-forest-700" : "text-signal-red"}`}>
      {delta > 0 ? `+${krw(delta)}` : krw(delta)}
    </span>
  );
}

export default function InventoryClient() {
  // rows/logs === null 이면 로딩 중 (스켈레톤)
  const [rows, setRows] = useState<InventoryUnit[] | null>(null);
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loading = rows === null;

  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [logs, setLogs] = useState<InventoryLogItem[] | null>(null);
  const [logsPage, setLogsPage] = useState(1);
  const [logsTotalPages, setLogsTotalPages] = useState(1);
  const logsLoading = logs === null;

  const [modalOpen, setModalOpen] = useState(false);
  const [modalUnit, setModalUnit] = useState<InventoryUnit | null>(null);
  const [modalKey, setModalKey] = useState(0);

  // 검색 디바운스
  useEffect(() => {
    if (q === appliedQ) return;
    const t = setTimeout(() => {
      setRows(null);
      setPage(1);
      setAppliedQ(q);
    }, 400);
    return () => clearTimeout(t);
  }, [q, appliedQ]);

  // tick 증가로 재조회 트리거 (입고/조정 저장 후)
  const [tick, setTick] = useState(0);
  const [logsTick, setLogsTick] = useState(0);

  // 재고 현황 로드
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(PAGE_SIZE),
          filter,
        });
        if (appliedQ) params.set("q", appliedQ);
        const res = await fetch(`/api/admin/inventory?${params.toString()}`);
        const data = (await res.json().catch(() => null)) as
          | (InventoryListResponse & { error?: string })
          | null;
        if (!res.ok || !data?.rows) {
          throw new Error(data?.error ?? "재고 현황을 불러오지 못했습니다.");
        }
        if (cancelled) return;
        setRows(data.rows);
        setSummary(data.summary);
        setTotalPages(data.totalPages);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "재고 현황을 불러오지 못했습니다.");
        setRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appliedQ, filter, page, tick]);

  // 입출고 이력 로드
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/inventory/logs?page=${logsPage}&limit=${LOGS_PAGE_SIZE}`
        );
        const data = (await res.json().catch(() => null)) as
          | { logs?: InventoryLogItem[]; totalPages?: number }
          | null;
        if (cancelled) return;
        if (res.ok && data?.logs) {
          setLogs(data.logs);
          setLogsTotalPages(data.totalPages ?? 1);
        } else {
          setLogs([]);
        }
      } catch {
        // 이력 로드 실패는 본 테이블과 독립적으로 조용히 처리
        if (!cancelled) setLogs([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [logsPage, logsTick]);

  function openAdjust(unit: InventoryUnit | null) {
    setModalUnit(unit);
    setModalKey((k) => k + 1); // 열 때마다 모달 상태 초기화 (key 리마운트)
    setModalOpen(true);
  }

  const columns: DataTableColumn<InventoryUnit>[] = [
    {
      key: "name",
      label: "상품",
      render: (r) => (
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-10 shrink-0 overflow-hidden border border-ink-200 bg-cream-100">
            {r.thumbnail ? (
              <Image src={r.thumbnail} alt={r.name} fill sizes="40px" className="object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-[9px] text-ink-300">
                No img
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-ink-900">
              {r.name}
              {r.option_name && <span className="text-ink-500"> — {r.option_name}</span>}
            </p>
            {!r.is_active && <p className="mt-0.5 text-xs text-ink-400">비활성 옵션</p>}
          </div>
        </div>
      ),
    },
    {
      key: "sku",
      label: "SKU",
      width: "140px",
      hideOnMobile: true,
      render: (r) => <span className="text-ink-600">{r.sku ?? "—"}</span>,
    },
    {
      key: "stock",
      label: "현재고",
      width: "110px",
      align: "right",
      render: (r) => {
        if (r.stock <= 0) {
          return <span className="krw font-semibold text-signal-red">품절</span>;
        }
        const low = r.stock <= r.threshold;
        return (
          <span className={`krw font-medium ${low ? "text-signal-amber" : "text-ink-900"}`}>
            {krw(r.stock)}
            {low && <span className="ml-1 text-xs">임박</span>}
          </span>
        );
      },
    },
    {
      key: "threshold",
      label: "임계치",
      width: "90px",
      align: "right",
      hideOnMobile: true,
      render: (r) => <span className="krw text-ink-500">{krw(r.threshold)}</span>,
    },
    {
      key: "last_log",
      label: "최근 입출고",
      width: "220px",
      render: (r) =>
        r.last_log ? (
          <span className="text-xs text-ink-600">
            <DeltaText delta={r.last_log.delta} />
            <span className="ml-1.5">
              {INVENTORY_REASON_LABELS[r.last_log.reason] ?? r.last_log.reason}
            </span>
            <span className="ml-1.5 text-ink-400">{formatDate(r.last_log.created_at)}</span>
          </span>
        ) : (
          <span className="text-xs text-ink-300">이력 없음</span>
        ),
    },
  ];

  const logColumns: DataTableColumn<InventoryLogItem>[] = [
    {
      key: "created_at",
      label: "일시",
      width: "150px",
      render: (l) => <span className="text-ink-600">{formatDateTime(l.created_at)}</span>,
    },
    {
      key: "product_name",
      label: "상품",
      render: (l) => (
        <span>
          {l.product_name}
          {l.variant_name && <span className="text-ink-500"> — {l.variant_name}</span>}
        </span>
      ),
    },
    {
      key: "delta",
      label: "변동",
      width: "90px",
      align: "right",
      render: (l) => <DeltaText delta={l.delta} />,
    },
    {
      key: "reason",
      label: "사유",
      width: "160px",
      render: (l) => (
        <span className="text-ink-700">
          {INVENTORY_REASON_LABELS[l.reason] ?? l.reason}
          {l.order && (
            <Link
              href={`/admin/orders/${l.order.id}`}
              onClick={(e) => e.stopPropagation()}
              className="ml-1.5 text-xs text-forest-700 underline decoration-forest-300 underline-offset-2 hover:text-forest-800"
            >
              {l.order.order_no}
            </Link>
          )}
        </span>
      ),
    },
    {
      key: "memo",
      label: "메모",
      hideOnMobile: true,
      render: (l) => <span className="text-xs text-ink-500">{l.memo ?? "—"}</span>,
    },
  ];

  return (
    <div>
      {/* 요약 */}
      <div className="mb-8 grid grid-cols-3 gap-3">
        <StatCard label="총 SKU" value={summary ? krw(summary.total_skus) : "—"} sub="상품·옵션 단위" />
        <StatCard
          label="품절 임박"
          value={summary ? krw(summary.low_stock) : "—"}
          sub="임계치 이하"
          tone={summary && summary.low_stock > 0 ? "down" : "default"}
        />
        <StatCard
          label="품절"
          value={summary ? krw(summary.sold_out) : "—"}
          sub="재고 0"
          tone={summary && summary.sold_out > 0 ? "down" : "default"}
        />
      </div>

      {/* 툴바 */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          value={q}
          onChange={setQ}
          onSubmit={() => {
            setRows(null);
            setAppliedQ(q);
            setPage(1);
          }}
          placeholder="상품명 · 옵션 · SKU 검색"
          className="sm:max-w-72"
        />
        <div className="flex items-center gap-2">
          <Select
            aria-label="재고 필터"
            value={filter}
            onChange={(e) => {
              setRows(null);
              setFilter(e.target.value);
              setPage(1);
            }}
            className="w-36"
          >
            <option value="all">전체</option>
            <option value="low">품절 임박</option>
            <option value="out">품절</option>
          </Select>
          <button
            type="button"
            onClick={() => openAdjust(null)}
            className={`${BTN_PRIMARY} whitespace-nowrap`}
          >
            입고 · 조정
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-4 border border-ink-200 bg-cream-100 px-4 py-3 text-sm text-signal-red">
          {error}
        </p>
      )}

      <DataTable<InventoryUnit>
        columns={columns}
        rows={rows ?? []}
        rowKey={(r) => `${r.product_id}:${r.variant_id ?? ""}`}
        loading={loading}
        emptyMessage="조건에 맞는 재고 항목이 없습니다."
        onRowClick={(r) => openAdjust(r)}
        pagination={
          <Pagination
            page={page}
            totalPages={totalPages}
            onChange={(p) => {
              setRows(null);
              setPage(p);
            }}
          />
        }
      />

      {/* 입출고 이력 */}
      <section className="mt-14">
        <div className="mb-4 flex items-baseline justify-between hairline-b pb-3">
          <h2 className="label-caps text-ink-400">최근 입출고 이력</h2>
        </div>
        <DataTable<InventoryLogItem>
          columns={logColumns}
          rows={logs ?? []}
          loading={logsLoading}
          emptyMessage="아직 입출고 이력이 없습니다."
          pagination={
            <Pagination
              page={logsPage}
              totalPages={logsTotalPages}
              onChange={(p) => {
                setLogs(null);
                setLogsPage(p);
              }}
            />
          }
        />
      </section>

      <AdjustModal
        key={modalKey}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        initialUnit={modalUnit}
        onDone={() => {
          setTick((t) => t + 1);
          if (logsPage !== 1) {
            setLogs(null);
            setLogsPage(1);
          } else {
            setLogsTick((t) => t + 1);
          }
        }}
      />
    </div>
  );
}
