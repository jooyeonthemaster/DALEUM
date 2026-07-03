import { NextResponse } from "next/server";
import { createClient } from "./supabase/server";
import { createServiceClient } from "./supabase/service";

/**
 * API 라우트용 관리자 검증.
 * 성공 시 service role 클라이언트 반환, 실패 시 NextResponse(401/403) 반환.
 */
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    return { error: NextResponse.json({ error: "관리자 권한이 없습니다." }, { status: 403 }) };
  }

  return { service: createServiceClient(), user };
}

/** 로그인 사용자 검증 (마이페이지 API 등) */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }) };
  }
  return { supabase, user };
}
