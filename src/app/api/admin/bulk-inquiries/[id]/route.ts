import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import type { BulkInquiryStatus } from "@/lib/types";

const STATUSES: BulkInquiryStatus[] = ["new", "contacted", "quoted", "closed", "spam"];

/** PATCH /api/admin/bulk-inquiries/[id] — 처리 상태·메모 갱신 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status as BulkInquiryStatus)) {
      return NextResponse.json({ error: "처리 상태가 올바르지 않습니다." }, { status: 400 });
    }
    patch.status = body.status;
    // '신규 접수'를 벗어나는 순간이 실제로 처리에 착수한 시점이다
    patch.handled_at = body.status === "new" ? null : new Date().toISOString();
    patch.handled_by = body.status === "new" ? null : auth.user.id;
  }

  if (body.admin_memo !== undefined) {
    const memo = typeof body.admin_memo === "string" ? body.admin_memo.trim().slice(0, 2000) : "";
    patch.admin_memo = memo || null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "변경할 내용이 없습니다." }, { status: 400 });
  }

  const { data, error } = await auth.service
    .from("bulk_inquiries")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "문의를 찾을 수 없습니다." }, { status: 404 });

  return NextResponse.json({ inquiry: data });
}

/** DELETE /api/admin/bulk-inquiries/[id] */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;

  const { error } = await auth.service.from("bulk_inquiries").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
