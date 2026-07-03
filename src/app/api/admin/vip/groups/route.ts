import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { jsonError, optText, rateNum, readBody } from "../_lib/validate";

/* ============================================================
   /api/admin/vip/groups — VIP 그룹 목록/생성
   ============================================================ */

interface CountAgg {
  count: number;
}

/** GET — 그룹 전체 목록 (멤버 수/코드 수 포함) */
export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { data, error } = await auth.service
    .from("vip_groups")
    .select("*, vip_members(count), vip_access_codes(count)")
    .order("created_at", { ascending: true });

  if (error) return jsonError("그룹 목록을 불러오지 못했습니다.", 500);

  const groups = (data ?? []).map((row) => {
    const { vip_members, vip_access_codes, ...group } = row as Record<string, unknown> & {
      vip_members: CountAgg[];
      vip_access_codes: CountAgg[];
    };
    return {
      ...group,
      discount_rate: Number(group.discount_rate) || 0,
      member_count: vip_members?.[0]?.count ?? 0,
      code_count: vip_access_codes?.[0]?.count ?? 0,
    };
  });

  return NextResponse.json({ groups });
}

/** POST — 그룹 생성 { name, description?, discount_rate?, is_active? } */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const body = await readBody(req);
  if (!body) return jsonError("잘못된 요청입니다.");

  const name = optText(body.name, 50);
  if (!name) return jsonError("그룹 이름을 입력해 주세요. (50자 이내)");

  const description = optText(body.description, 300);
  if (description === undefined) return jsonError("그룹 설명은 300자 이내로 입력해 주세요.");

  const discountRate = body.discount_rate === undefined ? 0 : rateNum(body.discount_rate);
  if (discountRate === undefined) return jsonError("할인율은 0~100 사이 숫자여야 합니다.");

  const isActive = typeof body.is_active === "boolean" ? body.is_active : true;

  const { data, error } = await auth.service
    .from("vip_groups")
    .insert({
      name,
      description,
      discount_rate: discountRate,
      is_active: isActive,
    })
    .select("*")
    .single();

  if (error || !data) return jsonError("그룹 생성에 실패했습니다.", 500);

  return NextResponse.json(
    {
      group: {
        ...data,
        discount_rate: Number(data.discount_rate) || 0,
        member_count: 0,
        code_count: 0,
      },
    },
    { status: 201 }
  );
}
