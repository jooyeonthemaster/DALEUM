"use client";

import { useEffect, useRef, type ReactNode } from "react";

export interface ParallaxProps {
  className?: string;
  /**
   * 이동 강도(px). 요소가 뷰포트를 통과하는 동안 -speed ~ +speed 만큼 움직인다.
   * 이미지 배경엔 40~80, 섹션 장식엔 15~30 권장.
   */
  speed?: number;
  /** 반대 방향으로 움직임 */
  reverse?: boolean;
  children: ReactNode;
}

/**
 * 스크롤 연동 패럴랙스 — 뷰포트 안에 있을 때만 rAF로 갱신.
 * 내부 콘텐츠(이미지)는 잘림 없이 움직이도록 부모에서 overflow-hidden +
 * 자식 이미지에 여유 스케일을 주는 식으로 사용한다.
 */
export default function Parallax({
  className = "",
  speed = 60,
  reverse = false,
  children,
}: ParallaxProps) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let active = false;

    const update = () => {
      raf = 0;
      const rect = outer.getBoundingClientRect();
      const vh = window.innerHeight;
      // 요소 중심이 뷰포트 하단(1) → 상단(-1)으로 지나가는 진행률
      const progress = (rect.top + rect.height / 2 - vh / 2) / (vh / 2 + rect.height / 2);
      const clamped = Math.max(-1, Math.min(1, progress));
      const y = clamped * speed * (reverse ? 1 : -1);
      inner.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
    };

    const onScroll = () => {
      if (!active || raf) return;
      raf = requestAnimationFrame(update);
    };

    const io = new IntersectionObserver(
      (entries) => {
        active = entries.some((e) => e.isIntersecting);
        if (active) onScroll();
      },
      { rootMargin: "20% 0px 20% 0px" }
    );
    io.observe(outer);

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    update();

    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [speed, reverse]);

  return (
    <div ref={outerRef} className={className}>
      <div ref={innerRef} className="h-full w-full will-change-transform">
        {children}
      </div>
    </div>
  );
}
