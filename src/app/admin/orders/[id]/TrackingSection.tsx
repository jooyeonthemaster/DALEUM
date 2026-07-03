"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Select, Input, Help } from "@/components/admin/Field";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { CARRIERS, getCarrier, isValidTrackingNo, normalizeTrackingNo } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import type { OrderStatus, Shipment } from "@/lib/types";

/* ============================================================
   운송장 섹션 — 등록 = 발송 신호 (paid/preparing → shipped 자동 전환).
   delivered에서 역행 금지, 취소/환불 주문은 서버가 409로 거절한다.
   ============================================================ */

interface TrackingSectionProps {
  orderId: string;
  orderStatus: OrderStatus;
  shipment: Shipment | null;
  onChange: (shipment: Shipment | null, orderStatus: OrderStatus) => void;
}

/** 택배사별 운송장 자릿수 안내 */
const FORMAT_HINTS: Record<string, string> = {
  "kr.epost": "숫자 13자리",
  "kr.logen": "숫자 11자리",
};
function formatHint(code: string): string {
  return FORMAT_HINTS[code] ?? "숫자 10~12자리";
}

export default function TrackingSection({
  orderId,
  orderStatus,
  shipment,
  onChange,
}: TrackingSectionProps) {
  const [editing, setEditing] = useState(false);
  const [carrierCode, setCarrierCode] = useState(CARRIERS[0].code);
  const [trackingNo, setTrackingNo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const blocked = ["cancelled", "refunded"].includes(orderStatus);
  const normalized = normalizeTrackingNo(trackingNo);
  const valid = normalized.length > 0 && isValidTrackingNo(carrierCode, normalized);
  const showFormatError = normalized.length > 0 && !valid;

  function startEdit() {
    if (shipment) {
      setCarrierCode(shipment.carrier_code);
      setTrackingNo(shipment.tracking_no);
    }
    setError(null);
    setEditing(true);
  }

  async function submit() {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/tracking`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carrierCode, trackingNo: normalized }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "운송장을 등록하지 못했습니다.");
      onChange(json.shipment as Shipment, json.orderStatus as OrderStatus);
      setEditing(false);
      setTrackingNo("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "운송장을 등록하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    const res = await fetch(`/api/admin/orders/${orderId}/tracking`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "운송장을 삭제하지 못했습니다.");
      throw new Error(json.error);
    }
    onChange(null, (json.orderStatus as OrderStatus) ?? orderStatus);
    setEditing(false);
  }

  const registeredView = shipment && !editing;
  const carrier = shipment ? getCarrier(shipment.carrier_code) : undefined;

  return (
    <section className="border border-ink-200 bg-cream-50">
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 hairline-b">
        <h2 className="label-caps text-ink-400">운송장</h2>
        {registeredView && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={startEdit}
              className="text-xs text-ink-600 transition-colors hover:text-forest-700"
            >
              수정
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-xs text-signal-red transition-colors hover:opacity-70"
            >
              삭제
            </button>
          </div>
        )}
      </div>

      <div className="p-5">
        {blocked && !shipment ? (
          <p className="text-sm text-ink-400">
            취소/환불된 주문에는 운송장을 등록할 수 없습니다.
          </p>
        ) : registeredView ? (
          /* ---------- 등록됨 ---------- */
          <div>
            <p className="text-sm font-medium text-ink-900">{shipment.carrier_name}</p>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="krw text-base text-ink-900">{shipment.tracking_no}</span>
              {carrier && (
                <a
                  href={carrier.trackingUrl(shipment.tracking_no)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="배송 조회 (새 탭)"
                  className="p-0.5 text-forest-700 transition-colors hover:text-forest-800"
                >
                  <ExternalLink size={16} strokeWidth={1.5} />
                </a>
              )}
            </div>
            {shipment.shipped_at && (
              <p className="krw mt-2 text-xs text-ink-400">
                {formatDateTime(shipment.shipped_at)} 발송 처리
              </p>
            )}
            {error && <Help tone="error">{error}</Help>}
          </div>
        ) : (
          /* ---------- 등록/수정 폼 ---------- */
          <div className="space-y-3">
            <Select
              value={carrierCode}
              onChange={(e) => setCarrierCode(e.target.value)}
              aria-label="택배사 선택"
            >
              {CARRIERS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Input
              value={trackingNo}
              inputMode="numeric"
              placeholder={`운송장 번호 (${formatHint(carrierCode)})`}
              onChange={(e) => setTrackingNo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            {showFormatError && (
              <Help tone="error">
                {getCarrier(carrierCode)?.name} 운송장은 {formatHint(carrierCode)}입니다.
              </Help>
            )}
            {error && <Help tone="error">{error}</Help>}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={submit}
                disabled={!valid || saving}
                className="bg-forest-700 px-4 py-2.5 text-sm text-cream-50 transition-colors hover:bg-forest-800 disabled:opacity-50"
              >
                {saving ? "저장 중…" : shipment ? "저장" : "등록"}
              </button>
              {editing && (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setError(null);
                  }}
                  disabled={saving}
                  className="border border-ink-200 bg-cream-50 px-4 py-2.5 text-sm text-ink-700 transition-colors hover:bg-cream-100 disabled:opacity-50"
                >
                  취소
                </button>
              )}
            </div>
            {!shipment && !blocked && (
              <Help>등록하면 결제완료·준비중 주문은 배송중으로 자동 전환됩니다.</Help>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title="운송장 삭제"
        description={"등록된 운송장을 삭제합니다.\n주문 상태는 변경되지 않습니다."}
        confirmLabel="삭제"
        danger
      />
    </section>
  );
}
