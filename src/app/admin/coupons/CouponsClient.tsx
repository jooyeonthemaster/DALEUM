"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DataTable, { type DataTableColumn } from "@/components/admin/DataTable";
import Tabs from "@/components/admin/Tabs";
import SearchInput from "@/components/admin/SearchInput";
import Modal from "@/components/admin/Modal";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { Toggle } from "@/components/admin/Field";
import { krw, formatDate, formatDateTime } from "@/lib/format";
import type { Coupon } from "@/lib/types";
import CouponFormModal from "./CouponFormModal";

/* ---------- 표시 유틸 ---------- */

function benefitText(c: Coupon): string {
  if (c.discount_type === "rate") {
    return `${c.value}% 할인${c.max_discount ? ` (최대 ${krw(c.max_discount)}원)` : ""}`;
  }
  return `${krw(c.value)}원 할인`;
}

function periodText(c: Coupon): string {
  if (!c.starts_at && !c.ends_at) return "상시";
  const from = c.starts_at ? formatDate(c.starts_at) : "";
  const to = c.ends_at ? formatDate(c.ends_at) : "";
  return `${from} – ${to}`.trim();
}

/* ---------- 사용 내역 ---------- */

interface RedemptionRow {
  id: string;
  redeemed_at: string;
  orders: { order_no: string; total: number } | null;
  profiles: { name: string | null; email: string | null } | null;
}

/* ---------- 페이지 ---------- */

