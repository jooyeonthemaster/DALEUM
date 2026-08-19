"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/admin/Modal";
import SearchInput from "@/components/admin/SearchInput";
import { FieldRow, Input, Select, Help } from "@/components/admin/Field";
import { krw } from "@/lib/format";
import { BTN_GHOST, BTN_PRIMARY } from "@/app/admin/products/product-ui";
import { PRODUCT_SCOPE_LABEL, UnitThumb, storefrontHint, unitLabel } from "./inventory-ui";
import { parseCount } from "./inventory-number";
import type { InventoryUnit, InventoryListResponse } from "./inventory-types";

export interface AdjustModalProps {
  open: boolean;
  onClose: () => void;
  /** 행에서 열었을 때 미리 선택된 품목 */
  initialUnit: InventoryUnit | null;
  /** 저장 성공 후 — 무엇이 몇 개에서 몇 개가 됐는지 알리는 문장을 넘긴다 */
  onDone: (message: string) => void;
}

type Mode = "restock" | "adjust" | "count";

const MODE_LABEL: Record<Mode, string> = {
  restock: "입고",
  adjust: "조정",
  count: "실사 반영",
};

const MODE_HELP: Record<Mode, string> = {
  restock: "새로 들어온 수량만 적으면 됩니다. 예: 50",
  adjust: "늘릴 만큼은 그대로, 줄일 만큼은 앞에 빼기표를 붙여 적습니다. 예: -3",
  count: "창고에서 실제로 세어 본 수량을 그대로 적으면 차이는 알아서 계산합니다. 예: 87",
};

