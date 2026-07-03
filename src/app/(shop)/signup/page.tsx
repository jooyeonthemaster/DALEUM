import type { Metadata } from "next";
import Reveal from "@/components/shop/Reveal";
import RevealText from "@/components/shop/RevealText";
import SignupForm from "./SignupForm";

export const metadata: Metadata = { title: "회원가입" };

/** 오픈 리다이렉트 방지 — 내부 경로만 허용 */
function sanitizeNext(raw: string | undefined): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="flex flex-1 items-center justify-center overflow-x-clip px-5 py-16 md:py-24">
      <div className="grid w-full max-w-5xl items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-20">
        {/* PC 좌측 — 브랜드 스테이트먼트 (모바일에서는 카드만) */}
        <div className="hidden lg:block">
          <Reveal as="p" variant="fade" className="label-caps text-forest-600">
            Join Daleum
          </Reveal>
          <RevealText
            as="h2"
            className="headline-serif mt-6 text-4xl leading-[1.3] text-ink-900 xl:text-[2.75rem]"
            text={"발효가 완성한\n곤약의 식탁을 당신에게"}
            delay={0.1}
          />
          <Reveal
            as="p"
            variant="fade"
            delay={0.35}
            className="mt-7 max-w-md text-[15px] leading-relaxed text-ink-600"
          >
            회원이 되시면 주문 조회부터 위시리스트, 리뷰까지
            <br />
            나만의 발효 식탁을 차곡차곡 기록할 수 있습니다.
          </Reveal>
          <Reveal
            variant="rule"
            delay={0.5}
            className="mt-10 h-px w-24 bg-ink-900"
          />
          <Reveal as="p" variant="fade" delay={0.65} className="label-caps mt-6 text-ink-400">
            HACCP · FSSC 22000 · Vegan · Halal
          </Reveal>
        </div>

        <Reveal variant="right" delay={0.15} className="mx-auto w-full max-w-md lg:mx-0 lg:max-w-none">
          <SignupForm next={sanitizeNext(sp.next)} />
        </Reveal>
      </div>
    </div>
  );
}
