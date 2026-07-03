"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";

export interface HeroBanner {
  title: string;
  subtitle: string | null;
  imageUrl: string;
  linkUrl: string | null;
}

export interface HomeHeroProps {
  /** banners(placement=hero) 활성 배너 — 없으면 에디토리얼 기본 히어로 */
  banner: HeroBanner | null;
}

/** --reveal-delay CSS 변수 스타일 */
const delay = (s: number): CSSProperties =>
  ({ ["--reveal-delay"]: `${s}s` }) as CSSProperties;

/**
 * 홈 히어로 — 풀블리드 100svh, 배경 은은한 패럴랙스.
 * 헤더가 홈 최상단에서 투명(cream 글자)으로 뜨므로 어두운 스크림을 항상 깔아준다.
 */
export default function HomeHero({ banner }: HomeHeroProps) {
  const bgRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  // 첫 페인트 다음 프레임에 등장 트랜지션 시작
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    // 패럴랙스 — 모션 최소화 사용자는 건너뛴다
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      const el = bgRef.current;
      if (!el) return;
      const y = window.scrollY;
      // 히어로가 화면을 벗어난 뒤에는 계산하지 않는다
      if (y <= window.innerHeight * 1.2) {
        el.style.transform = `translate3d(0, ${y * 0.18}px, 0)`;
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const imageUrl = banner?.imageUrl ?? "/editorial/salad-noodle-dark.jpg";
  const titleLines = banner
    ? banner.title.split("\n")
    : ["곤약 그 이상의 한계를,", "발효로 완성하다"];
  const subtitle =
    banner?.subtitle ??
    "국내 최초 효모·유산균 발효곤약. 매일의 식탁에 조용한 다름을 올립니다.";
  const primaryHref = banner?.linkUrl ?? "/products";
  const primaryLabel = banner?.linkUrl ? "자세히 보기" : "상품 보기";

  const reveal = `reveal${mounted ? " is-inview" : ""}`;

  return (
    <section className="relative -mt-16 flex min-h-svh flex-col justify-end overflow-hidden bg-forest-950 md:-mt-20">
      {/* 배경 사진 — 위로 22% 확장해 패럴랙스 이동분을 확보 */}
      <div
        ref={bgRef}
        className="absolute inset-x-0 -top-[22%] bottom-0 will-change-transform"
      >
        <Image
          src={imageUrl}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
      </div>

      {/* 스크림 — 상단(투명 헤더)과 하단(카피)을 어둡게 */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(15,31,23,0.6)_0%,rgba(15,31,23,0.26)_45%,rgba(15,31,23,0.68)_100%)]"
      />

      <div className="container-hall relative pb-24 pt-44 md:pb-32">
        <p className={`${reveal} label-caps text-cream-50/80`} style={delay(0.05)}>
          Fermented Konjac · Since 2019
        </p>

        <h1 className="headline-serif mt-6 text-[2.5rem] leading-[1.16] text-cream-50 sm:text-5xl md:text-6xl lg:text-[4.25rem]">
          {titleLines.map((line, i) => (
            <span key={i} className={`${reveal} block`} style={delay(0.15 + i * 0.14)}>
              {line}
            </span>
          ))}
        </h1>

        <p
          className={`${reveal} mt-7 max-w-md text-[15px] leading-relaxed text-cream-50/80 md:text-base`}
          style={delay(0.48)}
        >
          {subtitle}
        </p>

        <div className={`${reveal} mt-10 flex flex-wrap gap-3`} style={delay(0.62)}>
          <Link
            href={primaryHref}
            className="label-caps inline-flex h-12 items-center bg-cream-50 px-8 text-ink-900 transition-colors duration-500 hover:bg-cream-200"
          >
            {primaryLabel}
          </Link>
          <Link
            href="/about"
            className="label-caps inline-flex h-12 items-center border border-cream-50/40 px-8 text-cream-50 transition-colors duration-500 hover:border-cream-50 hover:bg-cream-50/10"
          >
            브랜드 스토리
          </Link>
        </div>
      </div>

      {/* 스크롤 힌트 */}
      <div
        className={`${reveal} absolute bottom-8 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-3 md:flex`}
        style={delay(0.9)}
        aria-hidden
      >
        <span className="label-caps text-[10px] text-cream-50/60">Scroll</span>
        <span className="h-12 w-px bg-cream-50/40" />
      </div>
    </section>
  );
}
