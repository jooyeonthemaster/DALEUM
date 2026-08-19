/* ============================================================
   상세페이지 편집기 — 사진 노드(detailImage)

   속성 이름은 문서 모델(lib/detail-doc-v2 의 ImageNode)·저장 계약(tiptap-bridge)과
   한 글자라도 어긋나면 안 된다. 어긋나면 저장은 조용히 성공하고 값만 사라진다
   (모르는 속성은 ProseMirror 가 버린다).

   ── 노드뷰는 여기서 붙이지 않는다 ──
   폭 드래그 핸들이 달린 React 뷰는 별도 파일에 있고 여기서는 주입만 받는다.
   스키마가 화면 컴포넌트를 import 하기 시작하면 스키마만 필요한 자리에도 React 가 딸려 온다.
   ============================================================ */

import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";
import { isAllowedImageSrc } from "@/lib/image-sources";
import { NOMINAL_HEIGHT, NOMINAL_WIDTH, type Align } from "@/lib/detail-doc-v2";
import { attrString, blockIdAttribute, readAlign, readNumber } from "./schema-attrs";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    detailImageNode: {
      /** 사진 한 장을 커서 자리에 넣는다 */
      setDetailImage: (attrs: DetailImageAttrs) => ReturnType;
    };
  }
}

export interface DetailImageOptions {
  /** `ReactNodeViewRenderer(DetailImageView)` 를 그대로 받는다 */
  nodeView: NodeViewRenderer | null;
  HTMLAttributes: Record<string, string>;
}

/** setDetailImage 로 넘기는 값 — 이름은 문서 모델(ImageNode)과 같다 */
export interface DetailImageAttrs {
  src: string;
  alt?: string;
  /** 파일의 실제 픽셀 치수. 종횡비 고정의 기준이므로 반드시 실측값을 넣는다 */
  width: number;
  height: number;
  /** 콘텐츠 칼럼 대비 폭(%) — 저장되는 것은 px 이 아니라 이것뿐이다 (SPEC §5.1) */
  widthPct?: number;
  align?: Align;
  /** 크롭 전 원본 — 다시 자를 때 원본에서 시작하기 위해 남긴다 */
  sourceUrl?: string | null;
  blockId?: string | null;
}

/**
 * height 는 원본 파일의 치수일 뿐 "렌더 높이"가 아니다.
 * 렌더 높이는 언제나 widthPct 와 원본 종횡비에서 파생한다(resize-math.renderedHeight).
 * 자유 변형을 주지 않는 것이 제품 사진이 찌그러지지 않는 유일한 보장이다 (SPEC §5.2).
 */
export const DetailImage = Node.create<DetailImageOptions>({
  name: "detailImage",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return { nodeView: null, HTMLAttributes: {} };
  },

  addAttributes() {
    return {
      src: {
        default: "",
        parseHTML: (element) => element.getAttribute("src") ?? "",
        renderHTML: (attrs: Record<string, unknown>) => {
          const value = attrString(attrs, "src");
          return value ? { src: value } : {};
        },
      },
      alt: {
        default: "",
        parseHTML: (element) => element.getAttribute("alt") ?? "",
        renderHTML: (attrs: Record<string, unknown>) => {
          const value = attrString(attrs, "alt");
          return value ? { alt: value } : {};
        },
      },
      width: {
        default: NOMINAL_WIDTH,
        parseHTML: (element) => readNumber(element.getAttribute("width"), NOMINAL_WIDTH),
        renderHTML: (attrs: Record<string, unknown>) => ({
          width: String(readNumber(attrString(attrs, "width"), NOMINAL_WIDTH)),
        }),
      },
      height: {
        default: NOMINAL_HEIGHT,
        parseHTML: (element) => readNumber(element.getAttribute("height"), NOMINAL_HEIGHT),
        renderHTML: (attrs: Record<string, unknown>) => ({
          height: String(readNumber(attrString(attrs, "height"), NOMINAL_HEIGHT)),
        }),
      },
      widthPct: {
        default: 100,
        parseHTML: (element) => readNumber(element.getAttribute("data-width-pct"), 100),
        renderHTML: (attrs: Record<string, unknown>) => {
          const value = readNumber(attrString(attrs, "widthPct"), 100);
          return value === 100 ? {} : { "data-width-pct": String(value) };
        },
      },
      align: {
        // 사진의 기본은 가운데다 — 글(왼쪽)과 기본값이 달라 공용 속성을 그대로 쓸 수 없다
        default: "center",
        parseHTML: (element) => readAlign(element.getAttribute("data-align"), "center"),
        renderHTML: (attrs: Record<string, unknown>) => {
          const value = readAlign(attrString(attrs, "align"), "center");
          return value === "center" ? {} : { "data-align": value };
        },
      },
      sourceUrl: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-source-url"),
        renderHTML: (attrs: Record<string, unknown>) => {
          const value = attrString(attrs, "sourceUrl");
          return value ? { "data-source-url": value } : {};
        },
      },
      blockId: blockIdAttribute,
    };
  },

  /**
   * img 는 받되 **우리가 그릴 수 있는 주소만** 받는다.
   *
   * 이 규칙이 없으면 다른 곳에서 복사해 온 사진이 붙여넣는 순간 사라지지만,
   * 아무 img 나 받아들이면 더 나쁘게 터진다:
   *  · data:/blob: — 저장은 되는데 다시 열 때 parseDetailDocJson 이 `^https?://` 로
   *    걸러 노드를 통째로 버린다 → "저장했는데 사진이 없다".
   *  · 외부 https — 고객 페이지까지 흘러가고 next/image 가 remotePatterns 밖이라며
   *    **렌더 중에 throw 한다** → 그 상품 페이지가 죽는다.
   * 그래서 next.config.ts 와 같은 목록(lib/image-sources)으로 문을 지킨다.
   *
   * getAttrs 가 false 를 돌려주면 ProseMirror 는 이 규칙을 아예 적용하지 않아
   * 남의 사진이 문서에 들어오지 못한다. 대신 조립부(DetailEditor)가 handlePaste/
   * handleDrop 으로 파일을 받아 업로드한 뒤 setDetailImage 로 넣는다 —
   * 그래야 "붙여넣기가 그냥 안 된다"는 민원이 안 생긴다.
   */
  parseHTML() {
    return [
      {
        tag: "img[src]",
        getAttrs: (element: HTMLElement) =>
          isAllowedImageSrc(element.getAttribute("src") ?? "") ? null : false,
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "img",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { "data-detail-image": "" }),
    ];
  },

  addNodeView() {
    return this.options.nodeView;
  },

  addCommands() {
    return {
      setDetailImage:
        (attrs: DetailImageAttrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { ...attrs } }),
    };
  },
});
