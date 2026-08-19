/* ============================================================
   상세페이지 본문 스타일 — 고객 화면과 편집 캔버스의 **단일 진실**

   왜 상수로 빼는가:
   편집기가 "고객 화면 그대로" 를 보여 주려면 두 화면이 같은 CSS 를 써야 한다.
   클래스를 편집기 쪽에 복사해 두면 어느 한쪽만 고쳐지는 날이 반드시 오고,
   그날부터 미리보기는 거짓말이 된다. 그래서 문자열을 한 곳에 두고 양쪽이 가져다 쓴다.
   (실측 기준값은 docs/DETAIL-EDITOR-SPEC.md §0 참고 — PC 768px / 모바일 340px)

   두 벌인 이유:
   · FLOW — 페이지 아래 「상품 상세」. 글과 사진이 순서대로 흐르는 에디토리얼 본문.
            StoryBlock 이 쓰던 검증된 스케일(15px/1.95)을 그대로 따른다.
   · LEAD — 가격 옆 구매 박스에 실리는 요약. 좁은 칼럼이라 촘촘해야 한다.
            DescriptionBlock 이 쓰던 컴팩트 스케일(13~14px)을 그대로 따른다.
   ============================================================ */

/** 상세 섹션 콘텐츠 칼럼 폭(px) — 고객 화면 `max-w-3xl` 과 같아야 한다 */
export const DETAIL_CONTENT_WIDTH = 768;

/** 편집기 모바일 스테이지 폭(px) — iPhone 기준폭 */
export const MOBILE_STAGE_WIDTH = 390;

/* 이미지 폭 스냅·하한 같은 '드래그 동작' 상수는 여기가 아니라
   components/admin/detail-editor/resize-math.ts 에 있다.
   그 파일이 아무것도 import 하지 않아야 순수 함수로 테스트할 수 있기 때문이다. */

/* ------------------------------------------------------------
   FLOW — 페이지 아래 「상품 상세」 (에디토리얼 본문)
   ------------------------------------------------------------ */

/* ── 줄바꿈 규칙을 클래스에 못 박는 이유 (G1-b 의 마지막 1mm) ──

   globals.css 는 줄바꿈을 **태그 이름**으로 건다:
     p            { text-wrap: pretty }   (globals.css:82)
     h1,h2,h3     { text-wrap: balance }  (globals.css:87)

   그런데 같은 문서를 두 렌더러가 서로 다른 태그로 그린다.
   고객 페이지에는 이미 h1(상품명)·h2(섹션 제목)가 있어 상세 본문 제목을 h3/h4 로 한 단계
   낮춰야 문서 개요가 맞는데(DetailDocRenderer), 편집 캔버스는 TipTap 스키마라 h2/h3 로 나온다.
   그래서 태그 기반 규칙이 한쪽에만 걸린다:
     · 작은제목 — 캔버스 h3(balance 걸림) vs 고객 h4(안 걸림)
     · 인용·목록칸 — 캔버스는 안쪽에 <p> 가 있어 pretty 가 걸리고, 고객은 글자를 직접 넣어 안 걸림
   text-wrap 은 상속되므로 폭·글자 크기가 같아도 **끊기는 지점이 달라진다.**
   여러 줄짜리 제목·인용에서 실제로 갈라지고, 그것이 바로 "고객 화면 그대로" 를 깨는 마지막 틈이다.

   태그를 맞추는 대신 **클래스에 명시**한다 — 태그는 두 화면이 각자의 이유로 달라야 하지만
   보이는 방식은 같아야 하기 때문이다. 여기 적어 두면 어느 태그로 그리든 결과가 같다. */
const BALANCE = "[text-wrap:balance]";
const PRETTY = "[text-wrap:pretty]";

