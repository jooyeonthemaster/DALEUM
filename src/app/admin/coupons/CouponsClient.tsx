"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DataTable, { type DataTableColumn } from "@/components/admin/DataTable";
import Tabs from "@/components/admin/Tabs";
import SearchInput from "@/components/admin/SearchInput";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { Toggle } from "@/components/admin/Field";
import { DISCOUNT_TYPE_LABELS, TOGGLE_LABELS, won } from "@/lib/admin-labels";
import type { Coupon } from "@/lib/types";
import CouponFormModal from "./CouponFormModal";
import CouponHistoryModal, { type RedemptionRow } from "./CouponHistoryModal";
import {
  STATE_LABELS,
  STATE_TONE,
  benefitText,
  couponState,
  daysLeft,
  periodText,
  remainingText,
  type CouponState,
} from "./coupon-status";

/**
 * 쿠폰 목록.
 *
 * 예전 목록에는 '혜택 / 최소 주문 / 기간 / 사용' 뿐이라, 만든 쿠폰이 지금 쓸 수 있는지
 * 얼마나 남았는지 언제 끝나는지를 저장 후에 알 방법이 없었다. 여기에 발급·사용·잔여와
 * 지금 상태, 만료 임박 표시를 함께 세운다.
 */
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

  const now = useMemo(() => new Date(), []);
  const states = useMemo(() => {
    const map = new Map<string, CouponState>();
    for (const c of coupons) map.set(c.id, couponState(c, now));
    return map;
  }, [coupons, now]);

  const liveCount = useMemo(
    () => coupons.filter((c) => states.get(c.id) === "live").length,
    [coupons, states]
  );
  const endingSoon = useMemo(
    () =>
      coupons.filter((c) => {
        const left = daysLeft(c, now);
        return states.get(c.id) === "live" && left !== null && left <= 7;
      }).length,
    [coupons, states, now]
  );

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return coupons.filter((c) => {
      const state = states.get(c.id) ?? "off";
      if (tab === "live" && state !== "live") return false;
      if (tab === "closed" && state === "live") return false;
      if (query && !c.code.toLowerCase().includes(query) && !c.name.toLowerCase().includes(query)) {
        return false;
      }
      return true;
    });
  }, [coupons, tab, q, states]);

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
      label: "고객이 넣는 코드",
      width: "150px",
      render: (c) => <span className="krw font-semibold text-ink-900">{c.code}</span>,
    },
    {
      key: "name",
      label: "쿠폰 이름",
      render: (c) => (
        <span className="min-w-0">
          <span className="block truncate text-ink-900">{c.name}</span>
          <span className="block truncate text-xs text-ink-400">
            {DISCOUNT_TYPE_LABELS[c.discount_type]}
          </span>
        </span>
      ),
    },
    { key: "benefit", label: "혜택", render: benefitText },
    {
      key: "min_order",
      label: "최소 주문",
      align: "right",
      hideOnMobile: true,
      width: "110px",
      render: (c) => (c.min_order > 0 ? won(c.min_order) : "제한 없음"),
    },
    {
      key: "period",
      label: "사용 기간",
      hideOnMobile: true,
      width: "190px",
      render: (c) => {
        const left = daysLeft(c, now);
        const soon = states.get(c.id) === "live" && left !== null && left <= 7;
        return (
          <span>
            {periodText(c)}
            {soon && (
              <span className="ml-1.5 bg-cream-100 px-1.5 py-0.5 text-[11px] text-signal-red">
                {left !== null && left > 0 ? `${left}일 뒤 종료` : "오늘 종료"}
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: "used",
      label: "사용 현황",
      align: "center",
      width: "150px",
      render: (c) => (
        <span className="krw text-xs leading-tight">
          <span className="block text-ink-900">{c.used_count.toLocaleString("ko-KR")}회 사용</span>
          <span className="block text-ink-400">{remainingText(c)}</span>
        </span>
      ),
    },
    {
      key: "state",
      label: "지금 상태",
      align: "center",
      width: "110px",
      render: (c) => {
        const state = states.get(c.id) ?? "off";
        return (
          <span
            className={`inline-block px-2 py-0.5 text-[11px] leading-tight ${STATE_TONE[state]}`}
          >
            {STATE_LABELS[state]}
          </span>
        );
      },
    },
    {
      key: "is_active",
      label: TOGGLE_LABELS.switch,
      align: "center",
      width: "90px",
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
            사용 내역
          </button>
        </span>
      ),
    },
  ];

  return (
    <div>
      {/* 툴바 */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="코드 또는 이름으로 찾기"
          className="sm:max-w-72"
        />
        {coupons.length > 0 && (
          <button
            type="button"
            onClick={openCreate}
            className="bg-forest-700 px-4 py-2.5 text-sm text-cream-50 transition-colors hover:bg-forest-800"
          >
            새 쿠폰 만들기
          </button>
        )}
      </div>

      {coupons.length > 0 && (
        <p className="mb-4 text-sm text-ink-500">
          전체 {coupons.length}개 중 <b className="text-ink-900">{liveCount}개</b>를 지금 고객이 쓸 수
          있습니다.
          {endingSoon > 0 && (
            <span className="text-signal-red"> {endingSoon}개는 7일 안에 끝납니다.</span>
          )}
        </p>
      )}

      <Tabs
        className="mb-5"
        tabs={[
          { key: "all", label: "전체", count: coupons.length },
          { key: "live", label: "지금 사용 가능", count: liveCount },
          { key: "closed", label: "끝났거나 꺼둠", count: coupons.length - liveCount },
        ]}
        active={tab}
        onChange={setTab}
      />

      {!loading && coupons.length === 0 ? (
        <div className="border border-dashed border-ink-200 px-6 py-14 text-center">
          <p className="text-sm text-ink-900">아직 만든 쿠폰이 없습니다.</p>
          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-ink-500">
            쿠폰을 만들면 고객이 결제 화면에서 코드를 넣어 할인을 받습니다. 만들 때 실제로 얼마가
            깎이는지 미리 계산해 보여 드립니다.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-5 bg-forest-700 px-4 py-2.5 text-sm text-cream-50 transition-colors hover:bg-forest-800"
          >
            첫 쿠폰 만들기
          </button>
        </div>
      ) : (
        <DataTable<Coupon>
          columns={columns}
          rows={filtered}
          loading={loading}
          emptyMessage="조건에 맞는 쿠폰이 없습니다."
          onRowClick={openEdit}
        />
      )}

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

      <CouponHistoryModal
        coupon={historyFor}
        rows={history}
        onClose={() => setHistoryFor(null)}
      />

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