export default function CouponsClient() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");

  // 생성/수정 모달
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);

  // 사용 내역 모달
  const [historyFor, setHistoryFor] = useState<Coupon | null>(null);
  const [history, setHistory] = useState<RedemptionRow[] | null>(null);

  // 삭제 확인
  const [deleting, setDeleting] = useState<Coupon | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/coupons", { cache: "no-store" });
      const body = await res.json();
      if (res.ok) setCoupons(body.coupons as Coupon[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return coupons.filter((c) => {
      if (tab === "active" && !c.is_active) return false;
      if (tab === "inactive" && c.is_active) return false;
      if (query && !c.code.toLowerCase().includes(query) && !c.name.toLowerCase().includes(query)) {
        return false;
      }
      return true;
    });
  }, [coupons, tab, q]);

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(c: Coupon) {
    setEditing(c);
    setModalOpen(true);
  }

  async function openHistory(c: Coupon) {
    setHistoryFor(c);
    setHistory(null);
    const res = await fetch(`/api/admin/coupons/${c.id}`, { cache: "no-store" });
    const body = await res.json();
    setHistory(res.ok ? (body.redemptions as RedemptionRow[]) : []);
  }

  async function toggleActive(c: Coupon, next: boolean) {
    // 낙관적 갱신
    setCoupons((prev) => prev.map((x) => (x.id === c.id ? { ...x, is_active: next } : x)));
    const res = await fetch(`/api/admin/coupons/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: next }),
    });
    if (!res.ok) {
      setCoupons((prev) => prev.map((x) => (x.id === c.id ? { ...x, is_active: !next } : x)));
    }
  }

  async function remove() {
    if (!deleting) return;
    const res = await fetch(`/api/admin/coupons/${deleting.id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? "삭제에 실패했습니다.");
    }
    setDeleting(null);
    setModalOpen(false);
    await load();
  }

  const columns: DataTableColumn<Coupon>[] = [
    {
      key: "code",
      label: "코드",
      width: "140px",
      render: (c) => <span className="font-semibold text-ink-900 krw">{c.code}</span>,
    },
    { key: "name", label: "이름" },
    { key: "benefit", label: "혜택", render: benefitText },
    {
      key: "min_order",
      label: "최소 주문",
      align: "right",
      hideOnMobile: true,
      render: (c) => (c.min_order > 0 ? `${krw(c.min_order)}원` : "제한 없음"),
    },
    {
      key: "period",
      label: "기간",
      hideOnMobile: true,
      render: (c) => {
        const ended = c.ends_at !== null && new Date(c.ends_at) < new Date();
        return (
          <span className={ended ? "text-ink-400" : undefined}>
            {periodText(c)}
            {ended && <span className="ml-1.5 text-xs">종료됨</span>}
          </span>
        );
      },
    },
    {
      key: "used",
      label: "사용",
      align: "center",
      render: (c) => (
        <span className="krw">
          {krw(c.used_count)} / {c.usage_limit === null ? "무제한" : krw(c.usage_limit)}
        </span>
      ),
    },
    {
      key: "is_active",
      label: "활성",
      align: "center",
      width: "80px",
      render: (c) => (
        <span onClick={(e) => e.stopPropagation()}>
          <Toggle checked={c.is_active} onChange={(next) => toggleActive(c, next)} />
        </span>
      ),
    },
    {
      key: "actions",
      label: "관리",
      align: "center",
      width: "150px",
      render: (c) => (
        <span className="inline-flex gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => openEdit(c)}
            className="border border-ink-200 bg-cream-50 px-2.5 py-1 text-xs text-ink-700 transition-colors hover:bg-cream-100"
          >
            수정
          </button>
          <button
            type="button"
            onClick={() => openHistory(c)}
            className="border border-ink-200 bg-cream-50 px-2.5 py-1 text-xs text-ink-700 transition-colors hover:bg-cream-100"
          >
            내역
          </button>
        </span>
      ),
    },
  ];

  return (
    <div>
      {/* 툴바 */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="코드 또는 이름 검색"
          className="sm:max-w-72"
        />
        <button
          type="button"
          onClick={openCreate}
          className="bg-forest-700 px-4 py-2 text-sm text-cream-50 transition-colors hover:bg-forest-800"
        >
          새 쿠폰
        </button>
      </div>

      <Tabs
        className="mb-5"
        tabs={[
          { key: "all", label: "전체", count: coupons.length },
          { key: "active", label: "활성", count: coupons.filter((c) => c.is_active).length },
          { key: "inactive", label: "비활성", count: coupons.filter((c) => !c.is_active).length },
        ]}
        active={tab}
        onChange={setTab}
      />

      <DataTable<Coupon>
        columns={columns}
        rows={filtered}
        loading={loading}
        emptyMessage="등록된 쿠폰이 없습니다."
        onRowClick={openEdit}
      />

      {/* ---------- 생성/수정 모달 ---------- */}
      {modalOpen && (
        <CouponFormModal
          key={editing?.id ?? "new"}
          coupon={editing}
          onClose={() => setModalOpen(false)}
          onSaved={async () => {
            setModalOpen(false);
            await load();
          }}
          onDelete={(c) => setDeleting(c)}
        />
      )}

      {/* ---------- 사용 내역 모달 ---------- */}
      <Modal
        open={historyFor !== null}
        onClose={() => setHistoryFor(null)}
        title={historyFor ? `사용 내역 — ${historyFor.code}` : "사용 내역"}
        size="lg"
      >
        {history === null ? (
          <div className="space-y-3 py-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse bg-cream-100" />
            ))}
          </div>
        ) : history.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-400">아직 사용된 내역이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {history.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm text-ink-900 krw">{r.orders?.order_no ?? "주문 정보 없음"}</p>
                  <p className="mt-0.5 truncate text-xs text-ink-400">
                    {r.profiles?.name || r.profiles?.email || "비회원"}
                  </p>
                </div>
                <div className="text-right">
                  {r.orders && <p className="text-sm text-ink-900 krw">{krw(r.orders.total)}원</p>}
                  <p className="mt-0.5 text-xs text-ink-400">{formatDateTime(r.redeemed_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        {historyFor && (
          <p className="mt-4 border-t border-ink-100 pt-3 text-xs text-ink-400 krw">
            누적 사용 {krw(historyFor.used_count)}회 · 최근 20건까지 표시됩니다.
          </p>
        )}
      </Modal>

      {/* ---------- 삭제 확인 ---------- */}
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        title="쿠폰 삭제"
        description={`"${deleting?.name ?? ""}" 쿠폰을 삭제합니다. 사용 내역도 함께 삭제되며 복구할 수 없습니다. 계속하시겠습니까?`}
        confirmLabel="삭제"
        danger
      />
    </div>
  );
}
