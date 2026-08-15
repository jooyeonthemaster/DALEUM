import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

/** GET /api/admin/bulk-inquiries?status=new&q=… — 견적 문의 목록 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const q = sp.get("q")?.trim();

  let query = auth.service
    .from("bulk_inquiries")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(200);

  if (status && status !== "all") query = query.eq("status", status);
  if (q) query = query.or(`company.ilike.%${q}%,contact_name.ilike.%${q}%,email.ilike.%${q}%`);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 상태별 건수 — 탭 배지용
  const { data: allRows } = await auth.service.from("bulk_inquiries").select("status");
  const counts: Record<string, number> = {};
  for (const r of allRows ?? []) counts[r.status] = (counts[r.status] ?? 0) + 1;

  return NextResponse.json({ inquiries: data ?? [], total: count ?? 0, counts });
}
