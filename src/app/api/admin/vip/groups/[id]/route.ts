import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { isUuid, jsonError, optText, rateNum, readBody } from "../../_lib/validate";

/* ============================================================
   /api/admin/vip/groups/[id] — VIP 그룹 수정/삭제
   ============================================================ */

/** PATCH — 부분 수정 { name?, description?, discount_rate?, is_active? } */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  if (!isUuid(id)) return jsonError("존재하지 않는 그룹입니다.", 404);

  const body = await readBody(req);
  if (!body) return jsonError("잘못된 요청입니다.");

  const patch: Record<string, unknown> = {};

  if ("name" in body) {
    const name = optText(body.name, 50);
    if (!name) return jsonError("그룹 이름을 입력해 주세요. (50자 이내)");
    patch.name = name;
  }
  if ("description" in body) {
    const description = optText(body.description, 300);
    if (description === undefined) return jsonError("그룹 설명은 300자 이내로 입력해 주세요.");
    patch.description = description;
  }
  if ("discount_rate" in body) {
    const rate = rateNum(body.discount_rate);
    if (rate === undefined) return jsonError("할인율은 0~100 사이 숫자여야 합니다.");
    patch.discount_rate = rate;
  }
  if ("is_active" in body) {
    if (typeof body.is_active !== "boolean") return jsonError("잘못된 요청입니다.");
    patch.is_active = body.is_active;
  }

  if (Object.keys(patch).length === 0) return jsonError("변경할 내용이 없습니다.");

  const { data, error } = await auth.service
    .from("vip_groups")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) return jsonError("그룹 수정에 실패했습니다.", 500);
  if (!data) return jsonError("존재하지 않는 그룹입니다.", 404);

  return NextResponse.json({
    group: { ...data, discount_rate: Number(data.discount_rate) || 0 },
  });
}

/** DELETE — 그룹 삭제 (멤버/코드/전용 가격은 FK cascade로 함께 삭제) */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  if (!isUuid(id)) return jsonError("존재하지 않는 그룹입니다.", 404);

  const { error } = await auth.service.from("vip_groups").delete().eq("id", id);
  if (error) return jsonError("그룹 삭제에 실패했습니다.", 500);

  return NextResponse.json({ ok: true });
}
