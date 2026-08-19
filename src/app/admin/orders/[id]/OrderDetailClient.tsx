"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import StatusChip from "@/components/admin/StatusChip";
import TrackingSection from "./TrackingSection";
import RefundSection from "./RefundSection";
import StatusFlowSection from "./StatusFlowSection";
import OrderSummaryPanel from "./OrderSummaryPanel";
import ShippingEditModal from "./ShippingEditModal";
import { OrderTimeline, OrderMemoSection } from "./OrderTimeline";
import { formatDateTime } from "@/lib/format";
import type { OrderStatus, RecipientInfo } from "@/lib/types";
import type {
  AdminOrderDetail,
  CustomerLink,
  OrderEventView,
  RefundLedgerView,
} from "./order-detail-types";

/* ============================================================
   관리자 주문 상세 — 주문 내용 / 진행 단계 / 운송장 / 처리 이력 / 상시 메모 / 환불

   화면에 나가는 값은 전부 서버가 사람 말로 다듬어 내려 준 것만 쓴다.
   (예전에는 관리자 메모 칸에 UTC 시각과 영문 DB 오류, 상품 식별자가 그대로 찍혔다)
   ============================================================ */

interface DetailResponse {
  order: AdminOrderDetail;
  customer: CustomerLink | null;
  memo: string;
  events: OrderEventView[];
  refund: RefundLedgerView | null;
  memoKinds: Record<string, string>;
}

