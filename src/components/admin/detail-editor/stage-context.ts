"use client";

/* ============================================================
   편집 스테이지 정보 — 캔버스 안쪽 어디서든 "지금 몇 px 짜리 화면인가"를 묻는 통로

   왜 컨텍스트인가:
   이미지 폭 드래그는 포인터의 화면 좌표(clientX)를 문서 좌표로 되돌려야 계산이 맞는다
   (resize-math.toDocumentX). 그 변환에 필요한 값 — 콘텐츠 칼럼 폭, 스테이지 축소율,
   칼럼의 화면 좌측 끝 — 은 스테이지만 알고 있는데, 정작 쓰이는 곳은 이미지 노드
   안쪽 깊은 자리다. props 로 내려보내려면 중간의 TipTap NodeView 를 전부 거쳐야 하고,
   한 군데만 빠뜨려도 드래그가 **조용히** 어긋난다(에러가 안 난다 — 그래서 더 나쁘다).
   그래서 값 하나를 위에서 방송하고 필요한 곳이 직접 듣는다.

   여기 담긴 폭은 언제나 **문서 공간 px** 이다 — 축소 전, 고객이 보는 그 픽셀.
   화면에 보이는 크기는 contentWidth × scale 이지만, 저장되는 계산은 전부 문서 공간에서 한다.
   ============================================================ */

import { createContext, useContext } from "react";
import { DETAIL_CONTENT_WIDTH, MOBILE_STAGE_WIDTH } from "@/components/catalog/detail-prose";

export type StageViewport = "pc" | "mobile";

/* ------------------------------------------------------------
   고객 컨테이너 치수 — CSS 에서 그대로 옮겨 온다

   상세 섹션은 `container-hall` 안의 `mx-auto max-w-3xl` 이다
   (src/app/(shop)/products/[slug]/page.tsx:303 컨테이너, 400 칼럼).
   그 컨테이너를 정하는 규칙은 두 줄뿐이다:

     globals.css:58       --spacing-gutter: clamp(1.25rem, 4vw, 3.5rem)
     globals.css:119-124  @utility container-hall { max-width: 96rem; padding-inline: var(--spacing-gutter) }

   그래서 칼럼 폭을 숫자로 박지 않고 이 세 항에서 **계산해서** 얻는다.
   박아 두면 CSS 가 바뀌는 날 편집 캔버스만 옛날 폭으로 남아 미리보기가 거짓말을 시작한다.
   ------------------------------------------------------------ */

/** `clamp()` 하한 1.25rem — 루트 16px 기준 20px */
const HALL_GUTTER_MIN = 20;
/** `clamp()` 가운데 항 4vw */
const HALL_GUTTER_RATIO = 0.04;
/** `clamp()` 상한 3.5rem — 56px */
const HALL_GUTTER_MAX = 56;
/** `container-hall` 의 max-width 96rem — 1536px */
const HALL_MAX_WIDTH = 1536;

/**
 * 뷰포트 폭 → `container-hall` 좌우 여백(px).
 *
 * 실측으로 검증했다 (localhost:3210 /products/semyeon, 2026-08-20):
 *   창 1440 → padding 56px   (상한이 물린다)
 *   창  810 → padding 32.4px (= 810 × 0.04)
 *   창  400 → padding 20px   (4vw=16 < 20 이라 하한이 물린다)
 *   창  390 → padding 20px   (4vw=15.6 < 20)
 *
 * 810 에서 32.4 가 나온 것이 중요하다 — `vw` 는 스크롤바를 **포함한 창 폭** 기준이다
 * (레이아웃 폭 800 이었다면 32 이었어야 한다). 다만 모바일 폭에서는 어느 쪽이든
 * 하한 20px 이 물리므로 이 구분이 결과를 바꾸지 않는다.
 */
export function hallGutter(viewportWidth: number): number {
  const fluid = viewportWidth * HALL_GUTTER_RATIO;
  return Math.min(Math.max(HALL_GUTTER_MIN, fluid), HALL_GUTTER_MAX);
}

/**
 * 뷰포트 폭 → 고객 상세 섹션의 콘텐츠 칼럼 폭(px).
 * 칼럼 = min(max-w-3xl 768, min(뷰포트, 96rem) − 여백×2)
 *
 * 여기서 말하는 "뷰포트 폭" 은 **레이아웃 뷰포트**다 (클래식 스크롤바를 뺀 폭).
 * 아래 MOBILE_CONTENT_WIDTH 주석이 왜 이 구분이 목숨을 거는 문제인지 설명한다.
 */
export function detailColumnWidth(viewportWidth: number): number {
  const hall = Math.min(viewportWidth, HALL_MAX_WIDTH);
  return Math.min(DETAIL_CONTENT_WIDTH, hall - hallGutter(viewportWidth) * 2);
}

/**
 * 모바일 기기 폭 안에서 좌우로 비는 여백(px) — 390 에서 20px.
 * 지어낸 값이 아니라 `--spacing-gutter` 의 clamp 하한이다(위 hallGutter 참고).
 */
export const MOBILE_STAGE_GUTTER = hallGutter(MOBILE_STAGE_WIDTH);

