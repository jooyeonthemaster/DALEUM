"use client";

import { useState } from "react";
import Link from "next/link";
import { PackagePlus } from "lucide-react";
import Modal from "@/components/admin/Modal";
import { Input, Help } from "@/components/admin/Field";
import { krw, formatDateTime } from "@/lib/format";
import { BTN_GHOST, BTN_PRIMARY, INVENTORY_REASON_LABELS } from "@/app/admin/products/product-ui";
import LogTable from "./LogTable";
import { useInventoryLogs } from "./use-inventory-logs";
import { undoLog } from "./inventory-actions";
import { parseCount } from "./inventory-number";
import {
  PRODUCT_SCOPE_LABEL,
  SaleStatusBadge,
  UnitThumb,
  mismatchText,
  storefrontHint,
  unitLabel,
} from "./inventory-ui";
import type { InventoryLogItem, InventoryUnit } from "./inventory-types";

const LOGS_PER_PAGE = 8;

export interface ItemPanelProps {
  open: boolean;
  unit: InventoryUnit | null;
  onClose: () => void;
  /** 입고·조정 창을 이 품목으로 연다 */
  onAdjust: (unit: InventoryUnit) => void;
  /** 임박 기준 저장·되돌리기처럼 목록을 다시 읽어야 하는 변경이 끝났을 때 */
  onChanged: (message: string, tone?: "ok" | "error") => void;
  /** 목록이 갱신될 때마다 이력도 다시 읽는다 */
  refreshKey: number;
}

/** 옵션 행에서 그 상품의 '상품 자체 재고' 행을 만들어 낸다 (잠김 풀기 창구용) */
function productScopeUnitOf(u: InventoryUnit): InventoryUnit {
  return {
    ...u,
    variant_id: null,
    scope: "product",
    option_name: null,
    stock: u.product_stock,
    threshold: null,
    is_active: true,
    counts_as_unit: !u.has_options,
  };
}

/**
 * 품목 하나를 펼쳐 보는 패널 — 현황·고객 화면 상태·임박 기준·그 품목의 입출고 이력.
 * 전에는 행을 누르면 곧장 입고 창이 떠서, 이 품목에 무슨 일이 있었는지 볼 방법이 없었다.
 */
