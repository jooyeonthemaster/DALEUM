import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { isUuid } from "@/lib/orders";
import { getCarrier, isValidTrackingNo, normalizeTrackingNo } from "@/lib/constants";

/**
 * PATCH  /api/admin/orders/[id]/tracking — 운송장 등록/수정 (shipments upsert)
 *   - 등록 = 발송 신호: paid/preparing 주문은 자동으로 shipped 전환
 *   - delivered/confirmed에서는 절대 역행하지 않는다 (운송장 수정만 반영)
 *   - 취소/환불 주문은 409
 * DELETE /api/admin/orders/[id]/tracking — 운송장 삭제 (주문 상태는 유지)
 */

const BLOCKED_STATUSES = ["cancelled", "refunded"];
/** 운송장 등록 시 shipped로 자동 전환되는 상태 */
const AUTO_SHIP_FROM = ["paid", "preparing"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  // ---------- 입력 검증 ----------
  const carrierCode = typeof body.carrierCode === "string" ? body.carrierCode : "";
  const carrier = getCarrier(carrierCode);
  if (!carrier) {
    return NextResponse.json({ error: "지원하지 않는 택배사입니다." }, { status: 400 });
  }

  const trackingNo = normalizeTrackingNo(
    typeof body.trackingNo === "string" ? body.trackingNo : ""
  );
  if (!trackingNo || !isValidTrackingNo(carrier.code, trackingNo)) {
    return NextResponse.json(
      { error: `${carrier.name} 운송장 번호 형식이 올바르지 않습니다.` },
      { status: 400 }
    );
  }

  // ---------- 주문 상태 확인 ----------
  const { data: order } = await service
    .from("orders")
    .select("id, order_no, status")
    .eq("id", id)
    .maybeSingle();
  if (!order) {
    return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  }
  if (BLOCKED_STATUSES.includes(order.status)) {
    return NextResponse.json(
      { error: "취소/환불된 주문에는 운송장을 등록할 수 없습니다." },
      { status: 409 }
    );
  }

  // ---------- shipments upsert (주문당 1건 운용) ----------
  const now = new Date().toISOString();
  const { data: existing } = await service
    .from("shipments")
    .select("id, shipped_at, status")
    .eq("order_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let shipment;
  if (existing) {
    // 수정: 최초 발송 시각은 보존, 배송완료 상태도 역행하지 않는다
    const { data, error } = await service
      .from("shipments")
      .update({
        carrier_code: carrier.code,
        carrier_name: carrier.name,
        tracking_no: trackingNo,
        status: existing.status === "delivered" ? existing.status : "in_transit",
        shipped_at: existing.shipped_at ?? now,
      })
      .eq("id", existing.id)
      .select("*")
      .maybeSingle();
    if (error || !data) {
      console.error("[admin/orders/tracking] 수정 실패:", error?.message);
      return NextResponse.json({ error: "운송장을 저장하지 못했습니다." }, { status: 500 });
    }
    shipment = data;
  } else {
    const { data, error } = await service
      .from("shipments")
      .insert({
        order_id: id,
        carrier_code: carrier.code,
        carrier_name: carrier.name,
        tracking_no: trackingNo,
        status: "in_transit",
        shipped_at: now,
      })
      .select("*")
      .maybeSingle();
    if (error || !data) {
      console.error("[admin/orders/tracking] 등록 실패:", error?.message);
      return NextResponse.json({ error: "운송장을 등록하지 못했습니다." }, { status: 500 });
    }
    shipment = data;
  }

  // ---------- 상태 자동 전환 (등록 = 발송 신호, 역행 금지) ----------
  let orderStatus: string = order.status;
  if (AUTO_SHIP_FROM.includes(order.status)) {
    const { data: claimed } = await service
      .from("orders")
      .update({ status: "shipped" })
      .eq("id", id)
      .eq("status", order.status)
      .select("id");
    if (claimed && claimed.length > 0) orderStatus = "shipped";
  }

  return NextResponse.json({ shipment, orderStatus });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  }

  const { data: order } = await service
    .from("orders")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (!order) {
    return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  }

  const { data: deleted, error } = await service
    .from("shipments")
    .delete()
    .eq("order_id", id)
    .select("id");

  if (error) {
    console.error("[admin/orders/tracking] 삭제 실패:", error.message);
    return NextResponse.json({ error: "운송장을 삭제하지 못했습니다." }, { status: 500 });
  }
  if (!deleted || deleted.length === 0) {
    return NextResponse.json({ error: "등록된 운송장이 없습니다." }, { status: 404 });
  }

  // 삭제 시 주문 상태는 그대로 유지한다 (역행 금지 원칙)
  return NextResponse.json({ ok: true, orderStatus: order.status });
}