/** 입고 · 조정 · 실사 반영 — 한 품목의 재고를 바꾸는 유일한 창구 */
export default function AdjustModal({ open, onClose, initialUnit, onDone }: AdjustModalProps) {
  const [unit, setUnit] = useState<InventoryUnit | null>(initialUnit);
  const [searchQ, setSearchQ] = useState("");
  const [results, setResults] = useState<InventoryUnit[]>([]);
  const [searching, setSearching] = useState(false);

  const [mode, setMode] = useState<Mode>("restock");
  const [qty, setQty] = useState("");
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 품목 검색 (디바운스) — 모달은 열 때마다 key로 리마운트되므로 별도 초기화 불필요
  useEffect(() => {
    if (!open || unit) return;
    const q = searchQ.trim();
    if (!q) return;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/admin/inventory?q=${encodeURIComponent(q)}&limit=8&page=1`);
        if (res.ok) {
          const data = (await res.json()) as InventoryListResponse;
          setResults(data.rows);
        }
      } catch {
        // 검색 실패는 조용히 무시 — 아래 "검색 결과가 없습니다" 안내로 충분하다
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQ, open, unit]);

  const parsed = parseCount(qty);
  // 미리보기 — 저장 전에 "몇 개가 되는지"를 눈으로 확인시켜 오입력을 잡는다
  const preview =
    unit && parsed !== null
      ? mode === "count"
        ? { after: parsed, delta: parsed - unit.stock }
        : { after: unit.stock + parsed, delta: parsed }
      : null;

  async function save() {
    if (!unit) {
      setError("먼저 품목을 선택해 주세요.");
      return;
    }
    if (!qty.trim()) {
      setError(mode === "count" ? "실제 세어 본 재고를 입력해 주세요." : "수량을 입력해 주세요.");
      return;
    }
    if (parsed === null) {
      // 조용히 0으로 대체하지 않는다 — '17,800' 을 0으로 저장해 사고가 나던 자리다
      setError("수량은 숫자로만 입력해 주세요. 쉼표(1,000)는 넣어도 됩니다.");
      return;
    }
    if (mode === "restock" && parsed <= 0) {
      setError("입고 수량은 1개 이상으로 입력해 주세요. 줄이려면 방식을 조정 또는 실사 반영으로 바꾸세요.");
      return;
    }
    if (mode === "adjust" && parsed === 0) {
      setError("조정 수량은 0이 아닌 숫자로 입력해 주세요.");
      return;
    }
    if (mode === "count" && parsed < 0) {
      setError("실제 세어 본 재고는 0 이상으로 입력해 주세요.");
      return;
    }
    if (preview && preview.after < 0) {
      setError(`현재고가 ${krw(unit.stock)}개라 이만큼 뺄 수 없습니다.`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "count"
            ? {
                productId: unit.product_id,
                variantId: unit.variant_id,
                mode: "count",
                count: parsed,
                // 이 창을 열었을 때 보고 있던 현재고를 함께 보낸다.
                // 실사는 세어 온 수량으로 덮어쓰는 것이라, 세는 사이에 주문이 나갔다면
                // 그 판매까지 없던 일이 되어 초과판매가 된다. 서버가 이 값과 다르면 손대지 않는다.
                expectedStock: unit.stock,
                memo: memo.trim() || "창고 실사 반영",
              }
            : {
                productId: unit.product_id,
                variantId: unit.variant_id,
                delta: parsed,
                reason: mode,
                memo: memo.trim() || null,
              }
        ),
      });
      const data = (await res.json().catch(() => null)) as
        | { error?: string; stock?: number; before?: number; unchanged?: boolean }
        | null;
      if (!res.ok) throw new Error(data?.error ?? "재고 조정에 실패했습니다.");

      const label = unitLabel(unit);
      const message =
        data?.unchanged || data?.before === data?.stock
          ? `${label} 은 장부와 수량이 같아 그대로 두었습니다.`
          : `${label} 재고를 ${krw(data?.before ?? unit.stock)}개에서 ${krw(data?.stock ?? 0)}개로 바꿨습니다.`;
      onDone(message);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "재고 조정에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

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
            placeholder="상품명 · 옵션 · 품번 검색"
          />
          {searching && <p className="mt-3 text-xs text-ink-400">찾는 중…</p>}
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
                    className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-cream-100"
                  >
                    <UnitThumb unit={r} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink-900">{unitLabel(r)}</span>
                      {r.sku && <span className="text-xs text-ink-400">품번 {r.sku}</span>}
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
          <div className="flex items-start justify-between gap-3 pb-4">
            <div className="flex min-w-0 gap-3">
              <UnitThumb unit={unit} size={40} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink-900">{unitLabel(unit)}</p>
                <p className="mt-0.5 text-xs text-ink-400">
                  현재고 <span className="krw">{krw(unit.stock)}</span>개
                  {unit.sku ? ` · 품번 ${unit.sku}` : ""}
                </p>
              </div>
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

          {/*
            안내를 상태별로 갈라 쓴다. 전에는 '재고만 채우면 풀린다'는 한 문구뿐이었는데,
            품절 상태 상품에는 그 말이 거짓이다 — 고객 화면과 주문 검증 모두 판매 상태가
            품절이면 재고와 무관하게 막는다. 틀린 안내는 안내가 없는 것보다 나쁘다.
          */}
          {unit.storefront_locked && unit.scope === "product" && (
            <div className="py-3">
              <p className="border-l-2 border-signal-red bg-[#fbf1ee] px-3 py-2.5 text-xs leading-relaxed text-ink-700">
                지금 이 상품은 고객 화면에서 통째로 품절로 잠겨 있습니다. 여기 있는{" "}
                {PRODUCT_SCOPE_LABEL}를 1개 이상으로 올리면 잠김이 풀리고, 그 뒤로는 고객이 옵션별
                재고만큼 살 수 있습니다.
              </p>
            </div>
          )}

          {unit.status === "sold_out" && (
            <div className="py-3">
              <p className="border-l-2 border-signal-amber bg-cream-100 px-3 py-2.5 text-xs leading-relaxed text-ink-700">
                이 상품은 판매 상태가 <b>품절</b>입니다. 재고를 채워도 그것만으로는 고객이 살 수
                없습니다 — 재고를 채운 뒤 <b>판매 상태도 판매중으로</b> 바꿔야 합니다. 재고를 채우고
                이 창을 닫으면 목록에서 &lsquo;판매 상태 맞추기&rsquo;로 한 번에 바꿀 수 있습니다.
              </p>
            </div>
          )}

          {(unit.status === "draft" || unit.status === "hidden") && (
            <div className="py-3">
              <p className="border-l-2 border-ink-300 bg-cream-100 px-3 py-2.5 text-xs leading-relaxed text-ink-700">
                이 상품은 {unit.status === "draft" ? "아직 공개하지 않은 상품" : "숨긴 상품"}이라
                고객 화면에 나오지 않습니다. 재고는 그대로 기록되지만, 팔려면 상품 화면에서 판매
                상태를 판매중으로 바꿔야 합니다.
              </p>
            </div>
          )}

          <FieldRow label="처리 방식" htmlFor="adj-mode">
            <Select
              id="adj-mode"
              value={mode}
              onChange={(e) => {
                setMode(e.target.value as Mode);
                setError(null);
              }}
              className="max-w-44"
            >
              <option value="restock">{MODE_LABEL.restock}</option>
              <option value="adjust">{MODE_LABEL.adjust}</option>
              <option value="count">{MODE_LABEL.count}</option>
            </Select>
          </FieldRow>

          <FieldRow
            label={mode === "count" ? "실제 세어 본 재고" : "수량"}
            required
            htmlFor="adj-qty"
            help={MODE_HELP[mode]}
          >
            <Input
              id="adj-qty"
              inputMode="numeric"
              value={qty}
              onChange={(e) => {
                setQty(e.target.value);
                setError(null);
              }}
              placeholder={mode === "count" ? "예: 87" : mode === "adjust" ? "예: -3" : "예: 50"}
              className="max-w-40"
            />
            {preview && (
              <p className="mt-2 text-sm text-ink-700">
                <span className="krw">{krw(unit.stock)}</span>개 →{" "}
                <span className="krw font-semibold text-forest-700">{krw(preview.after)}</span>개
                <span className="ml-2 text-xs text-ink-400">
                  ({preview.delta > 0 ? "+" : ""}
                  {krw(preview.delta)}개)
                </span>
              </p>
            )}
          </FieldRow>

          <FieldRow label="메모" htmlFor="adj-memo" help="나중에 이력에서 왜 바꿨는지 알아볼 수 있게 적어 두면 좋습니다.">
            <Input
              id="adj-memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="예: 7월 1차 생산분 입고"
              maxLength={200}
            />
          </FieldRow>

          <div className="pt-3">
            {error ? (
              <Help tone="error">{error}</Help>
            ) : (
              <Help>{storefrontHint(unit)}</Help>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
