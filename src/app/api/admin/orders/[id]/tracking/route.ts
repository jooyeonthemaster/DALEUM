import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { isUuid } from "@/lib/orders";
import { getCarrier, isValidTrackingNo, normalizeTrackingNo } from "@/lib/constants";
import { EVENT_KINDS, adminDisplayName } from "../../order-log";
import { appendOrderEvent } from "../../order-memo";

/**
 * PATCH  /api/admin/orders/[id]/tracking — 운송장 등록/수정 (shipments upsert)
 *   - 등록 = 발송 신호: paid/preparing 주문은 자동으로 shipped 전환
 *   - delivered/confirmed에서는 절대 역행하지 않는다 (운송장 수정만 반영)
 *   - 취소/환불 주문은 409
 * DELETE /api/admin/orders/[id]/tracking — 운송장 삭제 (주문 상태는 유지)
 *
 * 두 경로 모두 **처리 이력을 남긴다.**
 * 엑셀 일괄 등록은 이력을 남기는데 손으로 넣은 한 건은 남기지 않아, 같은 주문의 이력만 봐서는
 * 운송장이 언제 누구 손에 붙었는지·왜 번호가 바뀌었는지 알 수 없었다. 특히 삭제는 고객이
 * 조회하던 배송 정보를 없애는 일인데 아무 흔적도 남지 않아, 배송 사고가 났을 때 되짚을 근거가 없었다.
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
  const { service, user } = auth;

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
    // 이력에 "무엇이 무엇으로 바뀌었는지" 를 적으려면 옛 번호도 함께 읽어 둬야 한다
    .select("id, shipped_at, status, carrier_name, tracking_no")
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

  // ---------- 처리 이력 ----------
  // 번호가 바뀐 경우에는 옛 번호를 함께 적는다 — 고객이 조회하던 번호가 왜 달라졌는지가
  // 나중에 배송 사고를 되짚는 유일한 실마리가 된다.
  const changed =
    !existing || existing.tracking_no !== trackingNo || existing.carrier_name !== carrier.name;
  const shipped = orderStatus !== order.status;
  // 같은 번호를 다시 저장한 것뿐이면 이력을 늘리지 않는다 — 의미 없는 줄이 쌓이면 진짜 사건이 묻힌다
  if (changed || shipped) {
    const lines = [
      existing && changed
        ? `${existing.carrier_name} ${existing.tracking_no} → ${carrier.name} ${trackingNo} 으로 바꿨습니다.`
        : changed
          ? `${carrier.name} ${trackingNo} 을(를) 등록했습니다.`
          : `${carrier.name} ${trackingNo}`,
    ];
    if (shipped) lines.push("주문을 배송중으로 바꿨습니다.");
    await appendOrderEvent(service, id, {
      kind: EVENT_KINDS.tracking,
      author: await adminDisplayName(service, user.id),
      body: lines.join("\n"),
    });
  }

  return NextResponse.json({ shipment, orderStatus });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service, user } = auth;

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
    // 지워진 번호를 이력에 적어야 "그때 무슨 번호가 붙어 있었나" 를 되짚을 수 있다
    .select("id, carrier_name, tracking_no");

  if (error) {
    console.error("[admin/orders/tracking] 삭제 실패:", error.message);
    return NextResponse.json({ error: "운송장을 삭제하지 못했습니다." }, { status: 500 });
  }
  if (!deleted || deleted.length === 0) {
    return NextResponse.json({ error: "등록된 운송장이 없습니다." }, { status: 404 });
  }

  const removed = deleted
    .map((s) => `${s.carrier_name ?? ""} ${s.tracking_no ?? ""}`.trim())
    .filter(Boolean)
    .join(", ");
  await appendOrderEvent(service, id, {
    kind: EVENT_KINDS.tracking,
    author: await adminDisplayName(service, user.id),
    body: `${removed || "등록돼 있던 운송장"} 을(를) 삭제했습니다. 고객은 더 이상 배송 조회를 할 수 없습니다. 주문 상태는 그대로 두었습니다.`,
  });

  // 삭제 시 주문 상태는 그대로 유지한다 (역행 금지 원칙)
  return NextResponse.json({ ok: true, orderStatus: order.status });
}
