/* ============================================================
   상세페이지 편집기 — TipTap 확장 묶음

   이 파일의 유일한 책임은 **스키마 계약**이다.
   tiptap-bridge.ts 가 읽고 쓰는 노드/속성 이름이 여기 정의와 한 글자라도 어긋나면
   저장은 조용히 성공하고 내용만 사라진다(모르는 속성은 ProseMirror 가 버린다).
   그래서 이름은 bridge 쪽 문자열을 그대로 따랐다 — 짐작하지 말고 두 파일을 나란히 볼 것.

     노드   heading / paragraph / bulletList / orderedList / blockquote /
            horizontalRule / spacer / detailImage
     마크   bold / accent
     속성   align · lead · size · blockId · widthPct · sourceUrl …

   ── 왜 이렇게 좁게 여는가 ──
   SPEC §2.2: 글꼴·임의 크기·임의 색상은 주지 않는다. 관리자가 고를 수 있는 것은
   프리셋뿐이다. 확장을 넉넉히 켜 두면 브랜드가 무너지는 것보다 먼저,
   **저장되지 않는 서식**이 생긴다(문서 모델에 자리가 없으므로 조용히 증발한다).
   그래서 문서 모델이 담을 수 있는 것만 켠다. 이것이 아래 false 들의 진짜 이유다.

   ── 스타일은 여기서 '주입'한다 ──
   캔버스가 고객 화면과 같아 보이려면 같은 CSS 를 써야 한다(SPEC §4.1).
   그런데 편집 캔버스의 DOM 을 만드는 것은 React 가 아니라 이 스키마다.
   그래서 detail-prose.ts 의 클래스 상수를 노드 renderHTML 에 그대로 실어 보낸다.
   **값을 손으로 다시 적지 않는다** — globals.css 에 적는 것도 금지다(SPEC §8).
   mergeAttributes 는 class 를 덮어쓰지 않고 이어 붙이므로(@tiptap/core 의
   mergeAttributes 안 key === "class" 분기) 노드 클래스와 속성 클래스가 함께 살아남는다.

   ── 파일이 셋으로 나뉜 이유 ──
   schema-attrs.ts  칸 공용 속성(정렬·lead·id·크기)
   image-node.ts    사진 노드(속성 8개 + 출처 검사 + 노드뷰 주입구)
   extensions.ts    글 노드·마크·조립  ← 이 파일
   한 파일에 두면 500줄을 넘고, 사진 노드를 볼 때마다 글 스키마를 스크롤해야 한다.
   ============================================================ */

import {
  Extension,
  Mark,
  Node,
  mergeAttributes,
  type Extensions,
  type NodeViewRenderer,
} from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extension-placeholder";
/* 아래 셋은 StarterKit 이 이미 의존하는 하위 패키지다(같은 3.30.2 로 고정돼 있다).
   StarterKit.configure 로는 할 수 없는 두 가지 때문에 직접 가져온다:
   ① 제목은 레벨마다 클래스가 다르다 ② 인용·목록칸은 content 를 좁혀야 한다. */
import { Blockquote } from "@tiptap/extension-blockquote";
import { Heading } from "@tiptap/extension-heading";
import { ListItem } from "@tiptap/extension-list";
import { ACCENT_CLASS, BOLD_CLASS, FLOW } from "@/components/catalog/detail-prose";
import type { SpacerSize } from "@/lib/detail-doc-v2";
import {
  alignAttribute,
  attrString,
  blockIdAttribute,
  leadAttribute,
  readSpacerSize,
  textSizeAttribute,
} from "./schema-attrs";
import { DetailImage } from "./image-node";

export { DetailImage } from "./image-node";
export type { DetailImageAttrs, DetailImageOptions } from "./image-node";

/* ------------------------------------------------------------
   기본 묶음
   ------------------------------------------------------------ */

