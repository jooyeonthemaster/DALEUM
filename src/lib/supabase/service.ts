import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * service role 클라이언트 — RLS 우회. 서버 전용.
 * 반드시 관리자 권한 검증(requireAdmin) 뒤에서만 사용할 것.
 */
export function createServiceClient(): SupabaseClient {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
