import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Reveal from "@/components/shop/Reveal";
import RevealText from "@/components/shop/RevealText";
import MypageNav from "@/components/mypage/MypageNav";

export const metadata: Metadata = { title: "마이페이지" };

interface VipJoinRow {
  vip_groups?:
    | { name: string; is_active: boolean }
    | { name: string; is_active: boolean }[]
    | null;
}

/**
 * 마이페이지 셸 — 세리프 인사 + VIP 표시 + 좌측(모바일 상단) 내비.
 * 접근 가드는 미들웨어가 수행하지만 이중 안전장치로 한 번 더 확인한다.
 */
export default async function MypageLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/mypage");

  const [profileRes, vipRes] = await Promise.all([
    supabase.from("profiles").select("name").eq("id", user.id).maybeSingle(),
    supabase
      .from("vip_members")
      .select("id, vip_groups(name, is_active)")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const name =
    profileRes.data?.name ||
    (user.user_metadata?.name as string | undefined) ||
    "고객";

  const vipGroupName = (() => {
    const joined = (vipRes.data as VipJoinRow | null)?.vip_groups;
    if (!joined) return null;
    const group = Array.isArray(joined) ? joined[0] : joined;
    return group?.is_active ? group.name : null;
  })();

  return (
    <div className="container-hall flex-1 pb-24 pt-10 md:pb-32 md:pt-14">
      <header className="mb-8 md:mb-12">
        <Reveal as="p" variant="fade" className="label-caps text-forest-600">
          My Page
        </Reveal>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <Link href="/mypage">
            <RevealText
              as="h1"
              className="headline-serif text-3xl text-ink-900 md:text-4xl"
              text={`${name}님의 페이지`}
              delay={0.08}
            />
          </Link>
          {vipGroupName && (
            <Reveal
              as="span"
              variant="fade"
              delay={0.3}
              className="flex items-center gap-2 text-[13px] text-brass-700"
            >
              <span className="h-[7px] w-[7px] rounded-full bg-brass-500" aria-hidden />
              {vipGroupName} 멤버
            </Reveal>
          )}
        </div>
      </header>

      <div className="grid gap-8 overflow-x-clip lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-14 xl:grid-cols-[13rem_minmax(0,1fr)]">
        <Reveal variant="left" delay={0.1} className="min-w-0">
          <MypageNav />
        </Reveal>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
