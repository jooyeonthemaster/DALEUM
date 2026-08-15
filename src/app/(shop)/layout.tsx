import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import Footer from "@/components/shop/Footer";
import Header, { type HeaderUser, type ShopCategory } from "@/components/shop/Header";
import SmoothScroll from "@/components/shop/SmoothScroll";

/**
 * 스토어프론트 공용 셸 — Header + main + Footer + SmoothScroll.
 * 서버에서 로그인 유저와 활성 카테고리를 조회해 Header에 내려준다.
 */
export default async function ShopLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();

  const [userResult, categoriesResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("categories")
      .select("id, slug, name")
      .eq("is_active", true)
      // sort_order 동점 시 순서가 요청마다 흔들리지 않도록 2차 키를 고정한다
      .order("sort_order", { ascending: true })
      .order("slug", { ascending: true }),
  ]);

  const authUser = userResult.data.user;
  const user: HeaderUser | null = authUser
    ? {
        id: authUser.id,
        email: authUser.email ?? null,
        name: (authUser.user_metadata?.name as string | undefined) ?? null,
      }
    : null;

  const categories = (categoriesResult.data ?? []) as ShopCategory[];

  return (
    <SmoothScroll>
      <Header user={user} categories={categories} />
      <main className="flex flex-1 flex-col">{children}</main>
      <Footer />
    </SmoothScroll>
  );
}
