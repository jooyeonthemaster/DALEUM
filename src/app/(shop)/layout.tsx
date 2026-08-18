import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCachedCategories } from "@/lib/cache";
import Footer from "@/components/shop/Footer";
import Header, { type HeaderUser } from "@/components/shop/Header";
import SmoothScroll from "@/components/shop/SmoothScroll";

/**
 * 스토어프론트 공용 셸 — Header + main + Footer + SmoothScroll.
 * 서버에서 로그인 유저와 활성 카테고리를 조회해 Header에 내려준다.
 *
 * 이 레이아웃은 <Link> 프리페치 때도 실제로 실행된다(프리페치 페이로드가
 * "레이아웃부터 첫 loading 경계까지"라서). 그래서 여기 있는 조회 하나가
 * 페이지 진입 1회당 수십 번 반복된다 — 카테고리 조회를 반드시 캐시로 받는 이유다.
 * 유저 조회는 사용자마다 달라 캐시할 수 없으므로 그대로 둔다
 * (비로그인 방문자에게는 네트워크 호출이 발생하지 않는다).
 */
export default async function ShopLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();

  const [userResult, categories] = await Promise.all([
    supabase.auth.getUser(),
    getCachedCategories(),
  ]);

  const authUser = userResult.data.user;
  const user: HeaderUser | null = authUser
    ? {
        id: authUser.id,
        email: authUser.email ?? null,
        name: (authUser.user_metadata?.name as string | undefined) ?? null,
      }
    : null;

  return (
    <SmoothScroll>
      {/* Header 는 클라이언트 컴포넌트라 넘긴 props 가 그대로 Flight 페이로드에 실린다.
          카테고리 전체 행(description·image_url·created_at …)을 보낼 이유가 없으므로
          실제로 쓰는 세 필드만 추린다. 캐스팅으로 타입만 좁히면 런타임 객체는 그대로다. */}
      <Header
        user={user}
        categories={categories.map(({ id, slug, name }) => ({ id, slug, name }))}
      />
      <main className="flex flex-1 flex-col">{children}</main>
      <Footer />
    </SmoothScroll>
  );
}
