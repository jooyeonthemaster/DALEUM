import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * 쿠키를 전혀 읽지 않는 익명(anon) 클라이언트 — 캐시 계층 전용.
 *
 * 두 가지 이유로 반드시 이 클라이언트만 `unstable_cache` 안에서 쓴다:
 *
 * 1. `unstable_cache` 스코프 안에서는 `cookies()` 접근이 금지된다.
 *    `@/lib/supabase/server`의 createClient()는 cookies()를 읽으므로 캐시 안에서 못 쓴다.
 *
 * 2. 안전장치 — 이 클라이언트는 언제나 "로그아웃한 방문자"의 시야만 본다.
 *    공유 캐시에 담기는 데이터가 특정 사용자에게만 보여야 할 행을 절대 포함할 수 없다.
 *    (service 클라이언트를 캐시에 쓰면 RLS를 우회하므로, 쿼리 실수 하나가 곧 유출이 된다.)
 *
 * 사용자 종속 데이터(위시리스트·주문·VIP 가격·본인 문의)는 캐시 밖에서
 * 기존 세션 클라이언트로 요청마다 조회해야 한다.
 */
export function createPublicClient(): SupabaseClient {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: "daleum" },
      auth: { autoRefreshToken: false, persistSession: false },
    }
  ) as unknown as SupabaseClient;
}