/**
 * 모바일에서 고객이 실제로 보는 콘텐츠 칼럼 폭(px) — **350** (그 안의 이미지는 테두리 2px 빠져 348).
 *
 * ── SPEC §0 표의 340/338 은 왜 다른가 (2026-08-20 재실측으로 판정) ──
 * 그 값은 데스크톱 브라우저 창을 390 으로 좁혀 잰 것이다. 이 프로젝트는
 * globals.css:96-98 에서 `::-webkit-scrollbar { width: 10px }` 로 **클래식**
 * 스크롤바를 직접 칠하고 있어서, 창 390 이면 레이아웃 뷰포트가 380 으로 깎인다.
 *   실측: window.innerWidth 390 / documentElement.clientWidth 380
 *         → container-hall 380, padding 20/20 → 칼럼 340, 상세 이미지 338
 * 같은 페이지를 레이아웃 뷰포트가 진짜 390 이 되도록(창 400, 스크롤바 10 제외) 재면
 *   → container-hall 390, padding 20/20 → 칼럼 **350**, 상세 이미지 **348**
 *
 * 편집 캔버스가 흉내내야 하는 것은 **기기**다. MOBILE_STAGE_WIDTH 가 iPhone 기준폭이고,
 * 모바일 브라우저의 스크롤바는 오버레이라 레이아웃 폭을 먹지 않는다 —
 * 즉 고객 손 안에서의 칼럼은 350 이다. 340 을 그리면 편집기가 실제보다 10px 좁게
 * 보여 주고, 그만큼 줄바꿈 위치가 앞당겨져 "고객 화면 그대로" 가 다시 거짓이 된다.
 *
 * ⚠ 정합 게이트(SPEC §7)에 주는 경고: 고객 쪽을 잴 때 **반드시 레이아웃 뷰포트 390**
 * 조건에서 재라(모바일 에뮬레이션, 또는 스크롤바 10px 을 감안한 창 400).
 * 데스크톱 창 390 으로 재면 고객 340 vs 캔버스 350 이 되어 게이트가 엉뚱한 이유로 운다.
 */
export const MOBILE_CONTENT_WIDTH = detailColumnWidth(MOBILE_STAGE_WIDTH);

/**
 * 뷰포트별 **바깥 캔버스** 폭.
 * PC 는 칼럼이 곧 캔버스(768)지만, 모바일은 기기 폭(390) 안에 350 칼럼이 들어앉는다 —
 * 좌우 여백까지 보여 줘야 관리자가 "모바일에서 사진이 화면에 꽉 차지 않는다" 를 이해한다.
 */
export function stageCanvasWidth(viewport: StageViewport): number {
  return viewport === "mobile" ? MOBILE_STAGE_WIDTH : DETAIL_CONTENT_WIDTH;
}

/**
 * 뷰포트별 **콘텐츠 칼럼** 폭 — 글과 사진이 실제로 그려지는 폭 (PC 768 / 모바일 350).
 *
 * PC 가 상수 768 인 이유: 데스크톱에서는 `max-w-3xl` 이 먼저 물려서 여백 계산과 무관하게
 * 칼럼이 768 로 고정된다. 실측으로 확인했다 — 창 1440 에서 padding 56px, 칼럼 768,
 * 상세 이미지 766 (SPEC §0 의 PC 행과 일치).
 */
export function stageContentWidth(viewport: StageViewport): number {
  return viewport === "mobile" ? MOBILE_CONTENT_WIDTH : DETAIL_CONTENT_WIDTH;
}

export interface EditorStageInfo {
  /**
   * 콘텐츠 칼럼 폭 (문서 공간 px) — PC 768 / 모바일 350.
   *
   * **불변식: 여기 실린 값은 지금 화면에 그려져 있는 폭이다.**
   * PC↔모바일 전환은 칼럼 `width` 를 420ms 동안 애니메이션하는데, 그동안 목표값을
   * 방송하면 드래그 좌표 계산이 화면과 다른 폭을 기준으로 돌아간다. 그래서
   * EditorStage 는 목표값이 아니라 **측정된 현재 폭**을 싣는다(전환 중에도 매 프레임).
   */
  contentWidth: number;
  /**
   * 스테이지 축소율. 1이면 축소 없음. **1을 넘지 않는다**(확대 금지).
   * contentWidth 와 같은 불변식을 따른다 — 화면에 실제로 적용된 배율만 방송한다.
   */
  scale: number;
  /** 콘텐츠 칼럼의 화면 좌표 좌측 끝 — 스크롤·리사이즈마다 갱신된다 */
  stageLeft: number;
  viewport: StageViewport;
}

/**
 * 기본값은 "PC, 축소 없음, 좌측 0" 이다.
 * 스테이지 밖에서 실수로 쓰이면 드래그가 어긋나지만 화면이 죽지는 않는다 —
 * 편집기 한복판에서 예외를 던지는 것보다 낫다고 판단했다.
 */
export const EditorStageContext = createContext<EditorStageInfo>({
  contentWidth: DETAIL_CONTENT_WIDTH,
  scale: 1,
  stageLeft: 0,
  viewport: "pc",
});

export function useEditorStage(): EditorStageInfo {
  return useContext(EditorStageContext);
}