/**
 * 꺼 둔 것들에는 각각 이유가 있다:
 *  · link/code/codeBlock — 제조사 상세페이지에 쓸 일이 없고, 문서 모델에 담을 자리도 없다.
 *  · strike/italic/underline — SPEC §2.2 가 허용한 인라인은 굵게·강조색 둘뿐이다.
 *    켜 두면 Mod-i / Mod-u 기본 단축키가 살아 있어, 관리자가 기울임을 넣고 저장했을 때
 *    아무 경고 없이 사라진다. "되는 줄 알았는데 안 되는" 것이 제일 나쁘다.
 *  · heading/blockquote/listItem — 끄고 아래 확장본으로 갈아 끼운다
 *    (레벨별 클래스, content 좁히기 — configure 로는 둘 다 불가능하다).
 *  · horizontalRule 은 켠다 — 구분선(divider) 칸이 이 노드로 저장된다.
 *  · dropcursor/gapcursor/trailingNode 는 기본값 유지 — 각각 블록 끌어놓기 표시,
 *    사진처럼 통짜인 칸 사이에 커서 놓기, 문서 맨 끝에 쓸 자리 확보를 담당한다.
 *    끄면 "사진 뒤에 글을 못 쓴다"는 고전적인 민원이 그대로 돌아온다.
 *
 * class 는 전부 detail-prose.ts 에서 온다. 고객 렌더러가 쓰는 것과 **같은 문자열**이라
 * 글자 크기·행간·색·목록 마커가 구조적으로 갈라질 수 없다.
 */
export const DetailStarterKit = StarterKit.configure({
  heading: false,
  blockquote: false,
  listItem: false,
  link: false,
  code: false,
  codeBlock: false,
  strike: false,
  italic: false,
  underline: false,
  paragraph: { HTMLAttributes: { class: FLOW.paragraph } },
  bold: { HTMLAttributes: { class: BOLD_CLASS } },
  bulletList: { HTMLAttributes: { class: `${FLOW.list} ${FLOW.bulletList}` } },
  /* 번호 목록: 고객 화면은 번호를 <span class="absolute left-0"> 로 직접 그리지만,
     스키마는 항목 안에 그런 span 을 넣을 수 없다(항목 내용은 관리자가 친 글뿐이다).
     그래서 ① 항목에 붙은 '—' 마커를 끄고 ② 브라우저 기본 번호를 되살린다.
     둘 다 값이 아니라 '되돌리기'라서 detail-prose 를 베끼는 것이 아니다.
     남는 차이는 번호의 x 위치와 색뿐이고, 글의 줄바꿈 위치에는 영향이 없다. */
  orderedList: {
    /* `list-decimal` 은 쓰지 않는다. preflight 가 ol 의 padding 을 0 으로 지워서
       브라우저 기본 마커(list-style-position:outside)가 콘텐츠 칼럼 **밖**에 찍힌다 —
       실제로 번호가 캔버스 프레임 테두리 바깥 회색 바탕 위에 떠 보였다.
       고객 렌더러와 같은 ::before 카운터 방식을 공유 상수에서 가져다 쓴다. */
    HTMLAttributes: { class: `${FLOW.list} ${FLOW.orderedList}` },
  },
  /* 구분선: 고객은 <div class="h-px bg-ink-200"> 인데 캔버스는 <hr> 이다.
     preflight 가 hr 에만 border-top:1px 을 더 주므로 그대로 두면 2px 로 보인다.
     border-0 은 그 차이를 상쇄하는 것이지 새 스타일이 아니다. */
  horizontalRule: { HTMLAttributes: { class: FLOW.divider + " border-0" } },
});

/* ------------------------------------------------------------
   글 노드 — 고객 렌더러와 1:1 로 맞춘 확장본
   ------------------------------------------------------------ */

/**
 * 제목 — 레벨마다 클래스가 다르다.
 * configure({ HTMLAttributes }) 는 레벨을 모르므로(h2·h3 에 같은 클래스가 붙는다)
 * renderHTML 을 갈아 끼운다.
 *
 * 태그가 고객(h3/h4)과 다른 것은 의도다. 고객 페이지는 위에 h1·h2 가 이미 있어
 * 문서 개요상 h3/h4 여야 하지만 캔버스는 편집 화면이라 그 제약이 없다.
 * 보이는 크기는 태그가 아니라 클래스가 정한다 — preflight 가 제목 태그의 기본
 * 크기·굵기를 지우기 때문이다. 그래서 태그는 두고 클래스만 맞춘다.
 */
export const DetailHeading = Heading.extend({
  renderHTML({ node, HTMLAttributes }) {
    const isSmall = node.attrs.level === 3;
    return [
      isSmall ? "h3" : "h2",
      mergeAttributes(HTMLAttributes, { class: isSmall ? FLOW.heading3 : FLOW.heading2 }),
      0,
    ];
  },
}).configure({ levels: [2, 3] });

