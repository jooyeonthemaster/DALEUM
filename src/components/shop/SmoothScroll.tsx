"use client";

import Lenis from "lenis";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, type ReactNode } from "react";

/**
 * Lenis 인스턴스 생성 + 라우트 변경 시 스크롤 재동기화.
 * DOM 노드를 만들지 않는다.
 */
function LenisController() {
  const lenisRef = useRef<Lenis | null>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();

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
      // 다른 경로로 이동하는 링크 클릭 시점에 관성을 끊는다.
      // (아래 라우트 변경 effect보다 먼저 걸리는 1차 방어선)
      stopInertiaOnNavigate: true,
    });
    lenisRef.current = lenis;

    let rafId = requestAnimationFrame(function raf(time: number) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    });

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
      lenisRef.current = null;
      html.style.scrollBehavior = prevScrollBehavior;
    };
  }, []);

  // 뒤로/앞으로 가기 여부 — 이 경우엔 브라우저/Next의 스크롤 복원을 존중한다
  const isPopNavRef = useRef(false);
  useEffect(() => {
    const onPop = () => {
      isPopNavRef.current = true;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /**
   * 라우트가 바뀔 때, 직전 페이지에서 진행 중이던 lenis 관성 애니메이션이
   * 새 페이지에서도 계속 돌면서 원래 목표 지점까지 페이지를 끌고 내려간다.
   * 새 페이지가 더 짧으면 최대 스크롤로 잘려 푸터에 박힌다.
   *
   * 관성을 폐기한 뒤 새 진입은 상단으로 보낸다.
   * (뒤로가기·해시 앵커는 각각 복원/앵커 이동을 그대로 둔다.)
   */
  useEffect(() => {
    const lenis = lenisRef.current;
    if (!lenis) return;

    const wasPopNav = isPopNavRef.current;
    isPopNavRef.current = false;

    // stop→start 는 내부적으로 reset()을 호출한다:
    // 진행 중이던 애니메이션을 버리고 내부 위치를 실제 스크롤과 맞춘다.
    lenis.stop();
    lenis.start();
    lenis.resize();

    if (wasPopNav) return; // 뒤로/앞으로 — 복원된 위치 유지
    if (window.location.hash) return; // 해시 앵커 — lenis anchors 가 담당

    lenis.scrollTo(0, { immediate: true, force: true });
  }, [pathname, searchParams]);

  return null;
}

/**
 * Lenis 기반 부드러운 스크롤 래퍼.
 * - (shop) 레이아웃에서 전체를 감싼다. DOM 노드를 추가하지 않는다.
 * - prefers-reduced-motion 사용자는 네이티브 스크롤 그대로 둔다.
 * - `data-lenis-prevent` 속성이 있는 요소(오버레이 등)는 lenis가 건드리지 않는다.
 */
export default function SmoothScroll({ children }: { children: ReactNode }) {
  return (
    <>
      {/* useSearchParams 사용 — 정적 프리렌더를 막지 않도록 Suspense로 격리 */}
      <Suspense fallback={null}>
        <LenisController />
      </Suspense>
      {children}
    </>
  );
}
