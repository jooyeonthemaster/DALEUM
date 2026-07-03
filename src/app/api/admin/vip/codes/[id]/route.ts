import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { isUuid, isoDate, jsonError, optText, posInt, readBody } from "../../_lib/validate";

/* ============================================================
   /api/admin/vip/codes/[id] — VIP 입장 코드 수정/삭제
   ============================================================ */

const CODE_SELECT = "*, vip_groups(id, name)";

/** PATCH — { label?, max_uses?, expires_at?, is_active?, group_id? } */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  if (!isUuid(id)) return jsonError("존재하지 않는 코드입니다.", 404);

  const body = await readBody(req);
  if (!body) return jsonError("잘못된 요청입니다.");

  const patch: Record<string, unknown> = {};

  if ("label" in body) {
    const label = optText(body.label, 100);
    if (label === undefined) return jsonError("라벨은 100자 이내로 입력해 주세요.");
    patch.label = label;
  }
  if ("max_uses" in body) {
    if (body.max_uses === null || body.max_uses === "") {
      patch.max_uses = null;
    } else {
      const parsed = posInt(body.max_uses, 1_000_000);
      if (parsed === undefined) return jsonError("최대 사용 횟수는 1 이상의 정수여야 합니다.");
      patch.max_uses = parsed;
    }
  }
  if ("expires_at" in body) {
    const expiresAt = isoDate(body.expires_at);
    if (expiresAt === undefined) return jsonError("만료일 형식이 올바르지 않습니다.");
    patch.expires_at = expiresAt;
  }
  if ("is_active" in body) {
    if (typeof body.is_active !== "boolean") return jsonError("잘못된 요청입니다.");
    patch.is_active = body.is_active;
  }
  if ("group_id" in body) {
    if (!isUuid(body.group_id)) return jsonError("연결할 그룹을 선택해 주세요.");
    const { data: group } = await auth.service
      .from("vip_groups")
      .select("id")
      .eq("id", body.group_id)
      .maybeSingle();
    if (!group) return jsonError("존재하지 않는 그룹입니다.", 404);
    patch.group_id = body.group_id;
  }

  if (Object.keys(patch).length === 0) return jsonError("변경할 내용이 없습니다.");

  const { data, error } = await auth.service
    .from("vip_access_codes")
    .update(patch)
    .eq("id", id)
    .select(CODE_SELECT)
    .maybeSingle();

  if (error) return jsonError("코드 수정에 실패했습니다.", 500);
  if (!data) return jsonError("존재하지 않는 코드입니다.", 404);

  return NextResponse.json({ code: data });
}

/** DELETE — 코드 삭제 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  if (!isUuid(id)) return jsonError("존재하지 않는 코드입니다.", 404);

  const { error } = await auth.service.from("vip_access_codes").delete().eq("id", id);
  if (error) return jsonError("코드 삭제에 실패했습니다.", 500);

  return NextResponse.json({ ok: true });
}
