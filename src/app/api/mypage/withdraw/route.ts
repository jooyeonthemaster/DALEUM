import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * 회원 탈퇴 — 비밀번호로 본인 확인 후 service role로 auth 계정 삭제.
 * profiles/addresses/wishlists/reviews는 FK cascade로 함께 삭제되고,
 * orders.user_id는 set null로 주문 이력은 익명 보존된다.
 *
 * POST body: { password: string }
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // 아래에서 password 누락으로 처리
  }
  const password = typeof body.password === "string" ? body.password : "";
  if (!password) {
    return NextResponse.json({ error: "비밀번호를 입력해 주세요." }, { status: 400 });
  }
  if (!user.email) {
    return NextResponse.json(
      { error: "계정 정보를 확인할 수 없습니다. 고객센터로 문의해 주세요." },
      { status: 400 }
    );
  }

  // 본인 확인 — 세션 쿠키와 무관한 무상태 클라이언트로 비밀번호 검증
  const verifier = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { error: verifyError } = await verifier.auth.signInWithPassword({
    email: user.email,
    password,
  });
  if (verifyError) {
    return NextResponse.json({ error: "비밀번호가 일치하지 않습니다." }, { status: 403 });
  }

  const service = createServiceClient();
  const { error: deleteError } = await service.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error(`[mypage/withdraw] 계정 삭제 실패 user=${user.id}:`, deleteError.message);
    return NextResponse.json(
      { error: "탈퇴 처리에 실패했습니다. 고객센터(031-963-3375)로 문의해 주세요." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
