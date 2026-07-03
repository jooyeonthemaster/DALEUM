import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { VIP_CODE_COOKIE } from "@/lib/constants";

/**
 * VIP 입장 코드 검증.
 * POST { code } → 성공 시 httpOnly 쿠키(daleum_vip_code, 30일) 설정 후
 *                 { group: { name, discount_rate } } 반환. 실패는 404 { error }.
 * DELETE → 쿠키 제거 (VIP 로그아웃)
 */

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30일

interface CodeRow {
  code: string;
  is_active: boolean;
  expires_at: string | null;
  max_uses: number | null;
  used_count: number;
  vip_groups: { name: string; discount_rate: number; is_active: boolean } | null;
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const raw = typeof body.code === "string" ? body.code.trim() : "";
  if (!raw || raw.length > 50) {
    return NextResponse.json({ error: "코드를 입력해 주세요." }, { status: 400 });
  }
  const code = raw.toUpperCase();

  const service = createServiceClient();
  const { data } = await service
    .from("vip_access_codes")
    .select(
      "code, is_active, expires_at, max_uses, used_count, vip_groups(name, discount_rate, is_active)"
    )
    .eq("code", code)
    .maybeSingle();

  const row = data as unknown as CodeRow | null;
  const group = row?.vip_groups ?? null;

  if (!row || !row.is_active || !group?.is_active) {
    return NextResponse.json({ error: "유효하지 않은 코드입니다." }, { status: 404 });
  }
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return NextResponse.json({ error: "유효 기간이 지난 코드입니다." }, { status: 404 });
  }
  if (row.max_uses != null && row.used_count >= row.max_uses) {
    return NextResponse.json({ error: "사용 가능 횟수가 모두 소진된 코드입니다." }, { status: 404 });
  }

  const res = NextResponse.json({
    group: { name: group.name, discount_rate: Number(group.discount_rate) || 0 },
  });
  res.cookies.set(VIP_CODE_COOKIE, code, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(VIP_CODE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
