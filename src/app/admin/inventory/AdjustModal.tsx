"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/admin/Modal";
import SearchInput from "@/components/admin/SearchInput";
import { FieldRow, Input, Select, Help } from "@/components/admin/Field";
import { krw } from "@/lib/format";
import { BTN_GHOST, BTN_PRIMARY } from "@/app/admin/products/product-ui";
import type { InventoryUnit, InventoryListResponse } from "./inventory-types";

export interface AdjustModalProps {
  open: boolean;
  onClose: () => void;
  /** 행 클릭으로 열렸을 때 미리 선택된 단위 */
  initialUnit: InventoryUnit | null;
  /** 저장 성공 후 호출 (목록/이력 갱신) */
  onDone: () => void;
}

/** 입고/조정 모달 — 상품 검색 → delta(±) + 사유 + 메모 → adjust_stock */
export default function AdjustModal({ open, onClose, initialUnit, onDone }: AdjustModalProps) {
  const [unit, setUnit] = useState<InventoryUnit | null>(initialUnit);
  const [searchQ, setSearchQ] = useState("");
  const [results, setResults] = useState<InventoryUnit[]>([]);
  const [searching, setSearching] = useState(false);

  const [reason, setReason] = useState<"restock" | "adjust">("restock");
  const [qty, setQty] = useState("");
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 상품 검색 (디바운스) — 모달은 열 때마다 key로 리마운트되므로 별도 초기화 불필요
  useEffect(() => {
    if (!open || unit) return;
    const q = searchQ.trim();
    if (!q) return;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/admin/inventory?q=${encodeURIComponent(q)}&limit=8&page=1`
        );
        if (res.ok) {
          const data = (await res.json()) as InventoryListResponse;
          setResults(data.rows);
        }
      } catch {
        // 검색 실패는 조용히 무시
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQ, open, unit]);

  async function save() {
    if (!unit) {
      setError("먼저 상품을 선택해 주세요.");
      return;
    }
    const n = Number(qty.trim());
    if (!Number.isInteger(n) || n === 0) {
      setError("증감 수량은 0이 아닌 정수로 입력해 주세요.");
      return;
    }
    if (reason === "restock" && n < 0) {
      setError("입고는 양수만 입력할 수 있습니다. 차감은 사유를 '조정'으로 선택해 주세요.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: unit.product_id,
          variantId: unit.variant_id,
          delta: n,
          reason,
          memo: memo.trim() || null,
        }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "재고 조정에 실패했습니다.");
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "재고 조정에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const label = unit
    ? `${unit.name}${unit.option_name ? ` — ${unit.option_name}` : ""}`
    : null;

  return (
    <Modal
      open={open}
      onClose={saving ? () => undefined : onClose}
      title="입고 · 재고 조정"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={saving} className={BTN_GHOST}>
            취소
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !unit}
            className={BTN_PRIMARY}
          >
            {saving ? "처리 중…" : "저장"}
          </button>
        </>
      }
    >
      {!unit ? (
        <div>
          <SearchInput
            value={searchQ}
            onChange={(v) => {
              setSearchQ(v);
              if (!v.trim()) setResults([]);
            }}
            placeholder="상품명 · 옵션 · SKU 검색"
          />
          {searching && <p className="mt-3 text-xs text-ink-400">검색 중…</p>}
          {!searching && searchQ.trim() && results.length === 0 && (
            <p className="mt-4 text-sm text-ink-500">검색 결과가 없습니다.</p>
          )}
          {results.length > 0 && (
            <ul className="mt-3 divide-y divide-ink-100 border border-ink-200">
              {results.map((r) => (
                <li key={`${r.product_id}:${r.variant_id ?? ""}`}>
                  <button
                    type="button"
                    onClick={() => setUnit(r)}
                    className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-cream-100"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-ink-900">
                        {r.name}
                        {r.option_name && (
                          <span className="text-ink-500"> — {r.option_name}</span>
                        )}
                      </span>
                      {r.sku && <span className="text-xs text-ink-400">{r.sku}</span>}
                    </span>
                    <span className="krw shrink-0 text-sm text-ink-600">{krw(r.stock)}개</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="divide-y divide-ink-100">
          <div className="flex items-center justify-between gap-3 pb-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink-900">{label}</p>
              <p className="mt-0.5 text-xs text-ink-400">
                현재고 <span className="krw">{krw(unit.stock)}</span>개
                {unit.sku ? ` · ${unit.sku}` : ""}
              </p>
            </div>
            {!initialUnit && (
              <button
                type="button"
                onClick={() => setUnit(null)}
                className="shrink-0 text-xs text-ink-400 transition-colors hover:text-forest-700"
              >
                다시 선택
              </button>
            )}
          </div>

          <FieldRow label="사유" htmlFor="adj-reason">
            <Select
              id="adj-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value as "restock" | "adjust")}
              className="max-w-40"
            >
              <option value="restock">입고</option>
              <option value="adjust">조정</option>
            </Select>
          </FieldRow>

          <FieldRow
            label="증감 수량"
            required
            htmlFor="adj-qty"
            help={
              reason === "restock"
                ? "입고 수량을 양수로 입력해 주세요. 예: 50"
                : "실사 차이 등을 ± 수량으로 입력해 주세요. 예: -3 또는 10"
            }
          >
            <Input
              id="adj-qty"
              inputMode="numeric"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder={reason === "restock" ? "예: 50" : "예: -3"}
              className="max-w-40"
            />
          </FieldRow>

          <FieldRow label="메모" htmlFor="adj-memo">
            <Input
              id="adj-memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="예: 7월 1차 생산분 입고"
              maxLength={200}
            />
          </FieldRow>

          {error && (
            <div className="pt-3">
              <Help tone="error">{error}</Help>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
