import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { isUuid, jsonError, optText, readBody } from "../../_lib/validate";

/* ============================================================
   /api/admin/vip/members/[id] — VIP 멤버 수정/해제
   ============================================================ */

const MEMBER_SELECT =
  "*, profiles(id, email, name, phone), vip_groups(id, name, discount_rate, is_active)";

/** PATCH — { group_id?, note? } */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  if (!isUuid(id)) return jsonError("존재하지 않는 멤버입니다.", 404);

  const body = await readBody(req);
  if (!body) return jsonError("잘못된 요청입니다.");

  const patch: Record<string, unknown> = {};

  if ("group_id" in body) {
    if (!isUuid(body.group_id)) return jsonError("배정할 그룹을 선택해 주세요.");
    const { data: group } = await auth.service
      .from("vip_groups")
      .select("id")
      .eq("id", body.group_id)
      .maybeSingle();
    if (!group) return jsonError("존재하지 않는 그룹입니다.", 404);
    patch.group_id = body.group_id;
  }
  if ("note" in body) {
    const note = optText(body.note, 200);
    if (note === undefined) return jsonError("메모는 200자 이내로 입력해 주세요.");
    patch.note = note;
  }

  if (Object.keys(patch).length === 0) return jsonError("변경할 내용이 없습니다.");

  const { data, error } = await auth.service
    .from("vip_members")
    .update(patch)
    .eq("id", id)
    .select(MEMBER_SELECT)
    .maybeSingle();

  if (error) return jsonError("멤버 수정에 실패했습니다.", 500);
  if (!data) return jsonError("존재하지 않는 멤버입니다.", 404);

  return NextResponse.json({ member: data });
}

/** DELETE — 멤버십 해제 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  if (!isUuid(id)) return jsonError("존재하지 않는 멤버입니다.", 404);

  const { error } = await auth.service.from("vip_members").delete().eq("id", id);
  if (error) return jsonError("멤버 해제에 실패했습니다.", 500);

  return NextResponse.json({ ok: true });
}
