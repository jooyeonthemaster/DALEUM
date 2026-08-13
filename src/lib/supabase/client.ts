import { createBrowserClient } from "@supabase/ssr";

/** site 프로젝트 공유 DB — DALEUM은 daleum 스키마를 쓴다 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: "daleum" } }
  );
}
