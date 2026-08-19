"use client";

import Link from "next/link";
import { Undo2 } from "lucide-react";
import DataTable, { type DataTableColumn } from "@/components/admin/DataTable";
import Pagination from "@/components/admin/Pagination";
import { formatDateTime } from "@/lib/format";
import { INVENTORY_REASON_LABELS } from "@/app/admin/products/product-ui";
import { DeltaText } from "./inventory-ui";
import type { InventoryLogItem } from "./inventory-types";

/** 되돌릴 수 있는 이력 — 주문 출고·취소 복구는 주문 쪽 기록이라 여기서 뒤집으면 장부가 어긋난다 */
export function canUndo(log: InventoryLogItem): boolean {
  return log.reason === "restock" || log.reason === "adjust";
}

export interface LogTableProps {
  logs: InventoryLogItem[] | null;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** 되돌리기를 제공할 때만 넘긴다 */
  onUndo?: (log: InventoryLogItem) => void;
  /** 품목별 패널처럼 이미 어느 품목인지 아는 곳에서는 상품 이름 열을 감춘다 */
  showProduct?: boolean;
  emptyMessage?: string;
}

/** 입출고 이력 표 — 전체 이력과 품목별 이력이 같은 표를 쓴다 */
export default function LogTable({
  logs,
  page,
  totalPages,
  onPageChange,
  onUndo,
  showProduct = true,
  emptyMessage = "아직 입출고 이력이 없습니다.",
}: LogTableProps) {
  const columns: DataTableColumn<InventoryLogItem>[] = [
    {
      key: "created_at",
      label: "일시",
      width: "150px",
      render: (l) => <span className="text-ink-600">{formatDateTime(l.created_at)}</span>,
    },
    ...(showProduct
      ? [
          {
            key: "product_name",
            label: "품목",
            render: (l: InventoryLogItem) => (
              <span>
                {l.product_name}
                {l.variant_name && <span className="text-ink-500"> — {l.variant_name}</span>}
              </span>
            ),
          },
        ]
      : []),
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
          {INVENTORY_REASON_LABELS[l.reason] ?? "기타"}
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
      render: (l) => <span className="text-xs text-ink-500">{l.memo ?? "—"}</span>,
    },
    ...(onUndo
      ? [
          {
            key: "undo",
            label: "되돌리기",
            width: "110px",
            align: "right" as const,
            render: (l: InventoryLogItem) =>
              // 이미 되돌린 이력에는 버튼을 주지 않는다.
              // 되돌리기는 반대 수량을 한 줄 더 넣는 방식이라, 버튼이 남아 있으면 두 번 눌러
              // 두 번 빠진다. 서버도 같은 원본의 두 번째 되돌리기를 거절하지만,
              // 누를 수 있게 두고 거절하는 것보다 눌리지 않게 하는 편이 낫다.
              l.undone ? (
                <span className="text-xs text-ink-400" title="이 이력은 이미 되돌렸습니다.">
                  되돌림
                </span>
              ) : canUndo(l) ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUndo(l);
                  }}
                  className="inline-flex items-center gap-1 border border-ink-200 px-2 py-1 text-xs text-ink-600 transition-colors hover:bg-cream-100 hover:text-ink-900"
                >
                  <Undo2 size={13} strokeWidth={1.5} />
                  되돌리기
                </button>
              ) : (
                // 주문 출고·취소 복구·최초 등록은 여기서 뒤집으면 장부가 어긋난다.
                // 사유마다 다른 이유라 한 문구로 뭉뚱그리지 않고 설명은 도움말로 붙인다.
                <span
                  className="text-xs text-ink-300"
                  title={
                    l.reason === "initial"
                      ? "상품을 처음 등록할 때 잡힌 재고라 되돌릴 수 없습니다. 수량을 바꾸려면 입고·조정을 쓰세요."
                      : "주문에서 생긴 기록이라 여기서 되돌릴 수 없습니다. 주문 관리에서 처리해 주세요."
                  }
                >
                  —
                </span>
              ),
          },
        ]
      : []),
  ];

  return (
    <DataTable<InventoryLogItem>
      columns={columns}
      rows={logs ?? []}
      rowKey={(l) => l.id}
      loading={logs === null}
      emptyMessage={emptyMessage}
      pagination={
        <Pagination page={page} totalPages={totalPages} onChange={onPageChange} />
      }
    />
  );
}
