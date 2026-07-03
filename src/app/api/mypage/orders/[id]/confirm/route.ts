import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { isUuid } from "@/lib/orders";

/**
 * 구매 확정 — 배송 완료(delivered) 주문을 소유자 본인이 confirmed로 전환.
 * 멱등: 이미 confirmed면 200. delivered가 아니면 400.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  }

  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const service = createServiceClient();
  const { data: order } = await service
    .from("orders")
    .select("id, user_id, status")
    .eq("id", id)
    .maybeSingle();

  if (!order) {
    return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  }
  if (order.user_id !== user.id) {
    return NextResponse.json(
      { error: "본인 주문만 구매 확정할 수 있습니다." },
      { status: 403 }
    );
  }
  if (order.status === "confirmed") {
    return NextResponse.json({ orderId: order.id, status: "confirmed" }); // 멱등
  }
  if (order.status !== "delivered") {
    return NextResponse.json(
      { error: "배송 완료된 주문만 구매 확정할 수 있습니다." },
      { status: 400 }
    );
  }

  // 조건부 전환 — 동시 호출에도 정확히 1회만
  const { data: claimed, error } = await service
    .from("orders")
    .update({ status: "confirmed" })
    .eq("id", order.id)
    .eq("status", "delivered")
    .select("id");

  if (error) {
    console.error(`[mypage/confirm] 상태 전환 실패 order=${order.id}:`, error.message);
    return NextResponse.json(
      { error: "구매 확정에 실패했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 }
    );
  }

  if (!claimed || claimed.length === 0) {
    // 동시 처리 등으로 상태가 이미 바뀜 — 최신 상태 확인
    const { data: latest } = await service
      .from("orders")
      .select("status")
      .eq("id", order.id)
      .maybeSingle();
    if (latest?.status === "confirmed") {
      return NextResponse.json({ orderId: order.id, status: "confirmed" });
    }
    return NextResponse.json(
      { error: "주문 상태가 변경되어 구매 확정할 수 없습니다." },
      { status: 409 }
    );
  }

  return NextResponse.json({ orderId: order.id, status: "confirmed" });
}
