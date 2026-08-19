"use client";

import { useCallback, useEffect, useState } from "react";
import DataTable from "@/components/admin/DataTable";
import Pagination from "@/components/admin/Pagination";
import StatCard from "@/components/admin/StatCard";
import { krw } from "@/lib/format";
import AdjustModal from "./AdjustModal";
import BulkStockModal from "./BulkStockModal";
import HistorySection from "./HistorySection";
import InventoryAlerts from "./InventoryAlerts";
import InventoryToolbar from "./InventoryToolbar";
import InventoryToast, { type ToastMessage } from "./InventoryToast";
import ItemPanel from "./ItemPanel";
import { buildInventoryColumns } from "./inventory-columns";
import { syncSaleStatus } from "./inventory-actions";
import { downloadStockWorkbook } from "./inventory-excel";
import { unitKey } from "./inventory-types";
import type {
  InventoryListResponse,
  InventorySummary,
  InventoryUnit,
  LockedProductAlert,
} from "./inventory-types";

const PAGE_SIZE = 20;
/** 엑셀 내려받기는 화면에 보이는 20줄이 아니라 조건에 맞는 전량을 담아야 대조에 쓸 수 있다 */
const EXPORT_LIMIT = 500;

export default function InventoryClient() {
  // rows === null 이면 로딩 중 (표에서 뼈대를 그린다)
  const [rows, setRows] = useState<InventoryUnit[] | null>(null);
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [locked, setLocked] = useState<LockedProductAlert[]>([]);
  const [mismatchCount, setMismatchCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [sale, setSale] = useState("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // tick 을 올리면 목록과 이력이 함께 다시 읽힌다 (재고를 바꾼 뒤 한 번만 부르면 된다)
  const [tick, setTick] = useState(0);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const [adjustUnit, setAdjustUnit] = useState<InventoryUnit | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustKey, setAdjustKey] = useState(0);
  const [panelUnit, setPanelUnit] = useState<InventoryUnit | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkKey, setBulkKey] = useState(0);
  const [syncingProductId, setSyncingProductId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const notify = useCallback((text: string, tone: "ok" | "error" = "ok") => {
    setToast({ id: Date.now(), text, tone });
  }, []);

  const refresh = useCallback(() => {
    setRows(null);
    setTick((t) => t + 1);
  }, []);

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

  // 재고 현황 로드
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(PAGE_SIZE),
          filter,
          sale,
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
        setLocked(data.locked ?? []);
        setMismatchCount(data.mismatchCount ?? 0);
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
  }, [appliedQ, filter, sale, page, tick]);

  /** 입고·조정 창 열기 — 품목 패널과 겹치면 두 창이 서로 닫기 키를 가로채므로 패널은 닫는다 */
  function openAdjust(unit: InventoryUnit | null) {
    setPanelOpen(false);
    setAdjustUnit(unit);
    setAdjustKey((k) => k + 1); // 열 때마다 입력값 초기화 (key 리마운트)
    setAdjustOpen(true);
  }

  async function handleSyncStatus(unit: InventoryUnit) {
    setSyncingProductId(unit.product_id);
    const result = await syncSaleStatus(unit.product_id);
    setSyncingProductId(null);
    notify(result.message, result.ok ? "ok" : "error");
    if (result.ok) refresh();
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      const params = new URLSearchParams({
        page: "1",
        limit: String(EXPORT_LIMIT),
        filter,
        sale,
      });
      if (appliedQ) params.set("q", appliedQ);
      const res = await fetch(`/api/admin/inventory?${params.toString()}`);
      const data = (await res.json().catch(() => null)) as InventoryListResponse | null;
      if (!res.ok || !data?.rows) throw new Error("재고 목록을 불러오지 못했습니다.");
      if (data.rows.length === 0) throw new Error("내려받을 품목이 없습니다.");
      await downloadStockWorkbook(data.rows);
      notify(`${krw(data.rows.length)}개 품목을 엑셀로 내려받았습니다.`);
    } catch (e) {
      notify(e instanceof Error ? e.message : "엑셀을 만들지 못했습니다.", "error");
    } finally {
      setDownloading(false);
    }
  }

  const columns = buildInventoryColumns({ onSyncStatus: handleSyncStatus, syncingProductId });

  return (
    <div>
      {/* ---------- 요약 ---------- */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="총 품목"
          value={summary ? krw(summary.total_units) : "—"}
          sub="상품·옵션 단위"
        />
        <StatCard
          label="품절 임박"
          value={summary ? krw(summary.low_stock) : "—"}
          sub="판매중 상품 기준"
          tone={summary && summary.low_stock > 0 ? "down" : "default"}
        />
        <StatCard
          label="품절"
          value={summary ? krw(summary.sold_out) : "—"}
          sub="판매중 상품 기준"
          tone={summary && summary.sold_out > 0 ? "down" : "default"}
        />
        <StatCard
          label="품절로 잠김"
          value={summary ? krw(summary.locked) : "—"}
          sub="옵션은 있는데 상품 재고 0"
          tone={summary && summary.locked > 0 ? "down" : "default"}
        />
      </div>

      <InventoryAlerts
        locked={locked}
        lockedCount={summary?.locked ?? 0}
        mismatchCount={mismatchCount}
        onShowFilter={(next) => {
          setRows(null);
          setFilter(next);
          setPage(1);
        }}
        onChanged={(message, tone) => {
          notify(message, tone);
          if (tone !== "error") refresh();
        }}
      />

      <InventoryToolbar
        q={q}
        onQChange={setQ}
        onQSubmit={() => {
          setRows(null);
          setAppliedQ(q);
          setPage(1);
        }}
        filter={filter}
        onFilterChange={(v) => {
          setRows(null);
          setFilter(v);
          setPage(1);
        }}
        sale={sale}
        onSaleChange={(v) => {
          setRows(null);
          setSale(v);
          setPage(1);
        }}
        onDownload={() => void handleDownload()}
        downloading={downloading}
        onBulk={() => {
          // 지난번 미리보기 결과가 남아 있으면 새 파일을 올린 것으로 착각한다 — 열 때마다 새로 시작
          setBulkKey((k) => k + 1);
          setBulkOpen(true);
        }}
        onAdjust={() => openAdjust(null)}
      />

      {error && (
        <p className="mb-4 border border-ink-200 bg-cream-100 px-4 py-3 text-sm text-signal-red">
          {error}
        </p>
      )}

      <DataTable<InventoryUnit>
        columns={columns}
        rows={rows ?? []}
        rowKey={(r) => unitKey(r)}
        loading={rows === null}
        emptyMessage="조건에 맞는 품목이 없습니다."
        onRowClick={(r) => {
          setPanelUnit(r);
          setPanelOpen(true);
        }}
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

      <HistorySection
        refreshKey={tick}
        onChanged={(message, tone) => {
          notify(message, tone);
          if (tone !== "error") refresh();
        }}
      />

      {/* 품목이 바뀌면 통째로 새로 그린다 — 앞 품목에서 고치던 임박 기준 입력값이 따라오면 안 된다 */}
      <ItemPanel
        key={panelUnit ? unitKey(panelUnit) : "none"}
        open={panelOpen}
        unit={panelUnit}
        onClose={() => setPanelOpen(false)}
        onAdjust={openAdjust}
        onChanged={(message, tone) => {
          notify(message, tone);
          if (tone !== "error") refresh();
        }}
        refreshKey={tick}
      />

      <AdjustModal
        /* 두 모달은 형제라 key 가 서로 달라야 한다. 둘 다 0 에서 시작하는 숫자를 그대로 쓰면
           React 가 "같은 key 를 가진 자식이 둘" 이라고 경고하고, 한쪽이 갱신에서 빠질 수 있다.
           (숫자를 올려 모달을 초기화하는 방식 자체는 그대로 둔다) */
        key={`adjust-${adjustKey}`}
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        initialUnit={adjustUnit}
        onDone={(message) => {
          notify(message);
          refresh();
        }}
      />

      <BulkStockModal
        key={`bulk-${bulkKey}`}
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onDone={(message, tone) => {
          notify(message, tone);
          refresh();
        }}
      />

      <InventoryToast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
