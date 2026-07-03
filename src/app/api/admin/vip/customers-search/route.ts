import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { jsonError, sanitizeSearch } from "../_lib/validate";

/* ============================================================
   GET /api/admin/vip/customers-search?q=
   이름/이메일로 고객(profiles) 검색 — 최대 10명
   ============================================================ */

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const raw = new URL(req.url).searchParams.get("q") ?? "";
  const q = sanitizeSearch(raw).slice(0, 50);
  if (!q) return NextResponse.json({ customers: [] });

  const { data, error } = await auth.service
    .from("profiles")
    .select("id, name, email, phone")
    .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) return jsonError("고객 검색에 실패했습니다.", 500);
  return NextResponse.json({ customers: data ?? [] });
}
