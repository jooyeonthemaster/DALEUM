"use client";

import type { DataTableColumn } from "@/components/admin/DataTable";
import { krw, formatDate } from "@/lib/format";
import { INVENTORY_REASON_LABELS } from "@/app/admin/products/product-ui";
import {
  PRODUCT_SCOPE_LABEL,
  DeltaText,
  SaleStatusBadge,
  StockValue,
  StorefrontBadge,
  UnitThumb,
  mismatchText,
} from "./inventory-ui";
import type { InventoryUnit } from "./inventory-types";

export interface ColumnOptions {
  /** 판매 상태를 재고에 맞추는 동작 */
  onSyncStatus: (unit: InventoryUnit) => void;
  /** 처리 중인 상품 (버튼 잠금) */
  syncingProductId: string | null;
}

/** 재고 목록 열 정의 — 화면에는 사람이 읽는 말만 나온다(상태 코드·영문 열 이름 금지) */
export function buildInventoryColumns({
  onSyncStatus,
  syncingProductId,
}: ColumnOptions): DataTableColumn<InventoryUnit>[] {
  return [
    {
      key: "name",
      label: "품목",
      render: (r) => (
        <div className="flex items-center gap-3">
          <UnitThumb unit={r} />
          <div className="min-w-0">
            <p className="truncate font-medium text-ink-900">
              {r.name}
              {r.scope === "variant" && (
                <span className="text-ink-500"> — {r.option_name}</span>
              )}
              {r.scope === "product" && r.has_options && (
                <span className="ml-2 inline-flex items-center rounded-full bg-cream-100 px-2 py-0.5 text-[11px] text-ink-500">
                  {PRODUCT_SCOPE_LABEL}
                </span>
              )}
            </p>
            {/* 품번은 창고에서 대조하는 값이라 휴대폰에서도 반드시 보여야 한다 */}
            <p className="mt-0.5 truncate text-xs text-ink-400">
              {r.sku ? `품번 ${r.sku}` : "품번 없음"}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "status",
      label: "판매 상태",
      width: "130px",
      render: (r) => {
        const mismatch = mismatchText(r);
        return (
          <div className="flex flex-col items-start gap-1">
            <SaleStatusBadge unit={r} />
            {mismatch && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSyncStatus(r);
                }}
                disabled={syncingProductId === r.product_id}
                title={`${mismatch} — 눌러서 상태를 재고에 맞춥니다`}
                className="text-[11px] text-signal-amber underline decoration-dotted underline-offset-2 hover:text-signal-red disabled:opacity-50"
              >
                {syncingProductId === r.product_id ? "맞추는 중…" : `${mismatch} · 맞추기`}
              </button>
            )}
          </div>
        );
      },
    },
    {
      key: "stock",
      label: "현재고",
      width: "120px",
      align: "right",
      render: (r) => <StockValue unit={r} />,
    },
    {
      key: "threshold",
      label: "임박 기준",
      width: "100px",
      align: "right",
      render: (r) =>
        r.threshold === null ? (
          <span className="text-ink-300" title="옵션으로 관리하는 상품이라 임박 기준을 쓰지 않습니다">
            —
          </span>
        ) : (
          <span className="krw text-ink-500">{krw(r.threshold)}개 이하</span>
        ),
    },
    {
      key: "storefront",
      label: "고객 화면",
      width: "130px",
      render: (r) => <StorefrontBadge unit={r} />,
    },
    {
      key: "last_log",
      label: "최근 입출고",
      width: "200px",
      // 휴대폰에서는 감춘다 — 창고에서 필요한 건 품번·현재고·임박 기준이고,
      // 최근 입출고는 품목을 눌러 여는 상세 패널에서 이력 전체로 볼 수 있다.
      hideOnMobile: true,
      render: (r) =>
        r.last_log ? (
          <span className="text-xs text-ink-600">
            <DeltaText delta={r.last_log.delta} />
            <span className="ml-1.5">
              {INVENTORY_REASON_LABELS[r.last_log.reason] ?? "기타"}
            </span>
            <span className="ml-1.5 text-ink-400">{formatDate(r.last_log.created_at)}</span>
          </span>
        ) : (
          <span className="text-xs text-ink-300">이력 없음</span>
        ),
    },
  ];
}
