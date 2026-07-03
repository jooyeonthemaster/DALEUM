import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Supabase 인증 콜백 — 이메일 확인 링크 등으로 진입.
 * code를 세션으로 교환한 뒤 next 파라미터 경로로 이동한다.
 * 가입 시 메타데이터에 담아둔 마케팅 수신 동의를 프로필에 1회 동기화한다.
 */

/** 오픈 리다이렉트 방지 — 내부 경로만 허용 */
function sanitizeNext(raw: string | null): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = sanitizeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // 가입 폼에서 선택한 마케팅 수신 동의를 프로필에 반영 (트리거는 name/phone만 생성)
      const optIn = data.user.user_metadata?.marketing_opt_in;
      if (typeof optIn === "boolean") {
        await supabase
          .from("profiles")
          .update({ marketing_opt_in: optIn })
          .eq("id", data.user.id);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // code 누락 또는 교환 실패 — 로그인 화면에서 안내
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