export default function ItemPanel({
  open,
  unit,
  onClose,
  onAdjust,
  onChanged,
  refreshKey,
}: ItemPanelProps) {
  const [logsPage, setLogsPage] = useState(1);
  const [threshold, setThreshold] = useState("");
  const [thresholdDirty, setThresholdDirty] = useState(false);
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [undoTarget, setUndoTarget] = useState<InventoryLogItem | null>(null);
  const [busyUndo, setBusyUndo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { logs, totalPages } = useInventoryLogs({
    productId: unit?.product_id ?? null,
    variantId: unit ? (unit.variant_id ?? "none") : null,
    page: logsPage,
    limit: LOGS_PER_PAGE,
    enabled: open && !!unit,
    refreshKey,
  });

  if (!unit) return null;

  const thresholdValue = thresholdDirty ? threshold : String(unit.threshold ?? "");
  const locked = unit.storefront_locked;
  const mismatch = mismatchText(unit);

  async function saveThreshold() {
    if (!unit) return;
    const n = parseCount(thresholdValue);
    if (n === null || n < 0) {
      setError("품절 임박 기준은 0 이상의 숫자로 입력해 주세요.");
      return;
    }
    setSavingThreshold(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: unit.product_id, threshold: n }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "품절 임박 기준을 저장하지 못했습니다.");
      setThresholdDirty(false);
      onChanged(`'${unit.name}' 의 품절 임박 기준을 ${krw(n)}개로 바꿨습니다.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "품절 임박 기준을 저장하지 못했습니다.");
    } finally {
      setSavingThreshold(false);
    }
  }

  async function runUndo() {
    const log = undoTarget;
    if (!log) return;
    setBusyUndo(true);
    setError(null);
    const result = await undoLog(log);
    setBusyUndo(false);
    if (result.ok) setUndoTarget(null);
    onChanged(result.message, result.ok ? "ok" : "error");
  }

  return (
    <Modal open={open} onClose={onClose} title="품목 재고 상세" size="lg">
      <div className="space-y-6">
        {/* ---------- 품목 ---------- */}
        <div className="flex items-start gap-3">
          <UnitThumb unit={unit} size={56} />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-ink-900">{unitLabel(unit)}</p>
            <p className="mt-1 text-xs text-ink-400">
              {unit.sku ? `품번 ${unit.sku}` : "품번 없음"}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <SaleStatusBadge unit={unit} />
              {mismatch && (
                <span className="inline-flex items-center rounded-full bg-cream-100 px-2 py-0.5 text-xs text-signal-amber">
                  {mismatch}
                </span>
              )}
            </div>
          </div>
          <button type="button" onClick={() => onAdjust(unit)} className={`${BTN_PRIMARY} shrink-0`}>
            <span className="inline-flex items-center gap-1.5">
              <PackagePlus size={15} strokeWidth={1.5} />
              입고 · 조정
            </span>
          </button>
        </div>

        {/* ---------- 숫자 나란히 ---------- */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Figure label="이 품목 현재고" value={`${krw(unit.stock)}개`} />
          {unit.has_options && (
            <>
              <Figure
                label="판매중 옵션 재고 합계"
                value={`${krw(unit.option_stock_total)}개`}
                sub={`옵션 ${krw(unit.active_option_count)}개`}
              />
              <Figure
                label={PRODUCT_SCOPE_LABEL}
                value={`${krw(unit.product_stock)}개`}
                sub={unit.product_stock <= 0 ? "0이면 고객 화면이 잠깁니다" : "팔려도 줄지 않습니다"}
                tone={unit.product_stock <= 0 ? "warn" : "default"}
              />
            </>
          )}
        </div>

        {/* ---------- 고객 화면 ---------- */}
        <div
          className={`border-l-2 px-4 py-3 ${
            locked ? "border-signal-red bg-[#fbf1ee]" : "border-ink-200 bg-cream-100"
          }`}
        >
          <p className="label-caps text-ink-400">고객 화면</p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-700">{storefrontHint(unit)}</p>
          {locked && (
            <button
              type="button"
              onClick={() => onAdjust(productScopeUnitOf(unit))}
              className={`${BTN_GHOST} mt-3`}
            >
              {PRODUCT_SCOPE_LABEL} 채워서 잠김 풀기
            </button>
          )}
        </div>

        {/* ---------- 임박 기준 ---------- */}
        {unit.threshold !== null && (
          <div>
            <p className="label-caps text-ink-400">품절 임박 기준</p>
            <div className="mt-2 flex items-center gap-2">
              <Input
                aria-label="품절 임박 기준"
                inputMode="numeric"
                value={thresholdValue}
                onChange={(e) => {
                  setThreshold(e.target.value);
                  setThresholdDirty(true);
                  setError(null);
                }}
                className="max-w-28"
              />
              <span className="text-sm text-ink-500">개 이하로 내려가면 임박으로 표시</span>
              <button
                type="button"
                onClick={() => void saveThreshold()}
                disabled={savingThreshold || !thresholdDirty}
                className={BTN_GHOST}
              >
                {savingThreshold ? "저장 중…" : "저장"}
              </button>
            </div>
            <Help>
              {unit.has_options
                ? "이 기준은 상품 단위 값이라 이 상품의 모든 옵션에 함께 적용됩니다."
                : "재고가 이 수량 이하로 내려가면 목록과 상단 요약에서 품절 임박으로 강조됩니다."}
            </Help>
          </div>
        )}

        {error && <Help tone="error">{error}</Help>}

        {/* ---------- 이 품목의 이력 ---------- */}
        <section>
          <div className="mb-3 flex items-baseline justify-between hairline-b pb-2">
            <h3 className="label-caps text-ink-400">이 품목의 입출고 이력</h3>
            <Link
              href={`/admin/products/${unit.product_id}`}
              className="text-xs text-forest-700 underline decoration-forest-300 underline-offset-2 hover:text-forest-800"
            >
              상품 정보 열기
            </Link>
          </div>

          {undoTarget && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border border-signal-red bg-[#fbf1ee] px-3 py-2.5">
              <p className="text-sm text-ink-700">
                {formatDateTime(undoTarget.created_at)} 의{" "}
                {INVENTORY_REASON_LABELS[undoTarget.reason] ?? "기타"} {undoTarget.delta > 0 ? "+" : ""}
                {krw(undoTarget.delta)}개를 되돌립니다. 반대 방향으로 조정 이력이 한 줄 더 남습니다.
              </p>
              <span className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setUndoTarget(null)}
                  disabled={busyUndo}
                  className={BTN_GHOST}
                >
                  그만두기
                </button>
                <button
                  type="button"
                  onClick={() => void runUndo()}
                  disabled={busyUndo}
                  className={BTN_PRIMARY}
                >
                  {busyUndo ? "처리 중…" : "되돌리기"}
                </button>
              </span>
            </div>
          )}

          <LogTable
            logs={logs}
            page={logsPage}
            totalPages={totalPages}
            onPageChange={setLogsPage}
            onUndo={(l) => setUndoTarget(l)}
            showProduct={false}
            emptyMessage="이 품목은 아직 입출고 기록이 없습니다."
          />
        </section>
      </div>
    </Modal>
  );
}

function Figure({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "warn";
}) {
  return (
    <div className="border border-ink-200 bg-cream-50 px-4 py-3">
      <p className="text-xs text-ink-400">{label}</p>
      <p
        className={`krw mt-1 text-lg font-semibold ${
          tone === "warn" ? "text-signal-red" : "text-ink-900"
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-ink-400">{sub}</p>}
    </div>
  );
}
