import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveVipContext } from "@/lib/pricing";
import { VIP_CODE_COOKIE } from "@/lib/constants";
import VipEntry from "@/components/vip/VipEntry";

export const metadata: Metadata = {
  title: "프라이빗 라운지",
  description: "초대받은 분들을 위한 다름의 프라이빗 라운지.",
  robots: { index: false, follow: false },
};

/**
 * /vip — 프라이빗 라운지 입장.
 * 이미 유효한 VIP 컨텍스트(로그인 멤버십 또는 코드 쿠키)가 있으면
 * 서버에서 바로 /vip/shop 으로 보낸다.
 */
export default async function VipEntryPage() {
  const supabase = await createClient();
  const [userResult, cookieStore] = await Promise.all([supabase.auth.getUser(), cookies()]);
  const user = userResult.data.user;
  const vipCode = cookieStore.get(VIP_CODE_COOKIE)?.value ?? null;

  if (user || vipCode) {
    const service = createServiceClient();
    const ctx = await resolveVipContext(service, { userId: user?.id ?? null, vipCode });
    if (ctx.groupId) redirect("/vip/shop");
  }

  return (
    <section className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-forest-950 px-6 py-28 md:py-36">
      {/* 초대장 프레임 — 아주 은은한 헤어라인 */}
      <div aria-hidden className="pointer-events-none absolute inset-3 border border-cream-50/10 md:inset-5" />

      <div className="relative w-full max-w-md text-center">
        <span aria-hidden className="mx-auto mb-8 block h-10 w-px bg-brass-500/60" />
        <p className="label-caps text-brass-300">Private Lounge</p>
        <h1 className="headline-serif mt-5 text-3xl text-cream-50 md:text-4xl">
          초대받은 분들을 위한 공간
        </h1>
        <p className="mt-5 text-sm leading-relaxed text-cream-200/55">
          다름이 준비한 프라이빗 셀렉션은
          <br className="md:hidden" /> 초대 코드로만 열립니다.
        </p>

        <div className="mt-12">
          <VipEntry />
        </div>
      </div>
    </section>
  );
}
