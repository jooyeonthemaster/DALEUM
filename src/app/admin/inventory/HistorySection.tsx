"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Download } from "lucide-react";
import DateRange from "@/components/admin/DateRange";
import SearchInput from "@/components/admin/SearchInput";
import { Select, Help } from "@/components/admin/Field";
import { krw, formatDateTime } from "@/lib/format";
import { BTN_GHOST, BTN_PRIMARY, INVENTORY_REASON_LABELS } from "@/app/admin/products/product-ui";
import LogTable from "./LogTable";
import { useInventoryLogs } from "./use-inventory-logs";
import { undoLog } from "./inventory-actions";
import { downloadLogWorkbook } from "./inventory-excel";
import type { InventoryLogItem, InventoryLogsResponse } from "./inventory-types";

const PER_PAGE = 15;
const EXPORT_MAX_PAGES = 5;

export interface HistorySectionProps {
  /** 재고가 바뀌면 이력도 다시 읽는다 */
  refreshKey: number;
  onChanged: (message: string, tone?: "ok" | "error") => void;
}

/**
 * 화면 아래 전체 입출고 이력.
 * 사유·기간 필터를 붙인 이유: '지난달 곤약면 입고만' 같은 요청을 페이지를 넘겨 가며
 * 눈으로 찾던 상태였다. 서버는 이미 이 조건들을 받을 수 있었는데 화면이 보내지 않았다.
 */
export default function HistorySection({ refreshKey, onChanged }: HistorySectionProps) {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  // 글자를 칠 때마다 조회하면 이력이 깜박여 읽을 수 없다 — 잠깐 멈췄을 때만 조건에 반영한다
  const [appliedQ, setAppliedQ] = useState("");
  const [reason, setReason] = useState("");
  const [range, setRange] = useState({ from: "", to: "" });
  const [openOnMobile, setOpenOnMobile] = useState(false);
  const [undoTarget, setUndoTarget] = useState<InventoryLogItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (q === appliedQ) return;
    const t = setTimeout(() => {
      setAppliedQ(q);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [q, appliedQ]);

  const { logs, total, totalPages } = useInventoryLogs({
    q: appliedQ,
    reason,
    from: range.from,
    to: range.to,
    page,
    limit: PER_PAGE,
    refreshKey,
  });

  async function runUndo() {
    if (!undoTarget) return;
    setBusy(true);
    const result = await undoLog(undoTarget);
    setBusy(false);
    if (result.ok) setUndoTarget(null);
    onChanged(result.message, result.ok ? "ok" : "error");
  }

  /** 지금 필터 그대로 엑셀로 — 표에 보이는 15줄만 받으면 대조에 쓸 수 없다 */
  async function exportLogs() {
    setExporting(true);
    setError(null);
    try {
      const collected: InventoryLogItem[] = [];
      for (let p = 1; p <= EXPORT_MAX_PAGES; p += 1) {
        const params = new URLSearchParams({ page: String(p), limit: "100" });
        if (appliedQ) params.set("q", appliedQ);
        if (reason) params.set("reason", reason);
        if (range.from) params.set("from", new Date(`${range.from}T00:00:00`).toISOString());
        if (range.to) params.set("to", new Date(`${range.to}T23:59:59.999`).toISOString());
        const res = await fetch(`/api/admin/inventory/logs?${params.toString()}`);
        const data = (await res.json().catch(() => null)) as InventoryLogsResponse | null;
        if (!res.ok || !data?.logs) throw new Error("이력을 불러오지 못했습니다.");
        collected.push(...data.logs);
        if (p >= data.totalPages) break;
      }
      if (collected.length === 0) throw new Error("내려받을 이력이 없습니다.");
      await downloadLogWorkbook(collected);
    } catch (e) {
      setError(e instanceof Error ? e.message : "이력을 내려받지 못했습니다.");
    } finally {
      setExporting(false);
    }
  }

  const resetPage = () => setPage(1);

  return (
    <section className="mt-14">
      <div className="mb-4 flex items-baseline justify-between hairline-b pb-3">
        <h2 className="label-caps text-ink-400">
          입출고 이력
          {total > 0 && <span className="krw ml-2 text-ink-300">{krw(total)}건</span>}
        </h2>
        {/* 휴대폰에서는 이력 카드가 수십 장 쌓여 재고 목록까지 파묻힌다 — 기본은 접어 둔다 */}
        <button
          type="button"
          onClick={() => setOpenOnMobile((v) => !v)}
          className="inline-flex items-center gap-1 text-xs text-ink-500 transition-colors hover:text-ink-900 md:hidden"
        >
          {openOnMobile ? "접기" : "펼쳐 보기"}
          {openOnMobile ? (
            <ChevronUp size={14} strokeWidth={1.5} />
          ) : (
            <ChevronDown size={14} strokeWidth={1.5} />
          )}
        </button>
      </div>

      <div className={openOnMobile ? "" : "hidden md:block"}>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <SearchInput
            value={q}
            onChange={setQ}
            onSubmit={() => {
              setAppliedQ(q);
              resetPage();
            }}
            placeholder="상품명으로 이력 찾기"
            className="sm:w-60"
          />
          <Select
            aria-label="사유별 보기"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              resetPage();
            }}
            className="w-40"
          >
            <option value="">사유 전체</option>
            <option value="restock">{INVENTORY_REASON_LABELS.restock}</option>
            <option value="adjust">{INVENTORY_REASON_LABELS.adjust}</option>
            <option value="order">{INVENTORY_REASON_LABELS.order}</option>
            <option value="cancel">{INVENTORY_REASON_LABELS.cancel}</option>
            <option value="initial">{INVENTORY_REASON_LABELS.initial}</option>
          </Select>
          <DateRange
            from={range.from}
            to={range.to}
            onChange={(next) => {
              setRange(next);
              resetPage();
            }}
          />
          <button
            type="button"
            onClick={() => void exportLogs()}
            disabled={exporting}
            className={`${BTN_GHOST} sm:ml-auto`}
          >
            <span className="inline-flex items-center gap-1.5">
              <Download size={15} strokeWidth={1.5} />
              {exporting ? "만드는 중…" : "이력 엑셀로 내려받기"}
            </span>
          </button>
        </div>

        {undoTarget && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border border-signal-red bg-[#fbf1ee] px-3 py-2.5">
            <p className="text-sm text-ink-700">
              {undoTarget.product_name}
              {undoTarget.variant_name ? ` — ${undoTarget.variant_name}` : ""} 의{" "}
              {formatDateTime(undoTarget.created_at)}{" "}
              {INVENTORY_REASON_LABELS[undoTarget.reason] ?? "기타"}{" "}
              {undoTarget.delta > 0 ? "+" : ""}
              {krw(undoTarget.delta)}개를 되돌립니다. 이력은 지워지지 않고 반대 방향으로 한 줄 더
              남습니다.
            </p>
            <span className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setUndoTarget(null)}
                disabled={busy}
                className={BTN_GHOST}
              >
                그만두기
              </button>
              <button
                type="button"
                onClick={() => void runUndo()}
                disabled={busy}
                className={BTN_PRIMARY}
              >
                {busy ? "처리 중…" : "되돌리기"}
              </button>
            </span>
          </div>
        )}

        {error && <Help tone="error">{error}</Help>}

        <LogTable
          logs={logs}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          onUndo={(l) => setUndoTarget(l)}
          emptyMessage="조건에 맞는 입출고 이력이 없습니다."
        />
        <Help>내려받기는 조건에 맞는 최근 500건까지 담습니다.</Help>
      </div>
    </section>
  );
}
