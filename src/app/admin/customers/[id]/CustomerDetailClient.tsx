"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import DataTable, { type DataTableColumn } from "@/components/admin/DataTable";
import StatCard from "@/components/admin/StatCard";
import StatusChip from "@/components/admin/StatusChip";
import { Textarea } from "@/components/admin/Field";
import { krw, formatDate, formatDateTime, formatPhone } from "@/lib/format";
import type { OrderStatus } from "@/lib/types";

/* ============================================================
   관리자 고객 상세 — 프로필 / VIP / 주문 이력 / 배송지 /
   관리자 메모(자동저장) / 리뷰
   ============================================================ */

interface CustomerDetail {
  id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  role: string;
  marketing_opt_in: boolean;
  memo: string | null;
  created_at: string;
}

interface VipInfo {
  group_id: string;
  group_name: string;
  discount_rate: number;
  note: string | null;
  custom_price_count: number;
}

interface OrderRow {
  id: string;
  order_no: string;
  created_at: string;
  status: OrderStatus;
  total: number;
  order_items: { name_snapshot: string; qty: number }[];
}

interface AddressRow {
  id: string;
  label: string;
  recipient: string;
  phone: string;
  postcode: string;
  address1: string;
  address2: string | null;
  is_default: boolean;
}

interface ReviewRow {
  id: string;
  rating: number;
  content: string;
  is_hidden: boolean;
  admin_reply: string | null;
  created_at: string;
  products: { name: string; slug: string } | { name: string; slug: string }[] | null;
}

interface DetailResponse {
  customer: CustomerDetail;
  vip: VipInfo | null;
  stats: { order_count: number; total_spent: number };
  orders: OrderRow[];
  ordersTotal: number;
  addresses: AddressRow[];
  reviews: ReviewRow[];
}

function productName(r: ReviewRow): string {
  const p = Array.isArray(r.products) ? r.products[0] : r.products;
  return p?.name ?? "삭제된 상품";
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-ink-200 bg-cream-50">
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 hairline-b">
        <h2 className="label-caps text-ink-400">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export default function CustomerDetailClient({ customerId }: { customerId: string }) {
  const router = useRouter();

  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [memo, setMemo] = useState("");
  const [memoStatus, setMemoStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const memoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/admin/customers/${customerId}`, {
          signal: controller.signal,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "고객 정보를 불러오지 못했습니다.");
        setData(json as DetailResponse);
        setMemo((json as DetailResponse).customer.memo ?? "");
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setLoadError(e instanceof Error ? e.message : "고객 정보를 불러오지 못했습니다.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [customerId]);

  function onMemoChange(value: string) {
    setMemo(value);
    setMemoStatus("idle");
    if (memoTimer.current) clearTimeout(memoTimer.current);
    memoTimer.current = setTimeout(async () => {
      setMemoStatus("saving");
      try {
        const res = await fetch(`/api/admin/customers/${customerId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ memo: value }),
        });
        if (!res.ok) throw new Error();
        setMemoStatus("saved");
      } catch {
        setMemoStatus("error");
      }
    }, 900);
  }

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
      render: (o) => <span className="krw">{krw(o.total)}원</span>,
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

      {/* ---------- KPI ---------- */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="주문수" value={<span className="krw">{stats.order_count}</span>} sub="취소·환불 제외" />
        <StatCard label="누적구매액" value={<span className="krw">{krw(stats.total_spent)}원</span>} />
        <StatCard label="리뷰" value={<span className="krw">{reviews.length}</span>} />
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
              ordersTotal > orders.length ? (
                <span className="krw text-xs text-ink-400">최근 {orders.length}건 / 총 {ordersTotal}건</span>
              ) : (
                <span className="krw text-xs text-ink-400">총 {ordersTotal}건</span>
              )
            }
          >
            <DataTable<OrderRow>
              columns={orderColumns}
              rows={orders}
              emptyMessage="아직 주문 이력이 없습니다."
              onRowClick={(o) => router.push(`/admin/orders/${o.id}`)}
            />
          </Section>

          <Section title="리뷰">
            {reviews.length === 0 ? (
              <p className="headline-serif py-6 text-center text-ink-500">
                작성한 리뷰가 없습니다.
              </p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {reviews.map((r) => (
                  <li key={r.id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-sm font-medium text-ink-900">{productName(r)}</span>
                      <span className="label-caps text-forest-700">평점 {r.rating}</span>
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
                        답변: {r.admin_reply}
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
          <Section title="프로필">
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="shrink-0 text-ink-400">이메일</dt>
                <dd className="text-right text-ink-900">{customer.email ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="shrink-0 text-ink-400">연락처</dt>
                <dd className="krw text-right text-ink-900">
                  {customer.phone ? formatPhone(customer.phone) : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="shrink-0 text-ink-400">가입일</dt>
                <dd className="krw text-right text-ink-900">{formatDate(customer.created_at)}</dd>
              </div>
            </dl>
          </Section>

          <Section
            title="VIP"
            action={
              <Link href="/admin/vip" className="link-line text-xs text-forest-700">
                VIP 관리
              </Link>
            }
          >
            {vip ? (
              <dl className="space-y-2.5 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="shrink-0 text-ink-400">그룹</dt>
                  <dd className="text-right font-medium text-brass-700">{vip.group_name}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="shrink-0 text-ink-400">그룹 할인율</dt>
                  <dd className="krw text-right text-ink-900">{vip.discount_rate}%</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="shrink-0 text-ink-400">개별 지정가</dt>
                  <dd className="krw text-right text-ink-900">
                    {vip.custom_price_count > 0 ? `${vip.custom_price_count}건` : "없음"}
                  </dd>
                </div>
                {vip.note && <p className="pt-1 text-xs text-ink-500">{vip.note}</p>}
              </dl>
            ) : (
              <p className="text-sm text-ink-400">VIP 멤버십이 없습니다.</p>
            )}
          </Section>

          <Section
            title="관리자 메모"
            action={
              <span
                className={`text-xs ${memoStatus === "error" ? "text-signal-red" : "text-ink-400"}`}
              >
                {memoStatus === "saving" && "저장 중…"}
                {memoStatus === "saved" && "저장됨"}
                {memoStatus === "error" && "저장 실패"}
              </span>
            }
          >
            <Textarea
              value={memo}
              rows={5}
              placeholder="고객 관련 메모를 입력하면 자동으로 저장됩니다."
              onChange={(e) => onMemoChange(e.target.value)}
            />
          </Section>

          <Section title="배송지">
            {addresses.length === 0 ? (
              <p className="text-sm text-ink-400">등록된 배송지가 없습니다.</p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {addresses.map((a) => (
                  <li key={a.id} className="py-3.5 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-ink-900">{a.label}</span>
                      {a.is_default && (
                        <span className="rounded-full bg-forest-100 px-2 py-0.5 text-[11px] text-forest-700">
                          기본
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-ink-600">
                      {a.recipient} · <span className="krw">{formatPhone(a.phone)}</span>
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-ink-500">
                      ({a.postcode}) {a.address1}
                      {a.address2 && ` ${a.address2}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
