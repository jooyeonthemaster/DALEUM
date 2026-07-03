import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import AdminShell from "@/components/admin/AdminShell";

export const metadata: Metadata = {
  title: {
    default: "다름 관리자",
    template: "%s — 다름 관리자",
  },
  robots: { index: false, follow: false },
};

/**
 * 관리자 레이아웃 — role 가드는 미들웨어가 수행하므로 여기서는
 * 관리자 이름만 조회해 셸에 전달한다.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let adminName: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("name, email")
      .eq("id", user.id)
      .maybeSingle();
    adminName = profile?.name ?? profile?.email ?? user.email ?? null;
  }

  return <AdminShell adminName={adminName}>{children}</AdminShell>;
}
