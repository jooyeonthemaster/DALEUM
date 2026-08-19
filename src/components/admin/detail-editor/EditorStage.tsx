"use client";

/* ============================================================
   편집 캔버스 스테이지 — 관리자가 "고객이 보는 그 폭" 으로 편집하게 가두는 틀

   왜 이 파일이 있는가:
   지금 관리자 미리보기는 상세 이미지를 1066px 로 그린다. 고객이 실제로 보는 폭은
   PC 768 / 모바일 350 이다(칼럼 기준. 그 안의 이미지는 테두리 2px 빠져 766 / 348).
   관리자는 PC 대비 1.39배, 모바일 대비 3.06배 확대된 화면을 보면서 "이 정도면 되겠지"
   를 판단하고, 그 판단은 매번 빗나간다. 폭이 다르면 줄바꿈도, 글자 크기 체감도,
   사진이 차지하는 비중도 전부 달라지기 때문이다.
   그래서 편집 영역을 고객 폭으로 **가둔다**. 이 파일의 책임은 그 하나뿐이고,
   본문 스타일은 detail-prose.ts 를 고객 렌더러와 함께 쓴다(복사본을 두지 않는다).

   폭의 출처는 stage-context.ts 다 — globals.css 의 `--spacing-gutter` 와
   `container-hall` 규칙에서 계산해서 얻는다. 여기서는 숫자를 다시 적지 않는다.
   ============================================================ */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Monitor, Smartphone } from "lucide-react";
import { SPACER_HEIGHT } from "@/components/catalog/detail-prose";
import { stageScale } from "./resize-math";
import {
  EditorStageContext,
  stageCanvasWidth,
  stageContentWidth,
  type EditorStageInfo,
  type StageViewport,
} from "./stage-context";

/** PC ↔ 모바일 전환 시간(ms). SPEC §4.3 */
const VIEWPORT_TRANSITION_MS = 420;

/* 여백(spacer) 블록의 높이 — **캔버스가 소유하는 규칙**.

   extensions.ts 의 Spacer 노드는 `<div data-spacer data-size="md">` 만 내보내고
   "높이는 캔버스 CSS 가 칠한다" 고 계약해 두었는데, 정작 그 CSS 가 저장소 어디에도
   없었다. 그래서 관리자가 여백을 넣으면 편집기에서는 아무 일도 일어나지 않는데
   고객 화면만 벌어졌다(저장은 되니 에러도 안 난다 — 가장 나쁜 종류의 불일치다).

   값은 detail-prose.SPACER_HEIGHT 한 벌뿐이고 고객 렌더러도 같은 상수를 쓴다.
   선택자를 `[data-detail-stage-column]` 아래로 가둬 편집 캔버스 밖으로 새지 않게 하고,
   globals.css 에 적지 않는다(SPEC §8 — 상세 본문 스타일의 단일 진실은 detail-prose). */
const SPACER_RULES = (Object.keys(SPACER_HEIGHT) as Array<keyof typeof SPACER_HEIGHT>)
  .map(
    (size) =>
      `[data-detail-stage-column] [data-spacer][data-size="${size}"]{height:${SPACER_HEIGHT[size]}px}`
  )
  .join("");

export interface EditorStageProps {
  viewport: StageViewport;
  children: ReactNode;
}

/**
 * 한 번의 측정으로 함께 얻는 값들 — 따로 두면 세 번 렌더된다.
 *
 * 폭 두 개는 **목표값이 아니라 지금 화면에 그려진 값**이다. PC↔모바일 전환은
 * 420ms 동안 width 를 애니메이션하는데, 그동안 목표값을 방송하면 컨텍스트가
 * 화면과 다른 폭을 말하게 된다(§ 아래 '불변식' 주석).
 */
interface Measurement {
  /** 스테이지에 내어 줄 수 있는 폭(px) */
  available: number;
  /** 캔버스(기기 프레임)의 현재 레이아웃 폭(px) */
  canvasWidth: number;
  /** 콘텐츠 칼럼의 현재 레이아웃 폭(px) */
  columnWidth: number;
  /** 콘텐츠 칼럼의 화면 좌표 좌측 끝 */
  stageLeft: number;
}

const EMPTY: Measurement = { available: 0, canvasWidth: 0, columnWidth: 0, stageLeft: 0 };

