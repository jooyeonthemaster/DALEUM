import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

/**
 * GET /api/admin/customers — 고객 목록 (주문수/누적구매액/VIP 집계 포함).
 * 쿼리: q(이름/이메일/연락처), sort(recent|oldest|name), page, pageSize
 * 집계는 현재 페이지 고객에 대해서만 수행한다 (대량 데이터 대비).
 */

/** 구매 실적으로 집계하는 주문 상태 (취소/환불/미결제 제외) */
const PURCHASE_STATUSES = ["paid", "preparing", "shipped", "delivered", "confirmed"];

const SORTS: Record<string, { column: string; ascending: boolean }> = {
  recent: { column: "created_at", ascending: false },
  oldest: { column: "created_at", ascending: true },
  name: { column: "name", ascending: true },
};

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").replace(/[,()]/g, "").trim().slice(0, 50);
  const sort = SORTS[sp.get("sort") ?? "recent"] ?? SORTS.recent;
  const page = Math.max(1, Number.parseInt(sp.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(sp.get("pageSize") ?? "20", 10) || 20));

  // ---------- 고객 페이지 조회 ----------
  let query = service
    .from("profiles")
    .select("id, email, name, phone, created_at", { count: "exact" })
    .eq("role", "customer");

  if (q) {
    const parts = [`name.ilike.%${q}%`, `email.ilike.%${q}%`, `phone.ilike.%${q}%`];
    const digits = q.replace(/\D/g, "");
    if (digits.length >= 4 && digits !== q) parts.push(`phone.ilike.%${digits}%`);
    query = query.or(parts.join(","));
  }

  const fromIdx = (page - 1) * pageSize;
  const { data: profiles, count, error } = await query
    .order(sort.column, { ascending: sort.ascending, nullsFirst: false })
    .range(fromIdx, fromIdx + pageSize - 1);

  if (error) {
    console.error("[admin/customers] 목록 조회 실패:", error.message);
    return NextResponse.json({ error: "고객 목록을 불러오지 못했습니다." }, { status: 500 });
  }

  const rows = profiles ?? [];
  const ids = rows.map((p) => p.id);

  // ---------- 주문 집계 + VIP 멤버십 (페이지 내 고객만) ----------
  const orderStats = new Map<string, { count: number; spent: number }>();
  const vipGroups = new Map<string, string>();

  if (ids.length > 0) {
    const [ordersRes, vipRes] = await Promise.all([
      service
        .from("orders")
        .select("user_id, total, status")
        .in("user_id", ids)
        .in("status", PURCHASE_STATUSES),
      service.from("vip_members").select("user_id, vip_groups(name)").in("user_id", ids),
    ]);

    for (const o of (ordersRes.data ?? []) as { user_id: string; total: number }[]) {
      const prev = orderStats.get(o.user_id) ?? { count: 0, spent: 0 };
      prev.count += 1;
      prev.spent += o.total;
      orderStats.set(o.user_id, prev);
    }

    for (const m of (vipRes.data ?? []) as unknown as {
      user_id: string;
      vip_groups: { name: string } | { name: string }[] | null;
    }[]) {
      const g = Array.isArray(m.vip_groups) ? m.vip_groups[0] : m.vip_groups;
      if (g?.name) vipGroups.set(m.user_id, g.name);
    }
  }

  const customers = rows.map((p) => ({
    ...p,
    order_count: orderStats.get(p.id)?.count ?? 0,
    total_spent: orderStats.get(p.id)?.spent ?? 0,
    vip_group: vipGroups.get(p.id) ?? null,
  }));

  const total = count ?? 0;
  return NextResponse.json({
    customers,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}
