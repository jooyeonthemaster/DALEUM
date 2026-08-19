"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import DataTable, { type DataTableColumn } from "@/components/admin/DataTable";
import StatCard from "@/components/admin/StatCard";
import StatusChip from "@/components/admin/StatusChip";
import { formatDate, formatDateTime } from "@/lib/format";
import { won } from "@/lib/admin-labels";
import CustomerMemoCard from "./CustomerMemoCard";
import { AddressPanel, ProfilePanel, VipPanel } from "./CustomerSidePanels";
import {
  reviewProductName,
  Section,
  type CustomerDetailResponse,
  type OrderRow,
} from "./customer-detail-ui";

/* ============================================================
   관리자 고객 상세 — 주문 이력 / 총 구매액 / VIP 등급 / 메모를 한 화면에서
   ============================================================ */

export default function CustomerDetailClient({ customerId }: { customerId: string }) {
  const router = useRouter();

  const [data, setData] = useState<CustomerDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/admin/customers/${customerId}`, {
          signal: controller.signal,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "고객 정보를 불러오지 못했습니다.");
        setData(json as CustomerDetailResponse);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setLoadError(e instanceof Error ? e.message : "고객 정보를 불러오지 못했습니다.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [customerId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-56 animate-pulse bg-cream-100" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse bg-cream-100" />
          ))}
        </div>
        <div className="h-80 animate-pulse bg-cream-100" />
      </div>
    );
  }
  if (loadError || !data) {
    return (
      <div className="py-24 text-center">
        <p className="headline-serif text-lg text-ink-500">
          {loadError ?? "고객을 찾을 수 없습니다."}
        </p>
        <Link
          href="/admin/customers"
          className="mt-6 inline-block border border-ink-200 px-5 py-2.5 text-sm text-ink-700 transition-colors hover:bg-cream-100"
        >
          고객 목록으로
        </Link>
      </div>
    );
  }

  const { customer, vip, stats, orders, ordersTotal, addresses, reviews } = data;

  const orderColumns: DataTableColumn<OrderRow>[] = [
    {
      key: "order_no",
      label: "주문번호",
      width: "150px",
      render: (o) => <span className="krw font-medium">{o.order_no}</span>,
    },
    {
      key: "created_at",
      label: "일시",
      width: "140px",
      hideOnMobile: true,
      render: (o) => <span className="krw text-ink-600">{formatDateTime(o.created_at)}</span>,
    },
    {
      key: "items",
      label: "상품",
      render: (o) => {
        const items = o.order_items ?? [];
        if (items.length === 0) return "—";
        return items.length > 1
          ? `${items[0].name_snapshot} 외 ${items.length - 1}건`
          : items[0].name_snapshot;
      },
    },
    {
      key: "total",
      label: "금액",
      align: "right",
      width: "110px",
      render: (o) => <span className="krw">{won(o.total)}</span>,
    },
    {
      key: "status",
      label: "상태",
      align: "center",
      width: "100px",
      render: (o) => <StatusChip status={o.status} />,
    },
  ];

  return (
    <div>
      {/* ---------- 헤더 ---------- */}
      <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link
          href="/admin/customers"
          aria-label="고객 목록으로"
          className="-ml-1 p-1 text-ink-400 transition-colors hover:text-ink-900"
        >
          <ArrowLeft size={20} strokeWidth={1.5} />
        </Link>
        <h1 className="headline-serif text-2xl text-ink-900">{customer.name || "이름 미등록"}</h1>
        {vip && (
          <span className="inline-flex items-center whitespace-nowrap rounded-full border border-brass-500/50 bg-brass-300/15 px-2.5 py-1 text-xs font-medium text-brass-700">
            {vip.group_name}
          </span>
        )}
        {customer.email && <span className="text-sm text-ink-400">{customer.email}</span>}
      </div>

      {/* ---------- 한눈 지표 ---------- */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="주문수"
          value={<span className="krw">{stats.order_count}</span>}
          sub="취소·환불 제외"
        />
        <StatCard label="누적구매액" value={<span className="krw">{won(stats.total_spent)}</span>} />
        <StatCard
          label="작성한 리뷰"
          value={<span className="krw">{reviews.length}</span>}
          sub={reviews.length > 0 ? "아래 목록에서 확인" : undefined}
        />
        <StatCard
          label="가입일"
          value={<span className="krw">{formatDate(customer.created_at)}</span>}
          sub={customer.marketing_opt_in ? "마케팅 수신 동의" : "마케팅 수신 거부"}
        />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_minmax(20rem,24rem)]">
        {/* ================= 좌측 ================= */}
        <div className="space-y-6">
          <Section
            title="주문 이력"
            action={
              <span className="krw text-xs text-ink-400">
                {ordersTotal > orders.length
                  ? `최근 ${orders.length}건 / 총 ${ordersTotal}건`
                  : `총 ${ordersTotal}건`}
              </span>
            }
          >
            <DataTable<OrderRow>
              columns={orderColumns}
              rows={orders}
              emptyMessage="아직 주문 이력이 없습니다."
              onRowClick={(o) => router.push(`/admin/orders/${o.id}`)}
            />
          </Section>

          <Section
            title="리뷰"
            action={
              <Link href="/admin/reviews" className="link-line text-xs text-forest-700">
                리뷰 관리
              </Link>
            }
          >
            {reviews.length === 0 ? (
              <p className="headline-serif py-6 text-center text-ink-500">작성한 리뷰가 없습니다.</p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {reviews.map((r) => (
                  <li key={r.id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-sm font-medium text-ink-900">
                        {reviewProductName(r)}
                      </span>
                      <span className="krw text-xs text-forest-700">평점 {r.rating}점</span>
                      {r.is_hidden && (
                        <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] text-ink-500">
                          숨김
                        </span>
                      )}
                      <span className="krw ml-auto text-xs text-ink-400">
                        {formatDate(r.created_at)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{r.content}</p>
                    {r.admin_reply && (
                      <p className="mt-2 border-l-2 border-forest-600 pl-3 text-xs leading-relaxed text-ink-500">
                        답글: {r.admin_reply}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        {/* ================= 우측 ================= */}
        <div className="space-y-6">
          <ProfilePanel customer={customer} />
          <VipPanel vip={vip} />
          <CustomerMemoCard customerId={customerId} initialMemo={customer.memo ?? ""} />
          <AddressPanel addresses={addresses} />
        </div>
      </div>
    </div>
  );
}
