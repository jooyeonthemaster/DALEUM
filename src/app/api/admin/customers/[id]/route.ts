import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { isUuid, cleanStr } from "@/lib/orders";

/**
 * GET   /api/admin/customers/[id] — 고객 상세 (프로필 + VIP + 주문 이력 + 배송지 + 리뷰)
 * PATCH /api/admin/customers/[id] — 관리자 메모(profiles.memo) 저장
 */

/** 구매 실적으로 집계하는 주문 상태 */
const PURCHASE_STATUSES = ["paid", "preparing", "shipped", "delivered", "confirmed"];
const ORDERS_LIMIT = 30;
const REVIEWS_LIMIT = 20;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "고객을 찾을 수 없습니다." }, { status: 404 });
  }

  const { data: customer, error } = await service
    .from("profiles")
    .select("id, email, name, phone, role, marketing_opt_in, memo, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[admin/customers/:id] 조회 실패:", error.message);
    return NextResponse.json({ error: "고객 정보를 불러오지 못했습니다." }, { status: 500 });
  }
  if (!customer) {
    return NextResponse.json({ error: "고객을 찾을 수 없습니다." }, { status: 404 });
  }

  const [vipRes, vipPriceRes, ordersRes, statRes, addressRes, reviewRes] = await Promise.all([
    service
      .from("vip_members")
      .select("note, created_at, vip_groups(id, name, discount_rate)")
      .eq("user_id", id)
      .maybeSingle(),
    service
      .from("vip_product_prices")
      .select("id", { count: "exact", head: true })
      .eq("user_id", id)
      .eq("is_active", true),
    service
      .from("orders")
      .select("id, order_no, created_at, status, total, order_items(name_snapshot, qty)", {
        count: "exact",
      })
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(ORDERS_LIMIT),
    service.from("orders").select("total, status").eq("user_id", id).in("status", PURCHASE_STATUSES),
    service
      .from("addresses")
      .select("*")
      .eq("user_id", id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false }),
    service
      .from("reviews")
      .select("id, rating, content, image_urls, is_hidden, admin_reply, created_at, products(name, slug)")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(REVIEWS_LIMIT),
  ]);

  // VIP 멤버십 정리
  let vip: {
    group_id: string;
    group_name: string;
    discount_rate: number;
    note: string | null;
    custom_price_count: number;
  } | null = null;
  if (vipRes.data) {
    const raw = vipRes.data as unknown as {
      note: string | null;
      vip_groups: { id: string; name: string; discount_rate: number } | { id: string; name: string; discount_rate: number }[] | null;
    };
    const g = Array.isArray(raw.vip_groups) ? raw.vip_groups[0] : raw.vip_groups;
    if (g) {
      vip = {
        group_id: g.id,
        group_name: g.name,
        discount_rate: Number(g.discount_rate),
        note: raw.note,
        custom_price_count: vipPriceRes.count ?? 0,
      };
    }
  }

  // 구매 실적 집계
  const purchases = (statRes.data ?? []) as { total: number }[];
  const stats = {
    order_count: purchases.length,
    total_spent: purchases.reduce((sum, o) => sum + o.total, 0),
  };

  return NextResponse.json({
    customer,
    vip,
    stats,
    orders: ordersRes.data ?? [],
    ordersTotal: ordersRes.count ?? 0,
    addresses: addressRes.data ?? [],
    reviews: reviewRes.data ?? [],
  });
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
    return NextResponse.json({ error: "고객을 찾을 수 없습니다." }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!("memo" in body)) {
    return NextResponse.json({ error: "변경할 내용이 없습니다." }, { status: 400 });
  }

  const { data: updated, error } = await service
    .from("profiles")
    .update({ memo: cleanStr(body.memo, 4000) })
    .eq("id", id)
    .select("id, memo, updated_at")
    .maybeSingle();

  if (error || !updated) {
    console.error("[admin/customers/:id] 메모 저장 실패:", error?.message);
    return NextResponse.json({ error: "메모를 저장하지 못했습니다." }, { status: 500 });
  }

  return NextResponse.json({ customer: updated });
}