/**
 * 인용 — content 를 "paragraph" 로 좁힌다.
 *
 * 기본값은 "block+" 라 인용 안에 문단을 여러 개, 심지어 사진·여백까지 넣을 수 있다.
 * 그런데 저장 계약은 인용에서 **첫 문단 하나만** 읽는다(tiptap-bridge.ts 의 blockquote 분기).
 * 즉 넓은 스키마는 "저장은 됐는데 다시 여니 글이 없어졌다"를 만드는 장치다.
 * 좁혀 두면 인용 안에서 Enter 로 둘째 문단을 만들 수 없고(splitBlock 이 canSplit 에서
 * 막혀 아무 일도 하지 않는다. 빈 줄이면 liftEmptyBlock 이 인용 밖으로 빼 준다),
 * 그래서 저장 때 사라질 글이 애초에 생기지 않는다.
 */
export const DetailBlockquote = Blockquote.extend({
  content: "paragraph",
}).configure({ HTMLAttributes: { class: FLOW.quote } });

/**
 * 목록칸 — 같은 이유로 content 를 "paragraph" 로 좁힌다.
 *
 * 기본값 "paragraph block*" 는 Tab(sinkListItem)으로 하위 목록을 만들 수 있게 하는데,
 * bridge 는 항목에서 첫 문단 하나만 읽으므로(tiptap-bridge.ts 의 itemInline) 들여쓴
 * 항목이 저장 때 전부 사라진다. 좁히면 sinkListItem 이 실패해 Tab 이 아무 일도 하지
 * 않는다 — "눌러도 안 되는" 편이 "됐다가 사라지는" 것보다 낫다.
 *
 * 마커(불릿 '—' / 번호)는 여기가 아니라 **목록 쪽** 규칙이 붙인다 —
 * TipTap 에서 항목 클래스는 스키마에 하나로 고정돼 부모가 ul 인지 ol 인지 구분할 수 없기 때문이다.
 */
export const DetailListItem = ListItem.extend({
  content: "paragraph",
}).configure({ HTMLAttributes: { class: FLOW.listItem } });

/**
 * 공용 속성 확장.
 * 노드마다 addAttributes 를 덧붙이지 않고 한곳에 모은 이유는, 정렬·lead·id 가
 * "칸이라면 다 갖는 성질"이기 때문이다. 흩어 두면 새 칸을 추가할 때 하나씩 빠뜨린다.
 */
export const DetailBlockAttributes = Extension.create({
  name: "detailBlockAttributes",

  addGlobalAttributes() {
    return [
      {
        types: ["heading", "paragraph"],
        attributes: { align: alignAttribute, lead: leadAttribute, blockId: blockIdAttribute },
      },
      {
        // 크기 프리셋은 본문에만 — 제목 크기는 h2/h3 가 이미 정한다
        types: ["paragraph"],
        attributes: { size: textSizeAttribute },
      },
      {
        types: ["bulletList", "orderedList", "blockquote"],
        attributes: { lead: leadAttribute, blockId: blockIdAttribute },
      },
      {
        // 구분선은 글이 아니므로 lead 를 갖지 않는다 (문서 모델에도 자리가 없다)
        types: ["horizontalRule"],
        attributes: { blockId: blockIdAttribute },
      },
    ];
  },
});

/* ------------------------------------------------------------
   커맨드 계약
   ------------------------------------------------------------ */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    detailAccent: {
      /** 선택 구간을 강조색으로 */
      setAccent: () => ReturnType;
      /** 강조색 켜기/끄기 */
      toggleAccent: () => ReturnType;
      /** 강조색 해제 */
      unsetAccent: () => ReturnType;
    };
    detailSpacer: {
      /** 빈칸(여백) 하나를 커서 자리에 넣는다 */
      setSpacer: (size?: SpacerSize) => ReturnType;
    };
  }
}

/* ------------------------------------------------------------
   강조색 마크
   ------------------------------------------------------------ */

/**
 * 강조색은 브랜드가 정한 **한 가지뿐**이다(색상 피커 없음).
 * 클래스는 detail-prose.ts 에서 가져온다 — 손으로 적어 두면 고객 화면과 갈라진다.
 */
