/* ============================================================
   상세페이지 편집기 — 칸 공용 속성(스키마 조각)

   정렬·lead·id·크기는 "칸이라면 다 갖는 성질"이라 글 노드(extensions.ts)와
   사진 노드(image-node.ts)가 함께 쓴다. 둘 중 한쪽에 두면 다른 쪽이 그 파일을
   import 하게 되고, 조립부(extensions.ts)는 다시 사진 노드를 import 하므로
   고리가 생긴다(순환 import → 상수가 초기화 전에 읽히는 사고). 그래서 공용 조각만
   여기 내려놓고 두 파일이 이 파일만 바라보게 했다.

   ── 두 가지 출력 규칙 ──
   1) data-* 는 **기본값이면 내보내지 않는다**. 내보내면 문단마다 data-align="left" 가
      붙어 DOM 을 읽을 수 없게 되고 붙여넣기 결과물도 지저분해진다.
      기본값은 default 로 되살아나므로 손해가 없다.
   2) class 는 **기본값이어도 항상 내보낸다**. 고객 렌더러(DetailDocRenderer)가
      ALIGN_CLASS[align] · flowSizeClass(size) 를 늘 붙이기 때문이다.
      한쪽만 빼면 그 순간 편집 캔버스와 고객 화면의 글자 크기·정렬이 갈라진다
      (SPEC §1 G1-b — 폭이 같아도 글자가 다르면 줄바꿈 위치가 달라진다).
   ============================================================ */

import type { Attribute } from "@tiptap/core";
import { ALIGN_CLASS, flowSizeClass } from "@/components/catalog/detail-prose";
import type { Align, SpacerSize, TextSize } from "@/lib/detail-doc-v2";

/* ------------------------------------------------------------
   읽기 도우미

   ProseMirror 속성은 스키마상 무엇이든 들어올 수 있다(옛 저장본·붙여넣기·손수정).
   그래서 **읽는 지점 한 곳에서** 허용값으로 좁힌다. 좁히지 않으면 잘못된 값이
   그대로 문서에 남아 고객 화면에서야 티가 난다.
   ------------------------------------------------------------ */

export function attrString(attrs: Record<string, unknown>, key: string): string | null {
  const value = attrs[key];
  if (typeof value === "string" && value) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

export function readAlign(raw: string | null, fallback: Align): Align {
  return raw === "left" || raw === "center" || raw === "right" ? raw : fallback;
}

export function readTextSize(raw: string | null): TextSize {
  return raw === "sm" || raw === "lg" ? raw : "base";
}

export function readSpacerSize(raw: string | null): SpacerSize {
  return raw === "sm" || raw === "lg" ? raw : "md";
}

export function readNumber(raw: string | null, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/* ------------------------------------------------------------
   공용 data-* 속성
   ------------------------------------------------------------ */

/** 정렬 — heading/paragraph 용(기본 왼쪽) */
export const alignAttribute: Attribute = {
  default: "left",
  parseHTML: (element) => readAlign(element.getAttribute("data-align"), "left"),
  renderHTML: (attrs: Record<string, unknown>) => {
    const value = readAlign(attrString(attrs, "align"), "left");
    const cls = { class: ALIGN_CLASS[value] };
    return value === "left" ? cls : { ...cls, "data-align": value };
  },
};

/** 구매 박스로 올릴 글인가 (SPEC §2.1) */
export const leadAttribute: Attribute = {
  default: false,
  parseHTML: (element) => element.getAttribute("data-lead") === "true",
  renderHTML: (attrs: Record<string, unknown>) =>
    attrs.lead === true ? { "data-lead": "true" } : {},
};

/**
 * 칸의 영구 식별자.
 *
 * keepOnSplit 을 끈 것과 parseHTML 을 버린 것은 **같은 사고의 앞뒤 문**이다.
 * Enter 로 문단을 나눌 때(keepOnSplit) 와 복사→붙여넣기 할 때(parseHTML) 모두
 * id 가 복제되면 한 문서에 같은 id 가 둘 생긴다. 고객 렌더러는 id 를 React key 로
 * 쓰므로(DetailDocRenderer) 중복 key 경고와 재조정 오작동이 따라온다.
 *
 * parseHTML 을 버려도 저장본은 멀쩡하다 — 문서를 열 때는 HTML 이 아니라
 * docToTiptap → JSON → setContent 경로로 들어와서 id 가 JSON 으로 그대로 살아 있고,
 * HTML 파싱은 붙여넣기·외부 유입 전용이기 때문이다. 그 길로 들어온 칸은
 * blockId=null 로 태어나 bridge 의 attrId 가 새 id 를 발급한다.
 * (renderHTML 의 data-block-id 출력은 남긴다 — 검수·디버깅에 쓰이고 해가 없다.)
 */
export const blockIdAttribute: Attribute = {
  default: null,
  keepOnSplit: false,
  parseHTML: () => null,
  renderHTML: (attrs: Record<string, unknown>) => {
    const value = attrString(attrs, "blockId");
    return value ? { "data-block-id": value } : {};
  },
};

/** 본문 크기 프리셋 — paragraph 전용 */
export const textSizeAttribute: Attribute = {
  default: "base",
  parseHTML: (element) => readTextSize(element.getAttribute("data-size")),
  renderHTML: (attrs: Record<string, unknown>) => {
    const value = readTextSize(attrString(attrs, "size"));
    const cls = { class: flowSizeClass(value) };
    return value === "base" ? cls : { ...cls, "data-size": value };
  },
};
