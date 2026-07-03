import { Fragment, type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import Parallax from "@/components/shop/Parallax";
import Reveal from "@/components/shop/Reveal";

const TITLE = "자연 · 사람 · 고객을 이롭게";

/** 브랜드 클로징 — 사옥 사진 위 철학 문장과 브랜드 스토리 링크 */
export default function BrandClosing() {
  return (
    <section className="relative overflow-hidden bg-forest-950">
      {/* 배경 — 커튼이 걷히듯 나타나고, 스크롤에 은은하게 밀린다 */}
      <Reveal variant="clip" className="absolute inset-0">
        <Parallax speed={34} className="h-full w-full">
          <Image
            src="/editorial/building.jpg"
            alt="경기도 고양의 다름 사옥"
            fill
            sizes="100vw"
            className="scale-[1.15] object-cover"
          />
        </Parallax>
      </Reveal>
      <div aria-hidden className="absolute inset-0 bg-forest-950/72" />

      <div className="container-hall relative flex min-h-[55svh] flex-col items-center justify-center py-20 text-center md:min-h-[70svh] md:py-36">
        <Reveal>
          <p className="label-caps text-cream-50/70">Daleum Philosophy</p>
        </Reveal>
        {/* 어절 단위 스태거 — 공백은 span 바깥에 둬야 어절 사이가 붙지 않는다 */}
        <Reveal variant="words" className="mt-6">
          <h2
            className="headline-serif text-3xl text-cream-50 md:text-5xl"
            aria-label={TITLE}
          >
            {TITLE.split(" ").map((word, i) => (
              <Fragment key={i}>
                <span
                  aria-hidden
                  className="reveal-word"
                  style={{ "--word-delay": `${0.12 + i * 0.07}s` } as CSSProperties}
                >
                  {word}
                </span>{" "}
              </Fragment>
            ))}
          </h2>
        </Reveal>
        <Reveal variant="blur" delay={0.3}>
          <p className="mx-auto mt-7 max-w-xl text-balance text-[15px] leading-[1.9] text-cream-50/70">
            경기도 고양의 자체 공장에서 하루 25톤, 매일 같은 마음으로
            발효곤약을 빚습니다. 다름이 지켜온 다름을 천천히 둘러보세요.
          </p>
        </Reveal>
        <Reveal delay={0.42}>
          <Link
            href="/about"
            className="label-caps mt-10 inline-flex h-12 items-center border border-cream-50/40 px-10 text-cream-50 transition-colors duration-500 hover:border-cream-50 hover:bg-cream-50/10 md:mt-12"
          >
            브랜드 스토리
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
