import Image from "next/image";
import Link from "next/link";
import Reveal from "@/components/shop/Reveal";

/** 브랜드 클로징 — 사옥 사진 위 철학 문장과 브랜드 스토리 링크 */
export default function BrandClosing() {
  return (
    <section className="relative overflow-hidden bg-forest-950">
      <Image
        src="/editorial/building.jpg"
        alt="경기도 고양의 다름 사옥"
        fill
        sizes="100vw"
        className="object-cover"
      />
      <div aria-hidden className="absolute inset-0 bg-forest-950/72" />

      <div className="container-hall relative flex min-h-[70svh] flex-col items-center justify-center py-28 text-center md:py-40">
        <Reveal>
          <p className="label-caps text-cream-50/70">Daleum Philosophy</p>
        </Reveal>
        <Reveal delay={0.1}>
          <h2 className="headline-serif mt-6 text-3xl text-cream-50 md:text-5xl">
            자연 · 사람 · 고객을 이롭게
          </h2>
        </Reveal>
        <Reveal delay={0.18}>
          <p className="mx-auto mt-8 max-w-xl text-[15px] leading-[1.9] text-cream-50/70">
            경기도 고양의 자체 공장에서 하루 25톤, 매일 같은 마음으로
            발효곤약을 빚습니다. 다름이 지켜온 다름을 천천히 둘러보세요.
          </p>
        </Reveal>
        <Reveal delay={0.26}>
          <Link
            href="/about"
            className="label-caps mt-12 inline-flex h-12 items-center border border-cream-50/40 px-10 text-cream-50 transition-colors duration-500 hover:border-cream-50 hover:bg-cream-50/10"
          >
            브랜드 스토리
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
