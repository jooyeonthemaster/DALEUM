import type { Metadata } from "next";
import Reveal from "@/components/shop/Reveal";
import RevealText from "@/components/shop/RevealText";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "로그인" };

/** 오픈 리다이렉트 방지 — 내부 경로만 허용 */
function sanitizeNext(raw: string | undefined): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const next = sanitizeNext(sp.next);
  const initialError =
    sp.error === "auth"
      ? "인증 링크가 유효하지 않거나 만료되었습니다. 다시 로그인해 주세요."
      : null;

  return (
    <div className="flex flex-1 items-center justify-center overflow-x-clip px-5 py-16 md:py-24">
      <div className="grid w-full max-w-5xl items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-20">
        {/* PC 좌측 — 브랜드 스테이트먼트 (모바일에서는 카드만) */}
        <div className="hidden lg:block">
          <Reveal as="p" variant="fade" className="label-caps text-forest-600">
            Daleum Member
          </Reveal>
          <RevealText
            as="h2"
            className="headline-serif mt-6 text-4xl leading-[1.3] text-ink-900 xl:text-[2.75rem]"
            text={"곤약 그 이상의 한계를\n발효로 완성하다"}
            delay={0.1}
          />
          <Reveal
            as="p"
            variant="fade"
            delay={0.35}
            className="mt-7 max-w-md text-[15px] leading-relaxed text-ink-600"
          >
            국내 최초 효모·유산균 발효곤약,
            <br />
            다름의 식탁에 다시 오신 것을 환영합니다.
          </Reveal>
          <Reveal
            variant="rule"
            delay={0.5}
            className="mt-10 h-px w-24 bg-ink-900"
          />
          <Reveal as="p" variant="fade" delay={0.65} className="label-caps mt-6 text-ink-400">
            Since 2019 · Fermented Konjac
          </Reveal>
        </div>

        <Reveal variant="right" delay={0.15} className="mx-auto w-full max-w-md lg:mx-0 lg:max-w-none">
          <LoginForm next={next} initialError={initialError} />
        </Reveal>
      </div>
    </div>
  );
}