export const Accent = Mark.create({
  name: "accent",

  parseHTML() {
    return [{ tag: "span[data-accent]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-accent": "", class: ACCENT_CLASS }), 0];
  },

  addCommands() {
    return {
      setAccent:
        () =>
        ({ commands }) =>
          commands.setMark(this.name),
      toggleAccent:
        () =>
        ({ commands }) =>
          commands.toggleMark(this.name),
      unsetAccent:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});

/* ------------------------------------------------------------
   빈칸(여백)
   ------------------------------------------------------------ */

/**
 * 관리자가 "여기를 좀 띄우고 싶다"를 표현하는 유일한 수단.
 * 빈 문단을 여러 개 넣는 방식은 저장본을 더럽히고 미러 마크다운에서 사라지므로 막는다.
 *
 * atom 인 이유: 안에 커서가 들어갈 내용이 없다. draggable 인 이유: 순서 바꾸기 대상이다.
 *
 * 높이는 이 노드가 정하지 않고 `data-spacer` + `data-size` 만 내보낸다.
 * 칠하는 쪽은 **캔버스**다 — EditorStage.tsx 의 SPACER_RULES 가
 * `[data-detail-stage-column] [data-spacer][data-size="…"]` 로 높이를 준다.
 * 예전에는 이 계약의 상대방이 아예 없어서(그 CSS 가 저장소 어디에도 없었다)
 * 관리자가 「여백」을 눌러도 편집기에서는 아무 일이 없는데 고객 화면만 벌어졌다.
 * 이제 양쪽 다 detail-prose 의 SPACER_HEIGHT 한 벌만 읽으므로 값이 갈라질 수 없고,
 * 여기서 인라인 style 로 또 한 번 그리면 캔버스 규칙이 늘 덮여 '누가 소유하는지'가
 * 다시 흐려진다. 그래서 그리는 일은 한 곳에만 둔다.
 */
export const Spacer = Node.create({
  name: "spacer",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      size: {
        default: "md",
        parseHTML: (element) => readSpacerSize(element.getAttribute("data-size")),
        // 여백은 크기가 곧 존재 이유라 기본값이어도 항상 내보낸다
        renderHTML: (attrs: Record<string, unknown>) => ({
          "data-size": readSpacerSize(attrString(attrs, "size")),
        }),
      },
      blockId: blockIdAttribute,
    };
  },

  parseHTML() {
    return [{ tag: "div[data-spacer]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-spacer": "" })];
  },

  addCommands() {
    return {
      setSpacer:
        (size: SpacerSize = "md") =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { size } }),
    };
  },
});

/* ------------------------------------------------------------
   조립
   ------------------------------------------------------------ */

/** 빈 편집기에 뜨는 안내 문구 — 첫 화면에서 무엇부터 할지 알려 준다 */
export const DEFAULT_PLACEHOLDER = "여기에 상세 내용을 적거나, 사진을 끌어다 놓으세요.";

export interface BuildExtensionsOptions {
  /**
   * detailImage 의 노드뷰. `ReactNodeViewRenderer(DetailImageView)` 를 그대로 넘긴다.
   * 넘기지 않으면 사진은 평범한 img 로 그려지고 폭 드래그 핸들이 없다 —
   * 화면 없이 스키마만 필요할 때(문서 검증 등) 쓰는 형태다.
   */
  imageNodeView?: NodeViewRenderer | null;
  placeholder?: string;
}

/**
 * 편집기에 넘길 확장 배열을 만든다.
 * 함수로 둔 이유는 노드뷰 주입 때문만이 아니다 — 설정이 다른 편집기 두 개가
 * 한 배열을 공유하면 서로의 옵션을 덮어쓴다. 부를 때마다 새 배열을 준다.
 */
export function buildExtensions(opts: BuildExtensionsOptions = {}): Extensions {
  return [
    DetailStarterKit,
    DetailHeading,
    DetailBlockquote,
    DetailListItem,
    DetailBlockAttributes,
    Accent,
    Spacer,
    DetailImage.configure({ nodeView: opts.imageNodeView ?? null }),
    Placeholder.configure({
      placeholder: opts.placeholder ?? DEFAULT_PLACEHOLDER,
      showOnlyWhenEditable: true,
      includeChildren: false,
    }),
  ];
}
