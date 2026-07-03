import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { isUniqueViolation, isUuid, jsonError, optText, readBody } from "../_lib/validate";

/* ============================================================
   /api/admin/vip/members — VIP 멤버 목록/배정
   ============================================================ */

const MEMBER_SELECT =
  "*, profiles(id, email, name, phone), vip_groups(id, name, discount_rate, is_active)";

/** GET — 멤버 목록 (?group_id= 필터) */
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const groupId = new URL(req.url).searchParams.get("group_id");

  let query = auth.service
    .from("vip_members")
    .select(MEMBER_SELECT)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (groupId && isUuid(groupId)) query = query.eq("group_id", groupId);

  const { data, error } = await query;
  if (error) return jsonError("멤버 목록을 불러오지 못했습니다.", 500);

  return NextResponse.json({ members: data ?? [] });
}

/** POST — 멤버 배정 { user_id, group_id, note? } */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const body = await readBody(req);
  if (!body) return jsonError("잘못된 요청입니다.");

  if (!isUuid(body.user_id)) return jsonError("배정할 고객을 선택해 주세요.");
  if (!isUuid(body.group_id)) return jsonError("배정할 그룹을 선택해 주세요.");

  const note = optText(body.note, 200);
  if (note === undefined) return jsonError("메모는 200자 이내로 입력해 주세요.");

  // 대상 검증
  const [{ data: profile }, { data: group }] = await Promise.all([
    auth.service.from("profiles").select("id").eq("id", body.user_id).maybeSingle(),
    auth.service.from("vip_groups").select("id").eq("id", body.group_id).maybeSingle(),
  ]);
  if (!profile) return jsonError("존재하지 않는 고객입니다.", 404);
  if (!group) return jsonError("존재하지 않는 그룹입니다.", 404);

  const { data, error } = await auth.service
    .from("vip_members")
    .insert({ user_id: body.user_id, group_id: body.group_id, note })
    .select(MEMBER_SELECT)
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      return jsonError(
        "이미 VIP 그룹에 배정된 고객입니다. 기존 배정을 수정하거나 해제해 주세요.",
        409
      );
    }
    return jsonError("멤버 배정에 실패했습니다.", 500);
  }

  return NextResponse.json({ member: data }, { status: 201 });
}
