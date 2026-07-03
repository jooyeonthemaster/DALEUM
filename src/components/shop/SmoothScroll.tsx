"use client";

import Lenis from "lenis";
import { useEffect, type ReactNode } from "react";

/**
 * Lenis 기반 부드러운 스크롤 래퍼.
 * - (shop) 레이아웃에서 전체를 감싼다. DOM 노드를 추가하지 않는다.
 * - prefers-reduced-motion 사용자는 네이티브 스크롤 그대로 둔다.
 * - `data-lenis-prevent` 속성이 있는 요소(오버레이 등)는 lenis가 건드리지 않는다.
 */
export default function SmoothScroll({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // globals.css의 scroll-behavior: smooth와 충돌 방지 — lenis가 스크롤을 전담
    const html = document.documentElement;
    const prevScrollBehavior = html.style.scrollBehavior;
    html.style.scrollBehavior = "auto";

    const lenis = new Lenis({
      autoRaf: false,
      duration: 1.1,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      anchors: true,
    });

    let rafId = requestAnimationFrame(function raf(time: number) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    });

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
      html.style.scrollBehavior = prevScrollBehavior;
    };
  }, []);

  return <>{children}</>;
}
