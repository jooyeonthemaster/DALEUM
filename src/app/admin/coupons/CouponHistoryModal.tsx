"use client";

/* 쿠폰 사용 내역 — 누가 언제 어느 주문에 썼는지 최근 20건 */

import Modal from "@/components/admin/Modal";
import { formatDateTime } from "@/lib/format";
import { won } from "@/lib/admin-labels";
import type { Coupon } from "@/lib/types";
import { remainingText } from "./coupon-status";

export interface RedemptionRow {
  id: string;
  redeemed_at: string;
  orders: { order_no: string; total: number } | null;
  profiles: { name: string | null; email: string | null } | null;
}

export interface CouponHistoryModalProps {
  coupon: Coupon | null;
  /** null이면 아직 불러오는 중 */
  rows: RedemptionRow[] | null;
  onClose: () => void;
}

export default function CouponHistoryModal({ coupon, rows, onClose }: CouponHistoryModalProps) {
  return (
    <Modal
      open={coupon !== null}
      onClose={onClose}
      title={coupon ? `사용 내역 — ${coupon.name}` : "사용 내역"}
      size="lg"
    >
      {rows === null ? (
        <div className="space-y-3 py-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse bg-cream-100" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-400">아직 이 쿠폰을 쓴 고객이 없습니다.</p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"
            >
              <div className="min-w-0">
                <p className="krw text-sm text-ink-900">{r.orders?.order_no ?? "주문 정보 없음"}</p>
                <p className="mt-0.5 truncate text-xs text-ink-400">
                  {r.profiles?.name || r.profiles?.email || "비회원"}
                </p>
              </div>
              <div className="text-right">
                {r.orders && <p className="krw text-sm text-ink-900">{won(r.orders.total)}</p>}
                <p className="mt-0.5 text-xs text-ink-400">{formatDateTime(r.redeemed_at)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {coupon && (
        <p className="mt-4 border-t border-ink-100 pt-3 text-xs text-ink-400">
          지금까지 {coupon.used_count.toLocaleString("ko-KR")}회 사용 · {remainingText(coupon)} · 최근
          20건까지 보여 드립니다.
        </p>
      )}
    </Modal>
  );
}