export const FLOW = {
  /** 블록 사이 세로 리듬 */
  root: "space-y-5",
  heading2: `headline-serif pt-3 text-xl text-ink-900 first:pt-0 ${BALANCE}`,
  heading3: `headline-serif pt-2 text-[17px] text-ink-900 first:pt-0 ${BALANCE}`,
  paragraph: `leading-[1.95] text-ink-700 ${PRETTY}`,
  /** 본문 크기 프리셋 — paragraph 와 함께 쓴다 */
  sizeSm: "text-[13px]",
  sizeBase: "text-[15px]",
  sizeLg: "text-[17px]",
  list: "space-y-2.5",
  listItem: `relative pl-6 text-[15px] leading-[1.85] text-ink-700 before:absolute before:left-0 before:text-ink-300 ${PRETTY}`,
  /* ── 마커는 **항목이 아니라 목록에** 붙인다 ──
     편집 캔버스(TipTap)에서 listItem 의 클래스는 스키마에 하나로 고정돼 있어
     "부모가 ul 이냐 ol 이냐" 에 따라 바꿀 수 없다. 그래서 마커를 목록 쪽 규칙으로 올리고
     고객 렌더러도 똑같이 목록에 붙인다 — 한 벌만 두면 두 화면이 갈라질 수 없다.

     번호에 `list-decimal` 을 쓰지 않는 이유: Tailwind preflight 가 ol 의 padding 을
     0 으로 지워서(`*{padding:0}`) 브라우저 기본 마커가 list-style-position:outside
     기본값 그대로 **콘텐츠 칼럼 바깥**에 찍힌다. 실제로 편집 캔버스에서 번호가
     프레임 테두리 밖 회색 바탕 위에 떠 보였다. 그래서 불릿과 같은 ::before 로 그린다. */
  bulletList: "[&>li]:before:content-['—']",
  orderedList:
    "[counter-reset:detail-item] [&>li]:[counter-increment:detail-item] [&>li]:before:content-[counter(detail-item)'.']",
  quote: `border-l-2 border-forest-300 pl-5 text-[15px] leading-[1.9] italic text-ink-600 ${PRETTY}`,
  divider: "h-px bg-ink-200",
  /** 이미지 덩어리 테두리 — 슬라이스 경계에 선이 생기지 않도록 덩어리에 한 번만 두른다 */
  imageFrame: "border border-ink-100 bg-cream-100",
  image: "block h-auto w-full",
} as const;

/**
 * 여백(spacer) 블록 높이(px).
 *
 * 고객 렌더러(DetailDocRenderer)와 편집 캔버스(EditorStage)가 **같은 값**을 써야 한다.
 * 캔버스 쪽에 h-4/h-8/h-16 같은 클래스로 다시 적으면 어느 한쪽만 바뀌는 날이 오고,
 * 그날부터 관리자가 넣은 여백이 편집기에서는 안 보이는데 고객 화면만 벌어진다
 * (실제로 그런 상태였다 — 캔버스에 [data-spacer] 규칙이 아예 없었다).
 */
export const SPACER_HEIGHT = { sm: 16, md: 32, lg: 64 } as const;

/* ------------------------------------------------------------
   LEAD — 가격 옆 구매 박스 요약 (컴팩트)
   기존 DescriptionBlock 과 같은 값이어야 한다 — 이 화면은 이미 운영 중이다.
   ------------------------------------------------------------ */

export const LEAD = {
  root: "space-y-4",
  heading: "text-sm font-medium text-ink-800",
  paragraph: "text-sm leading-[1.85] text-ink-600",
  list: "space-y-1.5",
  listItem:
    "relative pl-5 text-[13px] leading-[1.8] text-ink-500 before:absolute before:left-0 before:text-ink-300 before:content-['—']",
} as const;

/** 정렬 클래스 */
export const ALIGN_CLASS = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
} as const;

/** 이미지 정렬 — 폭이 100% 미만일 때 어느 쪽에 붙을지 */
export const IMAGE_ALIGN_CLASS = {
  left: "mr-auto",
  center: "mx-auto",
  right: "ml-auto",
} as const;

/** 문단 크기 프리셋 → 클래스 */
export function flowSizeClass(size: "sm" | "base" | "lg"): string {
  if (size === "sm") return FLOW.sizeSm;
  if (size === "lg") return FLOW.sizeLg;
  return FLOW.sizeBase;
}

/** 강조색 인라인 — 브랜드가 정한 한 가지만 준다 */
export const ACCENT_CLASS = "text-forest-700";
export const BOLD_CLASS = "font-semibold text-ink-900";
