import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * service role 클라이언트 — RLS 우회, daleum 스키마. 서버 전용.
 * 반드시 관리자 권한 검증(requireAdmin) 뒤에서만 사용할 것.
 */
export function createServiceClient(): SupabaseClient {
  // db.schema를 daleum으로 고정하면 반환 제네릭이 SupabaseClient<..,"daleum">이 되어
  // 기본(public) SupabaseClient를 받는 기존 lib 함수들과 타입이 어긋난다.
  // .from()은 문자열 기반(any)이라 런타임에는 무관하므로 기본 타입으로 캐스팅한다.
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      db: { schema: "daleum" },
      auth: { autoRefreshToken: false, persistSession: false },
    }
  ) as unknown as SupabaseClient;
}