export default function EditorStage({ viewport, children }: EditorStageProps) {
  const boundsRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  const [measured, setMeasured] = useState<Measurement>(EMPTY);

  /** CSS 에 목표로 걸어 두는 폭 — 전환은 이 값을 향해 420ms 동안 달린다 */
  const targetCanvasWidth = stageCanvasWidth(viewport);
  const targetContentWidth = stageContentWidth(viewport);

  /* ── 불변식: 방송하는 값 = 화면에 그려져 있는 값 ──
     드래그 좌표 변환(resize-math.toDocumentX)과 정합 프로브(parity-probe.js)가
     이 두 값을 나눗셈에 쓴다. 전환 중에 목표값을 방송하면 420ms 동안 계기와 드래그가
     둘 다 거짓말을 한다. 그래서 측정값을 그대로 싣는다 — 전환 중에도 프레임마다
     ResizeObserver 가 새 폭을 물어다 주므로 오차는 최대 한 프레임이다.
     (첫 렌더는 아직 못 쟀으니 목표값으로 대신한다.) */
  const paintedCanvasWidth = measured.canvasWidth > 0 ? measured.canvasWidth : targetCanvasWidth;
  const paintedContentWidth = measured.columnWidth > 0 ? measured.columnWidth : targetContentWidth;

  /* 가용 폭을 아직 못 쟀을 때(첫 렌더)는 축소하지 않는다. 0 을 넘기면 stageScale 이
     1을 돌려주긴 하지만, 의도를 코드에 남겨 둔다.
     축소율은 **트랜지션 대상이 아니다** — 그려진 폭에서 즉시 계산해 즉시 적용한다.
     transform 을 420ms 곡선에 태우면 화면 배율이 방송값보다 늦게 따라와 위 불변식이 깨진다. */
  const scale =
    measured.available > 0 ? stageScale(measured.available, paintedCanvasWidth) : 1;

  /* ── scale 은 **레이아웃 상자를 바꾸지 않는다** ──
     축소해도 브라우저는 여전히 원래 폭·높이만큼 자리를 잡아 둔다. 그대로 두면
     ① 스테이지 아래가 (1-k)×높이 만큼 크게 비고 ② 좌우로 가로 스크롤이 생긴다.
     그래서 줄어든 만큼을 음수 마진으로 되돌려 준다. 가로는 좌우로 반씩 깎아야
     transform-origin: top center 로 줄어든 그림의 한가운데가 그대로 가운데에 남는다.
     세로 보정은 아래 applyVerticalTrim 이 DOM 에 직접 쓴다(리렌더 없이). */
  const trimX = (paintedCanvasWidth * (1 - scale)) / 2;

  /* ── 세로 보정은 React 상태로 올리지 않는다 ──
     프레임 높이는 이미지 폭 드래그 중 매 프레임 바뀐다(종횡비가 잠겨 있으므로).
     그 높이를 state 에 담으면 pointermove 마다 렌더+커밋이 돌아 SPEC §5.4
     ("드래그 중 React state 를 바꾸지 않는다")를 캔버스가 뒤에서 깨게 된다.
     그래서 높이는 ref 에 두고 marginBottom 만 DOM 에 직접 쓴다. */
  const scaleRef = useRef(1);
  const frameHeightRef = useRef(0);
  const appliedTrimYRef = useRef<number | null>(null);

  const applyVerticalTrim = useCallback(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const trimY = frameHeightRef.current * (1 - scaleRef.current);
    // 같은 값을 다시 쓰면 ResizeObserver 를 공연히 한 바퀴 더 깨운다
    if (appliedTrimYRef.current === trimY) return;
    appliedTrimYRef.current = trimY;
    frame.style.marginBottom = `${-trimY}px`;
  }, []);

  const measure = useCallback(() => {
    const bounds = boundsRef.current;
    const frame = frameRef.current;
    const column = columnRef.current;
    if (!bounds || !frame || !column) return;

    // offsetWidth/offsetHeight 는 transform 의 영향을 받지 않는 **레이아웃** 치수다.
    // 축소된 화면에서도 "고객이 보는 CSS 픽셀" 을 그대로 준다.
    frameHeightRef.current = frame.offsetHeight;
    applyVerticalTrim();

    const available = bounds.clientWidth;
    const canvasWidth = frame.offsetWidth;
    const columnWidth = column.offsetWidth;
    const stageLeft = column.getBoundingClientRect().left;

    setMeasured((prev) => {
      // 값이 그대로면 상태를 건드리지 않는다 — ResizeObserver 가 자기 자신을 다시
      // 깨우는 무한 루프(콘솔 error)를 막는 유일한 방법이다.
      // 이미지 드래그 중에는 프레임 **높이**만 변하므로 여기서 매번 prev 로 빠져나간다.
      if (
        prev.available === available &&
        prev.canvasWidth === canvasWidth &&
        prev.columnWidth === columnWidth &&
        Math.abs(prev.stageLeft - stageLeft) < 0.5
      ) {
        return prev;
      }
      return { available, canvasWidth, columnWidth, stageLeft };
    });
  }, [applyVerticalTrim]);

  /** 한 프레임에 한 번만 잰다 — 스크롤·리사이즈는 초당 수십 번 들어온다 */
  const scheduleMeasure = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      measure();
    });
  }, [measure]);

  /* 배율이 바뀌면 세로 보정도 같이 바뀐다. 렌더 직후(paint 전) 반영해야
     한 프레임 동안 아래가 벌어졌다 닫히는 깜빡임이 없다. */
  useLayoutEffect(() => {
    scaleRef.current = scale;
    applyVerticalTrim();
  }, [scale, applyVerticalTrim]);

  useEffect(() => {
    const bounds = boundsRef.current;
    const frame = frameRef.current;
    const column = columnRef.current;
    if (!bounds || !frame || !column) return;

    measure();

    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(bounds); // 가용 폭
    observer.observe(frame); // 캔버스 폭(전환 중 매 프레임) + 내용 높이(세로 보정)
    observer.observe(column); // 칼럼 폭과 좌측 끝도 전환 중 매 프레임 따라간다

    // stageLeft 는 크기가 안 변해도 어긋난다 — 페이지를 스크롤하거나 옆 패널이
    // 접히면 위치만 움직인다. 드래그 중 이 값이 틀리면 이미지 폭이 어긋난다.
    window.addEventListener("scroll", scheduleMeasure, { capture: true, passive: true });
    window.addEventListener("resize", scheduleMeasure, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", scheduleMeasure, true);
      window.removeEventListener("resize", scheduleMeasure);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        /* 취소했으면 **반드시 비워야** 한다. 남겨 두면 scheduleMeasure 가
           "이미 예약돼 있다" 고 오해해 그 뒤로 영원히 조기 반환한다 —
           개발 모드(StrictMode)는 마운트 직후 정리를 한 번 돌리므로 이 상태가
           재현이 아니라 **기본값**이 된다. 실제로 그랬다: 창을 줄여도 캔버스가
           축소되지 않고(scale 이 1에 굳고) PC↔모바일 전환 뒤에도 컨텍스트가
           옛 폭을 계속 방송했다. 측정이 멈춘 편집기는 조용히 거짓말을 한다. */
        rafRef.current = null;
      }
    };
  }, [measure, scheduleMeasure]);

  useEffect(() => {
    // 전환 중에는 폭이 매 프레임 달라지고 ResizeObserver 가 그때마다 깨워 준다.
    // 마지막 프레임은 관측이 늦게 올 수 있어 끝난 뒤 한 번 더 재서 1px 까지 맞춘다.
    scheduleMeasure();
    const timer = window.setTimeout(scheduleMeasure, VIEWPORT_TRANSITION_MS + 60);
    return () => window.clearTimeout(timer);
  }, [viewport, scheduleMeasure]);

  const info = useMemo<EditorStageInfo>(
    () => ({
      contentWidth: paintedContentWidth,
      scale,
      stageLeft: measured.stageLeft,
      viewport,
    }),
    [paintedContentWidth, scale, measured.stageLeft, viewport]
  );

  const isMobile = viewport === "mobile";
  const ViewportIcon = isMobile ? Smartphone : Monitor;
  const percent = Math.round(scale * 100);

  return (
    <div className="border border-ink-200 bg-ink-100">
      {/* 캔버스 전용 규칙. 편집기가 화면에 있을 때만 존재하고, 선택자가
          [data-detail-stage-column] 안으로 갇혀 있어 밖으로 새지 않는다. */}
      <style>{SPACER_RULES}</style>

      {/* 지금 무엇을 보고 있는지 — 이걸 안 적으면 관리자는 좁아진 화면을
          "편집기가 이상해졌다" 로 읽는다 */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-ink-200 px-4 py-2.5">
        <ViewportIcon size={14} strokeWidth={1.5} aria-hidden className="text-ink-500" />
        <span className="label-caps text-ink-700">
          {isMobile ? "모바일 390" : "PC 768"}
        </span>
        {/* 전환 중에 숫자가 요동치지 않도록 이 칩만 목표값을 보여 준다 */}
        <span className="text-[11px] text-ink-400">본문 {targetContentWidth}px</span>
        <span className="ml-auto text-[11px] text-ink-500">
          {scale < 1 ? `${percent}%로 줄여 보는 중` : "고객 화면과 같은 크기"}
        </span>
      </div>

      <div className="p-4">
        {/* 가용 폭 측정 전용 — 패딩을 두지 않아야 clientWidth 가 곧 쓸 수 있는 폭이다 */}
        <div ref={boundsRef} className="flex justify-center">
          <div
            ref={frameRef}
            data-detail-stage={viewport}
            /* min-w-0 이 없으면 모바일 전환이 **조용히 무시된다.**
               이 요소는 flex 자식이고, flex 자식의 기본 min-width 는 auto —
               즉 "내용의 min-content 폭보다 좁아질 수 없다" 이다. 안에 든 상세 사진은
               내재 폭이 1,000px 대라, style.width 를 390 으로 줘도 브라우저가 768 로 되돌린다.
               (실제로 그렇게 났다: frame.style.width='390px' 인데 렌더 폭은 768 이었다.
                인라인 스타일이 맞으니 코드를 아무리 봐도 원인이 안 보이는 종류의 버그다.) */
            className={`min-w-0 shrink-0 bg-cream-50 motion-reduce:transition-none ${
              isMobile ? "border border-ink-300" : "border border-ink-200"
            }`}
            style={{
              width: targetCanvasWidth,
              // 가용 폭이 모자랄 때만 줄인다. **확대는 하지 않는다** —
              // 관리자 화면이 고객보다 커지는 순간 지금 고치려는 그 결함이 되돌아온다.
              transform: `scale(${scale})`,
              transformOrigin: "top center",
              marginLeft: -trimX,
              marginRight: -trimX,
              // marginBottom 은 applyVerticalTrim 이 DOM 에 직접 쓴다 (드래그 중 리렌더 금지)
              // PC↔모바일은 **폭**을 바꿔 전환한다. scale 로 흉내내면 글자만 커졌다 작아질 뿐
              // 모바일에서 진짜로 어디서 줄이 바뀌는지를 볼 수 없다 — 그게 보려던 전부다.
              // 애니메이션 대상은 width **하나뿐**이다. 배율과 보정 마진은 그려진 폭에서
              // 즉시 파생되므로 저절로 같은 곡선을 타고, 방송값과 화면이 어긋나지 않는다.
              transitionProperty: "width",
              transitionDuration: `${VIEWPORT_TRANSITION_MS}ms`,
              transitionTimingFunction: "var(--ease-silk)",
            }}
          >
            {isMobile && (
              // 기기 힌트 — 여기가 화면 위쪽이라는 것만 알려 주는 얇은 띠
              <div
                aria-hidden
                className="flex h-5 items-center justify-center border-b border-ink-100 bg-cream-100"
              >
                <span className="h-1 w-14 bg-ink-200" />
              </div>
            )}

            <div
              ref={columnRef}
              data-detail-stage-column={viewport}
              /* 폭 정합 프로브(scripts/parity-probe.js)가 찾는 표식.
                 "확대되어 보인다"는 눈으로 판정할 수 없어서 — 실제로 이 프로젝트의 결함은
                 관리자 1066px vs 고객 766px 이었는데 스크린샷만으로는 둘 다 그럴듯해 보였다 —
                 기계가 재서 비교하게 한다. scale 을 함께 실어야 축소된 화면에서도
                 '고객이 보는 CSS 픽셀' 로 되돌려 잴 수 있다. */
              data-parity="stage-content"
              data-parity-scale={scale}
              className="mx-auto py-6 motion-reduce:transition-none"
              style={{
                // 모바일은 390 프레임 안에 350 칼럼 — 남는 40px 이 좌우 여백이 된다
                // (`--spacing-gutter` 하한 20px × 2. stage-context.ts 참고)
                width: targetContentWidth,
                transitionProperty: "width",
                transitionDuration: `${VIEWPORT_TRANSITION_MS}ms`,
                transitionTimingFunction: "var(--ease-silk)",
              }}
            >
              <EditorStageContext.Provider value={info}>
                {children}
              </EditorStageContext.Provider>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
