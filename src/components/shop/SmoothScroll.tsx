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
      // anchors 는 아래에서 직접 처리한다 (lenis 내장 처리는 네이티브 점프와
      // 충돌해 목표 지점보다 앞에서 멈춘다 — 거리에 비례해 최대 900px 오차)
      anchors: false,
      // 다른 경로로 이동하는 링크 클릭 시점에 관성을 끊는다.
      // (아래 라우트 변경 effect보다 먼저 걸리는 1차 방어선)
      stopInertiaOnNavigate: true,
    });
    lenisRef.current = lenis;

    /**
     * lenis 는 스크롤 한계(limit = 문서높이 - 뷰포트높이)를 캐시해 두고, 콘텐츠가
     * 바뀌면 ResizeObserver 로 다시 잰다. 그런데 lenis 가 관찰하는 기본 대상은
     * documentElement 이고, 루트 레이아웃이 <html class="h-full"> 이라 이 요소의
     * 박스 높이는 언제나 뷰포트 높이(예: 900px)로 고정돼 있다.
     * ResizeObserver 는 scrollHeight 가 아니라 "박스 크기"를 보므로, 콘텐츠가
     * 아무리 늘어나도 이 관찰자는 영원히 발화하지 않는다.
     * 즉 lenis 의 자동 재측정이 통째로 죽은 상태였다.
     *
     * 실측 (상품목록에서 /products/jjajang 클릭, 1440x900):
     *   t=208ms  문서 1,671px  ← 라우트 전환 직후. 새 페이지는 아직 도착 전
     *   t=813ms  문서 4,865px  ← 실제 상세 콘텐츠 도착
     * 한계가 208ms 시점 값(1,671-900 = 771)으로 굳어, 휠이 771px 에서 멈췄다.
     * (검증: window 에 resize 이벤트를 하나 쏴서 재측정시키면 즉시 3,965 까지 내려감)
     *
     * body 는 height:auto 라 콘텐츠 높이만큼 자란다 — 이쪽을 관찰하면 콘텐츠가
     * 늘어나는 즉시 발화한다. 측정값 자체(documentElement.scrollHeight)는 정확하므로
     * 무엇을 재는지는 그대로 두고, "언제 다시 재는지"만 바로잡는다.
     * 라우트 전환뿐 아니라 이미지 지연 로드·아코디언 펼침·리뷰 더보기처럼
     * 페이지가 나중에 길어지는 모든 경우가 같은 버그였고, 함께 해결된다.
     * (lenis 내장 관찰자는 250ms 디바운스라 살아 있어도 늦다 — 이건 즉시 반영)
     */
    const contentObserver = new ResizeObserver(() => lenis.resize());
    contentObserver.observe(document.body);

    let rafId = requestAnimationFrame(function raf(time: number) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    });

    return () => {
      cancelAnimationFrame(rafId);
      contentObserver.disconnect();
      lenis.destroy();
      lenisRef.current = null;
      html.style.scrollBehavior = prevScrollBehavior;
    };
  }, []);

  /**
   * 같은 페이지 내 앵커(`#id`) 링크를 직접 처리한다.
   *
   * lenis의 anchors 옵션에 맡기면, lenis가 스크롤 애니메이션을 시작한 직후
   * 브라우저의 네이티브 앵커 점프가 같은 클릭에서 실행되면서 서로를 덮어쓴다.
   * 그 결과 lenis가 목표를 잃고 거리에 비례해 모자란 지점에서 멈춘다.
   * (실측: 목표 8972 → 8096, 876px 부족)
   *
   * 기본 동작을 막아 네이티브 점프를 없애면 충돌 자체가 사라진다.
   */
  useEffect(() => {
    const onAnchorClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const lenis = lenisRef.current;
      if (!lenis) return; // reduced-motion — 네이티브 앵커 점프가 정확하므로 그대로 둔다

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || href === "#" || !href.startsWith("#")) return;

      const id = decodeURIComponent(href.slice(1));
      const el = document.getElementById(id);
      if (!el) return;

      event.preventDefault();

      // 목표 위치를 직접 계산한다. window.scrollY 는 언제나 실제 값이다.
      const scrollMarginTop =
        Number.parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
      const top =
        el.getBoundingClientRect().top + window.scrollY - scrollMarginTop;

      // lenis.scrollTo 는 이 시점에 내부 상태가 어긋나 엉뚱한 곳으로 보낸다
      // (실측: 목표 8860 → 즉시 764로 이동). 브라우저 네이티브 부드러운
      // 스크롤은 항상 정확하므로 그쪽에 맡긴다.
      //
      // stop()→start() 는 진행 중이던 관성만 폐기한다. lenis 를 멈춘 채로 두면
      // (isStopped) 휠 이벤트를 preventDefault 만 하고 무시해 페이지가 얼어붙는다.
      lenis.stop();
      lenis.start();

      window.scrollTo({ top, behavior: "smooth" });
      // 딥링크·뒤로가기를 위해 주소의 해시는 유지한다
      window.history.pushState(null, "", `#${id}`);
    };

    document.addEventListener("click", onAnchorClick);
    return () => document.removeEventListener("click", onAnchorClick);
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
