import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  generateCode,
  isUniqueViolation,
  isUuid,
  isoDate,
  jsonError,
  normalizeCode,
  optText,
  posInt,
  readBody,
} from "../_lib/validate";

/* ============================================================
   /api/admin/vip/codes — VIP 입장 코드 목록/생성
   ============================================================ */

const CODE_SELECT = "*, vip_groups(id, name)";

/** GET — 코드 전체 목록 */
export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.service
    .from("vip_access_codes")
    .select(CODE_SELECT)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) return jsonError("코드 목록을 불러오지 못했습니다.", 500);
  return NextResponse.json({ codes: data ?? [] });
}

/** POST — 코드 생성 { code?, group_id, label?, max_uses?, expires_at? } */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const body = await readBody(req);
  if (!body) return jsonError("잘못된 요청입니다.");

  if (!isUuid(body.group_id)) return jsonError("코드를 연결할 그룹을 선택해 주세요.");

  const label = optText(body.label, 100);
  if (label === undefined) return jsonError("메모는 100자 이내로 넣어 주세요.");

  let maxUses: number | null = null;
  if (body.max_uses !== undefined && body.max_uses !== null && body.max_uses !== "") {
    const parsed = posInt(body.max_uses, 1_000_000);
    if (parsed === undefined) return jsonError("사용 가능 횟수는 1 이상의 정수로 넣어 주세요.");
    maxUses = parsed;
  }

  const expiresAt = isoDate(body.expires_at);
  if (expiresAt === undefined) return jsonError("만료일 형식이 올바르지 않습니다.");

  // 수동 입력 코드 검증
  const hasManualCode = typeof body.code === "string" && body.code.trim() !== "";
  let manualCode: string | null = null;
  if (hasManualCode) {
    const normalized = normalizeCode(body.code);
    if (!normalized) return jsonError("코드는 영문 대문자·숫자 4~20자로 입력해 주세요.");
    manualCode = normalized;
  }

  const { data: group } = await auth.service
    .from("vip_groups")
    .select("id")
    .eq("id", body.group_id)
    .maybeSingle();
  if (!group) return jsonError("존재하지 않는 그룹입니다.", 404);

  // 자동 생성 코드는 충돌 시 재시도
  const attempts = manualCode ? 1 : 5;
  for (let i = 0; i < attempts; i++) {
    const code = manualCode ?? generateCode(8);
    const { data, error } = await auth.service
      .from("vip_access_codes")
      .insert({
        code,
        group_id: body.group_id,
        label,
        max_uses: maxUses,
        expires_at: expiresAt,
        is_active: typeof body.is_active === "boolean" ? body.is_active : true,
      })
      .select(CODE_SELECT)
      .single();

    if (!error && data) return NextResponse.json({ code: data }, { status: 201 });
    if (!isUniqueViolation(error)) return jsonError("코드 생성에 실패했습니다.", 500);
    if (manualCode) return jsonError("이미 사용 중인 코드입니다. 다른 코드를 입력해 주세요.", 409);
  }

  return jsonError("코드 생성에 실패했습니다. 다시 시도해 주세요.", 500);
}
