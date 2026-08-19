"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { krw } from "@/lib/format";
import { BTN_GHOST } from "@/app/admin/products/product-ui";
import { PRODUCT_SCOPE_LABEL } from "./inventory-ui";
import type { LockedProductAlert } from "./inventory-types";

export interface InventoryAlertsProps {
  locked: LockedProductAlert[];
  lockedCount: number;
  mismatchCount: number;
  /** 목록 필터를 바꿔 해당 항목만 보여 준다 */
  onShowFilter: (filter: "locked" | "mismatch") => void;
  onChanged: (message: string, tone?: "ok" | "error") => void;
}

/**
 * 화면 맨 위 경고.
 *
 * 여기 있는 '품절로 잠김'이 이 화면을 다시 만든 이유다.
 * 고객 상세페이지와 상품 카드는 옵션 합계가 아니라 상품 자체 재고만 보고 품절을 정한다.
 * 그래서 옵션마다 500개씩 넣어 둔 새 상품이 등록되자마자 '일시 품절'로 잠기는데,
 * 관리자 목록에는 재고 1,500개라고 나오니 원인을 찾을 방법이 없었다.
 * 이제 잠긴 상품을 이름까지 대며 알려 주고, 그 자리에서 풀 수 있게 한다.
 */
export default function InventoryAlerts({
  locked,
  lockedCount,
  mismatchCount,
  onShowFilter,
  onChanged,
}: InventoryAlertsProps) {
  const [busyId, setBusyId] = useState<string | null>(null);

  if (lockedCount === 0 && mismatchCount === 0) return null;

  async function unlock(item: LockedProductAlert) {
    setBusyId(item.product_id);
    try {
      const res = await fetch("/api/admin/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: item.product_id,
          variantId: null,
          mode: "count",
          count: item.option_stock_total,
          memo: `${PRODUCT_SCOPE_LABEL} 0으로 인한 품절 잠김 해제`,
        }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "잠김을 풀지 못했습니다.");
      onChanged(
        `'${item.name}' 의 ${PRODUCT_SCOPE_LABEL}를 ${krw(item.option_stock_total)}개로 맞춰 잠김을 풀었습니다.`
      );
    } catch (e) {
      onChanged(e instanceof Error ? e.message : "잠김을 풀지 못했습니다.", "error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mb-6 space-y-3">
      {lockedCount > 0 && (
        <div className="border border-signal-red bg-[#fbf1ee] px-4 py-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-signal-red" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink-900">
                옵션 재고가 남아 있는데 고객 화면에서는 품절인 상품이 {krw(lockedCount)}개 있습니다.
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-700">
                고객 화면은 옵션 재고 합계가 아니라 <b>{PRODUCT_SCOPE_LABEL}</b>만 보고 품절을
                정합니다. 이 숫자가 0이면 옵션에 몇 개가 있든 상품 전체가 품절로 잠깁니다.
                아래 버튼을 누르면 {PRODUCT_SCOPE_LABEL}를 옵션 합계에 맞춰 잠김을 풉니다.
              </p>

              <ul className="mt-3 space-y-2">
                {locked.map((item) => (
                  <li
                    key={item.product_id}
                    className="flex flex-wrap items-center justify-between gap-2 border border-ink-200 bg-cream-50 px-3 py-2.5"
                  >
                    <span className="min-w-0 text-sm text-ink-900">
                      {item.name}
                      <span className="ml-2 text-xs text-ink-500">
                        판매중 옵션 {krw(item.active_option_count)}개 · 옵션 재고 합계{" "}
                        <span className="krw">{krw(item.option_stock_total)}</span>개 ·{" "}
                        {PRODUCT_SCOPE_LABEL} <span className="krw text-signal-red">0</span>개
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => void unlock(item)}
                      disabled={busyId === item.product_id || item.option_stock_total <= 0}
                      className={`${BTN_GHOST} shrink-0`}
                    >
                      {busyId === item.product_id ? "처리 중…" : "잠김 풀기"}
                    </button>
                  </li>
                ))}
              </ul>

              {lockedCount > locked.length && (
                <p className="mt-2 text-xs text-ink-500">
                  이 밖에 {krw(lockedCount - locked.length)}개가 더 있습니다.
                </p>
              )}

              <button
                type="button"
                onClick={() => onShowFilter("locked")}
                className="mt-3 text-xs text-forest-700 underline decoration-forest-300 underline-offset-2 hover:text-forest-800"
              >
                잠긴 품목만 목록에서 보기
              </button>
            </div>
          </div>
        </div>
      )}

      {mismatchCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-ink-200 bg-cream-100 px-4 py-3">
          <p className="text-sm text-ink-700">
            판매 상태와 실제 재고가 어긋난 상품이 {krw(mismatchCount)}개 있습니다. 재고가 0인데
            판매중이거나, 재고가 있는데 품절로 표시되는 상품입니다.
          </p>
          <button
            type="button"
            onClick={() => onShowFilter("mismatch")}
            className={`${BTN_GHOST} shrink-0`}
          >
            어긋난 상품 보기
          </button>
        </div>
      )}
    </div>
  );
}
