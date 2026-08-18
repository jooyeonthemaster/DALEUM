import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/* ============================================================
   인증 경계 미들웨어.

   matcher 가 정적 파일을 뺀 모든 요청에 걸리므로, /products 를 한 번 열 때
   발생하는 RSC 프리페치 35건에도 그대로 35번 더 실행된다.
   아래 최적화는 "그 35번을 어디까지 줄여도 안전한가"를 소스로 확인한 결과다.

   ── 확인한 사실 (@supabase/auth-js 2.110.0 / @supabase/ssr 0.12.0 소스) ──

   (1) 세션 쿠키가 없으면 getUser() 는 네트워크 호출을 하지 않는다.
       GoTrueClient._getUser() → _useSession() → __loadSession() 순으로 내려가는데,
       __loadSession() 은 저장소(=쿠키)를 읽어 세션이 없으면 그 자리에서
       { session: null } 을 반환한다. 그러면 _getUser() 는
         `if (!data.session?.access_token && !hasCustomAuthorizationHeader)
            return { data: { user: null }, error: new AuthSessionMissingError() }`
       로 끝난다 — `GET /auth/v1/user` 요청이 발생하지 않는다.
       즉 비로그인 방문자에게 이 미들웨어는 이미 네트워크 0회다.
       프리페치가 느렸던 원인은 미들웨어의 auth 호출이 아니라
       레이아웃/페이지의 캐시 없는 DB 조회였다(그쪽은 lib/cache.ts 가 해결한다).

   (2) 로그인 사용자에게는 요청마다 `GET /auth/v1/user` 왕복이 발생하고,
       액세스 토큰이 만료 90초(EXPIRY_MARGIN_MS) 이내면 __loadSession() 이
       먼저 _callRefreshToken() 을 돌려 리프레시 토큰을 "회전"시킨다.
       회전된 토큰은 TOKEN_REFRESHED → applyServerStorage → 아래 setAll 을 거쳐
       response 쿠키로 브라우저에 반영된다.

   ── 그래서 프리페치 조기 반환(auth 통째로 건너뛰기)은 채택하지 않았다 ──

   로그인 사용자 요청에서 이 미들웨어의 auth 를 건너뛰면 오히려 세션이 깨진다.
   (shop)/layout.tsx 는 프리페치 렌더에서도 createClient() + getUser() 를 부르는데,
   서버 컴포넌트의 setAll 은 cookies().set() 이 던지는 예외를 삼킨다
   (lib/supabase/server.ts 의 "미들웨어가 세션 갱신" 주석이 그 전제다).
   따라서 미들웨어가 먼저 갱신해 주지 않으면,
     프리페치 → RSC 렌더가 만료 토큰을 만남 → 거기서 리프레시 토큰이 회전됨
     → 새 토큰을 쿠키에 쓰지 못하고 유실 → 브라우저에는 이미 소비된 옛 토큰만 남음
     → Supabase 재사용 허용 구간(기본 10초)이 지나면 세션 사망
   이 된다. 왕복도 아껴지지 않는다 — 같은 프리페치 렌더에서 레이아웃이 어차피
   getUser() 를 부르기 때문이다. 이득 없이 세션만 끊기므로 하지 않는다.

   ── 대신 채택한 것: 세션이 "아예 없을 때만" 도는 빠른 경로 ──

   위 (1) 에 의해, 세션 쿠키가 하나도 없는 요청에서 이 미들웨어 본문은
   `NextResponse.next({ request })` 와 결과가 동일하다.
   갱신할 세션이 없으니 건너뛸 쿠키 쓰기도 없다 — 세션 만료 위험이
   "완화"가 아니라 구조적으로 발생 불가능하다.
   ============================================================ */

/**
 * 미들웨어가 직접 가드하는 경로.
 * 여기서는 어떤 최적화도 하지 않는다 — 프리페치든 아니든 항상 전체 경로를 탄다.
 */
function isGuardedPath(pathname: string): boolean {
  return pathname.startsWith("/mypage") || pathname.startsWith("/admin");
}

/**
 * 세션 재료가 될 수 있는 쿠키가 하나라도 실려 있는가.
 *
 * @supabase/ssr 은 storageKey 를 쿠키 이름으로 쓰고, 그 기본값은 supabase-js 가
 * URL 에서 파생하는 `sb-<project-ref>-auth-token` 이다(용량 초과 시 `.0`, `.1` 청크).
 * 전부 `sb-` 로 시작하므로 접두사만 보면 충분하다.
 *
 * 판정은 언제나 "안전한 쪽(=true)"으로 기운다. `sb-` 로 시작하는 쿠키가 하나라도
 * 있으면 세션과 무관한 쿠키여도 기존 전체 경로를 그대로 탄다. 그래서
 *  - 손상된 세션 쿠키를 미들웨어가 정리하던 동작(__loadSession 의 _removeSession →
 *    SIGNED_OUT → setAll 로 쿠키 삭제)도 그대로 보존된다.
 *  - 이름이 예상과 달라 못 알아보는 경우가 생겨도 전체 경로로 떨어질 뿐이다.
 */
function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((cookie) => cookie.name.startsWith("sb-"));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 가드 대상이 아니고 세션 쿠키도 없는 요청 — 위 (1) 에 의해 아래 본문과 결과가 같다.
  // 비로그인 방문자의 프리페치 수십 건에서 Supabase 클라이언트 생성과 쿠키
  // 디코딩을 통째로 걷어낸다. 갱신할 세션이 없으므로 건너뛰는 쿠키 쓰기도 없다.
  if (!isGuardedPath(pathname) && !hasSupabaseAuthCookie(request)) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: "daleum" },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // 세션 갱신 (필수 — getUser는 토큰 검증까지 수행)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 마이페이지 가드
  if (pathname.startsWith("/mypage") && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // 관리자 가드 (role 확인)
  if (pathname.startsWith("/admin")) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.role !== "admin") {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * 정적 파일/이미지 제외 전체 매칭
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)",
  ],
};