export default function OrderDetailClient({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [customer, setCustomer] = useState<CustomerLink | null>(null);
  const [events, setEvents] = useState<OrderEventView[]>([]);
  const [refund, setRefund] = useState<RefundLedgerView | null>(null);
  const [memoKinds, setMemoKinds] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [shippingOpen, setShippingOpen] = useState(false);

  const [memo, setMemo] = useState("");
  const [memoStatus, setMemoStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const memoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------- 조회 ----------
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/admin/orders/${orderId}`, { signal: controller.signal });
        const json = (await res.json()) as DetailResponse & { error?: string };
        if (!res.ok) throw new Error(json.error ?? "주문을 불러오지 못했습니다.");
        setOrder(json.order);
        setCustomer(json.customer ?? null);
        setEvents(json.events ?? []);
        setRefund(json.refund ?? null);
        setMemoKinds(json.memoKinds ?? {});
        setMemo(json.memo ?? "");
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setLoadError(e instanceof Error ? e.message : "주문을 불러오지 못했습니다.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [orderId]);

  /**
   * 이력만 다시 읽어 온다.
   * 환불·운송장은 PATCH 가 아닌 자기 라우트로 나가서 서버가 이력을 새로 적는다 —
   * 화면이 그것을 모르면 방금 한 일이 '처리 이력' 에 안 보여 "기록이 안 남았나" 싶게 된다.
   */
  const refreshEvents = useCallback(() => {
    fetch(`/api/admin/orders/${orderId}`)
      .then((r) => r.json())
      .then((j) => {
        if (Array.isArray(j.events)) setEvents(j.events as OrderEventView[]);
      })
      .catch(() => undefined);
  }, [orderId]);

  /** PATCH 공통 — 서버가 다시 계산해 준 이력/잔액으로 화면을 맞춘다 */
  const patch = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "저장하지 못했습니다.");
      if (Array.isArray(json.events)) setEvents(json.events as OrderEventView[]);
      if (json.refund) setRefund(json.refund as RefundLedgerView);
      return json as { order?: Partial<AdminOrderDetail> };
    },
    [orderId]
  );

  // ---------- 상태 한 단계 이동 ----------
  async function changeStatus(next: OrderStatus) {
    if (!order || statusBusy) return;
    setStatusBusy(true);
    setStatusError(null);
    try {
      await patch({ status: next });
      setOrder((o) => (o ? { ...o, status: next } : o));
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : "상태를 변경하지 못했습니다.");
    } finally {
      setStatusBusy(false);
    }
  }

  // ---------- 배송지 수정 ----------
  async function saveRecipient(next: RecipientInfo) {
    await patch({ recipient: next });
    setOrder((o) => (o ? { ...o, recipient: next } : o));
  }

  // ---------- 이력 남기기 ----------
  async function addEvent(kind: string, body: string) {
    await patch({ event: { kind, body } });
  }

  // ---------- 상시 메모 자동저장 ----------
  function onMemoChange(value: string) {
    setMemo(value);
    setMemoStatus("idle");
    if (memoTimer.current) clearTimeout(memoTimer.current);
    memoTimer.current = setTimeout(() => {
      setMemoStatus("saving");
      // 자유 메모만 보낸다 — 이력은 서버가 들고 있다가 그대로 다시 붙인다
      patch({ adminMemo: value })
        .then(() => setMemoStatus("saved"))
        .catch(() => setMemoStatus("error"));
    }, 900);
  }

  // ---------- 로딩 / 에러 ----------
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse bg-cream-100" />
        <div className="grid gap-6 lg:grid-cols-[1fr_minmax(20rem,24rem)]">
          <div className="h-96 animate-pulse bg-cream-100" />
          <div className="h-96 animate-pulse bg-cream-100" />
        </div>
      </div>
    );
  }
  if (loadError || !order) {
    return (
      <div className="py-24 text-center">
        <p className="headline-serif text-lg text-ink-500">
          {loadError ?? "주문을 찾을 수 없습니다."}
        </p>
        <Link
          href="/admin/orders"
          className="mt-6 inline-block border border-ink-200 px-5 py-2.5 text-sm text-ink-700 transition-colors hover:bg-cream-100"
        >
          주문 목록으로
        </Link>
      </div>
    );
  }

  const shipment = order.shipments?.[0] ?? null;

  return (
    <div>
      {/* ---------- 헤더 ---------- */}
      <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link
          href="/admin/orders"
          aria-label="주문 목록으로"
          className="-ml-1 p-1 text-ink-400 transition-colors hover:text-ink-900"
        >
          <ArrowLeft size={20} strokeWidth={1.5} />
        </Link>
        <h1 className="headline-serif text-2xl text-ink-900">{order.order_no}</h1>
        <StatusChip status={order.status} />
        <span className="krw text-sm text-ink-400">{formatDateTime(order.created_at)} 주문</span>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_minmax(20rem,24rem)]">
        <OrderSummaryPanel
          order={order}
          customer={customer}
          onEditShipping={() => setShippingOpen(true)}
        />

        {/* ================= 우측 — 운영 패널 ================= */}
        <div className="space-y-6">
          <StatusFlowSection
            status={order.status}
            busy={statusBusy}
            error={statusError}
            onChange={changeStatus}
          />

          <TrackingSection
            orderId={order.id}
            orderStatus={order.status}
            shipment={shipment}
            onChange={(nextShipment, nextStatus) => {
              setOrder((o) =>
                o
                  ? { ...o, shipments: nextShipment ? [nextShipment] : [], status: nextStatus }
                  : o
              );
              refreshEvents();
            }}
          />

          <RefundSection
            orderId={order.id}
            orderNo={order.order_no}
            status={order.status}
            ledger={refund}
            onDone={(nextStatus, nextLedger) => {
              setOrder((o) => {
                if (!o) return o;
                // 주문이 마감되면 결제 표시도 함께 맞춘다
                const closed = ["cancelled", "refunded"].includes(nextStatus);
                return {
                  ...o,
                  status: nextStatus,
                  payments: closed
                    ? o.payments.map((p) =>
                        p.status === "paid" || p.status === "partial_refunded"
                          ? { ...p, status: "refunded" as const }
                          : p
                      )
                    : o.payments,
                };
              });
              if (nextLedger) setRefund(nextLedger);
              // 환불은 이력을 남긴다 — 서버가 새로 적은 이력을 받아 온다
              refreshEvents();
            }}
          />

          <OrderTimeline events={events} memoKinds={memoKinds} onAdd={addEvent} />

          <OrderMemoSection value={memo} status={memoStatus} onChange={onMemoChange} />
        </div>
      </div>

      <ShippingEditModal
        open={shippingOpen}
        orderStatus={order.status}
        recipient={order.recipient}
        onClose={() => setShippingOpen(false)}
        onSave={saveRecipient}
      />
    </div>
  );
}
