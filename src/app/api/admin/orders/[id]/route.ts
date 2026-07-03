import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { isUuid, cleanStr } from "@/lib/orders";
import { ADMIN_SETTABLE_STATUSES } from "@/lib/constants";
import type { OrderStatus } from "@/lib/types";

/**
 * GET   /api/admin/orders/[id] — 주문 상세 (상품 라인 + 결제 + 운송장 + 고객)
 * PATCH /api/admin/orders/[id] — 상태 변경(ADMIN_SETTABLE_STATUSES만) / 관리자 메모 저장
 *   - cancelled/refunded 주문의 상태는 변경 불가 (환불 API 경유) → 409
 */

export async function GET(
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

  const { data: order, error } = await service
    .from("orders")
    .select("*, order_items(*), payments(*), shipments(*)")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[admin/orders/:id] 조회 실패:", error.message);
    return NextResponse.json({ error: "주문을 불러오지 못했습니다." }, { status: 500 });
  }
  if (!order) {
    return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  }

  // 회원 주문이면 고객 프로필 링크 정보
  let customer: { id: string; name: string | null; email: string | null } | null = null;
  if (order.user_id) {
    const { data: profile } = await service
      .from("profiles")
      .select("id, name, email")
      .eq("id", order.user_id)
      .maybeSingle();
    customer = profile ?? null;
  }

  return NextResponse.json({ order, customer });
}

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

  const wantsStatus = body.status !== undefined;
  const wantsMemo = "adminMemo" in body;
  if (!wantsStatus && !wantsMemo) {
    return NextResponse.json({ error: "변경할 내용이 없습니다." }, { status: 400 });
  }

  // ---------- 입력 검증 ----------
  let nextStatus: OrderStatus | null = null;
  if (wantsStatus) {
    const s = body.status;
    if (typeof s !== "string" || !ADMIN_SETTABLE_STATUSES.includes(s as OrderStatus)) {
      return NextResponse.json(
        { error: "설정할 수 없는 상태입니다. 취소/환불은 환불 처리로 진행해 주세요." },
        { status: 400 }
      );
    }
    nextStatus = s as OrderStatus;
  }

  const { data: current } = await service
    .from("orders")
    .select("id, status, paid_at")
    .eq("id", id)
    .maybeSingle();
  if (!current) {
    return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  }

  if (nextStatus && ["cancelled", "refunded"].includes(current.status)) {
    return NextResponse.json(
      { error: "취소/환불된 주문의 상태는 변경할 수 없습니다." },
      { status: 409 }
    );
  }

  // ---------- 업데이트 ----------
  const updates: Record<string, unknown> = {};
  if (nextStatus) {
    updates.status = nextStatus;
    // 수동으로 결제완료 처리 시 결제 시각 보정 (무통장 등 예외 운영)
    if (nextStatus === "paid" && !current.paid_at) {
      updates.paid_at = new Date().toISOString();
    }
  }
  if (wantsMemo) {
    updates.admin_memo = cleanStr(body.adminMemo, 4000);
  }

  const { data: updated, error } = await service
    .from("orders")
    .update(updates)
    .eq("id", id)
    .select("id, status, admin_memo, paid_at, updated_at")
    .maybeSingle();

  if (error || !updated) {
    console.error("[admin/orders/:id] 수정 실패:", error?.message);
    return NextResponse.json({ error: "주문 정보를 저장하지 못했습니다." }, { status: 500 });
  }

  return NextResponse.json({ order: updated });
}
