/* ============================================================
   상세페이지 문서 모델 v2

   v1(lib/detail-doc.ts)은 "칸 목록 ↔ 마크다운 원문" 변환기였다. 표현할 수 있는 것이
   줄 단위 마크다운뿐이라 이미지 폭·정렬·본문 크기 같은 것을 담을 자리가 없었고,
   그래서 관리자는 "블로그처럼" 쓸 수 없었다.

   v2 는 문서를 jsonb(products.description_doc)에 그대로 담는다.
   대신 products.description 에는 v1 문법으로 직렬화한 **미러**를 함께 써 둔다 —
   메타데이터·b2b 페이지·상품 건강도·verify_catalog·일괄등록 시트가 전부
   description 을 읽고 있어서, 미러가 있으면 그 어느 것도 손대지 않아도 되기 때문이다.

   ── 하위호환의 핵심: lead ──
   고객 화면은 예나 지금이나 글을 '가격 옆 구매 박스'에, 사진을 '페이지 아래 상품 상세'에
   나눠 싣는다. v2 에서는 텍스트 노드의 lead 플래그가 그 자리를 정한다.
     lead: true  → 구매 박스 (오늘과 동일)
     lead: false → 하단 「상품 상세」 에서 사진과 순서대로 섞여 흐른다 (신규 기능)
   레거시 마크다운을 읽을 때는 **모든 텍스트에 lead: true** 를 준다. 그러면 하단은
   사진만 남아 오늘과 완전히 같아진다.
   (근거: 운영 27개 상품 전부가 '텍스트 덩어리 → 이미지 덩어리' 순서이고,
    둘이 두 번 이상 교차하는 상품은 0개였다 — 순서 정보가 손실되지 않는다.)
   ============================================================ */

export type Align = "left" | "center" | "right";
export type TextSize = "sm" | "base" | "lg";
export type SpacerSize = "sm" | "md" | "lg";

/** 인라인 조각 — 브랜드 붕괴를 막기 위해 굵게/강조색 두 가지만 둔다 */
export interface Inline {
  text: string;
  bold?: boolean;
  accent?: boolean;
}

export interface HeadingNode {
  id: string;
  type: "heading";
  level: 2 | 3;
  align: Align;
  text: Inline[];
  lead?: boolean;
}

export interface ParagraphNode {
  id: string;
  type: "paragraph";
  align: Align;
  size: TextSize;
  text: Inline[];
  lead?: boolean;
}

export interface ListNode {
  id: string;
  type: "list";
  ordered: boolean;
  items: Inline[][];
  lead?: boolean;
}

export interface QuoteNode {
  id: string;
  type: "quote";
  text: Inline[];
  lead?: boolean;
}

export interface DividerNode {
  id: string;
  type: "divider";
}

export interface SpacerNode {
  id: string;
  type: "spacer";
  size: SpacerSize;
}

export interface ImageNode {
  id: string;
  type: "image";
  src: string;
  alt: string;
  /** 파일의 실제 픽셀 치수 — next/image 가 요구하고, 종횡비 계산의 기준이다 */
  width: number;
  height: number;
  /** 콘텐츠 칼럼 대비 폭(%). 절대 px 이 아닌 이유는 SPEC §5.1 참고 */
  widthPct: number;
  align: Align;
  /** 크롭 전 원본 — 다시 자를 때 원본에서 시작하기 위해 남긴다 */
  sourceUrl?: string;
}

export type DetailNode =
  | HeadingNode
  | ParagraphNode
  | ListNode
  | QuoteNode
  | DividerNode
  | SpacerNode
  | ImageNode;

export type DetailNodeType = DetailNode["type"];

export interface DetailDoc {
  version: 2;
  blocks: DetailNode[];
}

/** 텍스트를 담는 노드인가 — lead 를 가질 수 있는 종류 */
export function isTextNode(
  node: DetailNode
): node is HeadingNode | ParagraphNode | ListNode | QuoteNode {
  return (
    node.type === "heading" ||
    node.type === "paragraph" ||
    node.type === "list" ||
    node.type === "quote"
  );
}

export function isImageNode(node: DetailNode): node is ImageNode {
  return node.type === "image";
}

/* ------------------------------------------------------------
   식별자
   ------------------------------------------------------------ */

let seq = 0;
export function nextId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  seq += 1;
  return `n${seq}-${Math.random().toString(16).slice(2, 8)}`;
}

/* ------------------------------------------------------------
   인라인 변환 — `**굵게**` 만 왕복한다 (StoryBlock.renderInline 과 같은 규칙)
   ------------------------------------------------------------ */

/** 평문 → Inline[] (별표 쌍을 굵게로) */
export function parseInline(raw: string): Inline[] {
  const parts = raw.split(/\*\*([^*]+)\*\*/g);
  const out: Inline[] = [];
  parts.forEach((part, i) => {
    if (part === "") return;
    if (i % 2 === 1) out.push({ text: part, bold: true });
    else out.push({ text: part });
  });
  return out.length > 0 ? out : [{ text: "" }];
}

/** Inline[] → 평문 (미러 직렬화용). 강조색은 마크다운에 자리가 없어 굵기로만 남는다 */
export function inlineToText(parts: Inline[]): string {
  return parts
    .map((p) => {
      const t = p.text;
      if (!t) return "";
      return p.bold ? `**${t}**` : t;
    })
    .join("");
}

/** Inline[] 이 실질적으로 비었는가 */
export function inlineIsEmpty(parts: Inline[]): boolean {
  return parts.every((p) => p.text.trim() === "");
}

/* ------------------------------------------------------------
   레거시 마크다운 → v2 문서
   정규식은 v1(lib/detail-doc.ts) / DescriptionBlock 과 반드시 같아야 한다.
   ------------------------------------------------------------ */

const IMAGE_RE = /^!\[([^\]]*?)(?:\|(\d+)x(\d+))?\]\((https?:\/\/.+)\)$/;
const HEADING_RE = /^(#{1,3})\s+(.+)$/;
const LIST_RE = /^[-•*]\s+(.+)$/;

/**
 * 치수 표기가 없는 옛 데이터용 공칭값 — DescriptionBlock 의 NOMINAL_* 과 같다.
 * 편집기 스키마(detail-editor/image-node.ts)도 같은 값을 써야 해서 내보낸다 —
 * 두 곳에 각각 적어 두면 한쪽만 바뀌는 날 이미지 종횡비가 조용히 어긋난다.
 */
export const NOMINAL_WIDTH = 1080;
export const NOMINAL_HEIGHT = 4000;

/**
 * 레거시 description 원문을 v2 문서로 읽는다.
 * 모든 텍스트에 lead: true 를 부여해 고객 화면 결과가 오늘과 같아지게 한다.
 */
export function docFromLegacyMarkdown(raw: string | null | undefined): DetailDoc {
  const blocks: DetailNode[] = [];
  if (!raw || !raw.trim()) return { version: 2, blocks };

  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({
      id: nextId(),
      type: "paragraph",
      align: "left",
      size: "base",
      text: parseInline(paragraph.join("\n")),
      lead: true,
    });
    paragraph = [];
  };
  const flushList = () => {
    if (list.length === 0) return;
    blocks.push({
      id: nextId(),
      type: "list",
      ordered: false,
      items: list.map((i) => parseInline(i)),
      lead: true,
    });
    list = [];
  };

  for (const rawLine of raw.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trim();

    const image = line.match(IMAGE_RE);
    if (image) {
      flushParagraph();
      flushList();
      blocks.push({
        id: nextId(),
        type: "image",
        src: image[4],
        alt: image[1] ?? "",
        width: Number(image[2]) || NOMINAL_WIDTH,
        height: Number(image[3]) || NOMINAL_HEIGHT,
        widthPct: 100,
        align: "center",
      });
      continue;
    }

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(HEADING_RE);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({
        id: nextId(),
        type: "heading",
        // 레거시는 #/##/### 를 모두 같은 크기로 그렸다 — h2 로 모은다
        level: heading[1].length >= 3 ? 3 : 2,
        align: "left",
        text: parseInline(heading[2]),
        lead: true,
      });
      continue;
    }

    const item = line.match(LIST_RE);
    if (item) {
      flushParagraph();
      list.push(item[1]);
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return { version: 2, blocks };
}

/* ------------------------------------------------------------
   v2 문서 → 레거시 마크다운 미러

   v2 전용 속성(widthPct·정렬·본문 크기·강조색)은 레거시 문법에 자리가 없어 버려진다.
   미러는 읽기 전용 폴백이므로 이것이 정상이다 — 진실은 언제나 description_doc 이다.
   ------------------------------------------------------------ */

export function docToLegacyMarkdown(doc: DetailDoc): string {
  const chunks: string[] = [];

  for (const node of doc.blocks) {
    if (node.type === "heading") {
      const text = inlineToText(node.text).replace(/\s+/g, " ").trim();
      if (text) chunks.push(`${node.level === 3 ? "###" : "##"} ${text}`);
      continue;
    }
    if (node.type === "paragraph") {
      const text = inlineToText(node.text)
        .replace(/\r\n/g, "\n")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .join("\n")
        .trim();
      if (text) chunks.push(text);
      continue;
    }
    if (node.type === "quote") {
      const text = inlineToText(node.text).replace(/\s+/g, " ").trim();
      if (text) chunks.push(text);
      continue;
    }
    if (node.type === "list") {
      const items = node.items
        .map((i) => inlineToText(i).replace(/\s+/g, " ").trim())
        .filter(Boolean);
      if (items.length > 0) chunks.push(items.map((i) => `- ${i}`).join("\n"));
      continue;
    }
    if (node.type === "image") {
      if (!node.src) continue;
      const alt = node.alt.replace(/[[\]|]/g, " ").replace(/\s+/g, " ").trim();
      const dims = node.width > 0 && node.height > 0 ? `|${node.width}x${node.height}` : "";
      chunks.push(`![${alt}${dims}](${node.src})`);
      continue;
    }
    // divider / spacer 는 레거시 문법에 표현이 없다 — 미러에서는 생략한다
  }

  return chunks.join("\n\n");
}

/* ------------------------------------------------------------
   유틸
   ------------------------------------------------------------ */

/** 문서가 실질적으로 비었는가 (저장 시 null 로 보낼지 판단) */
export function docIsEmpty(doc: DetailDoc | null | undefined): boolean {
  if (!doc || doc.blocks.length === 0) return true;
  return doc.blocks.every((n) => {
    if (n.type === "image") return !n.src;
    if (n.type === "divider" || n.type === "spacer") return true;
    if (n.type === "list") return n.items.every(inlineIsEmpty);
    return inlineIsEmpty(n.text);
  });
}

/** 이미지 노드만 순서대로 */
export function docImages(doc: DetailDoc): ImageNode[] {
  return doc.blocks.filter(isImageNode);
}

/**
 * 이미지 alt 를 "{상품명} 상세 이미지 {n}" 으로 다시 매긴다.
 * 1..N 로 연속돼야 scripts/verify_catalog.mjs 의 연속성 검사를 통과한다.
 */
export function renumberImages(doc: DetailDoc, productName: string): DetailDoc {
  let n = 0;
  return {
    version: 2,
    blocks: doc.blocks.map((node) => {
      if (node.type !== "image") return node;
      n += 1;
      return { ...node, alt: `${productName || "상품"} 상세 이미지 ${n}` };
    }),
  };
}

/** 구매 박스에 실릴 노드들 */
export function leadNodes(doc: DetailDoc): DetailNode[] {
  return doc.blocks.filter((n) => isTextNode(n) && n.lead === true);
}

/** 하단 「상품 상세」 에 흐를 노드들 — lead 가 아닌 전부 */
export function flowNodes(doc: DetailDoc): DetailNode[] {
  return doc.blocks.filter((n) => !(isTextNode(n) && n.lead === true));
}

/** 하단 섹션에 보일 것이 있는가 (섹션 노출 판단용) */
export function hasFlowContent(doc: DetailDoc): boolean {
  return flowNodes(doc).some((n) => {
    if (n.type === "image") return Boolean(n.src);
    if (n.type === "divider" || n.type === "spacer") return true;
    if (n.type === "list") return !n.items.every(inlineIsEmpty);
    if (isTextNode(n)) return !inlineIsEmpty(n.text);
    return false;
  });
}

/**
 * 알 수 없는 값을 DetailDoc 으로 안전하게 읽는다 (DB jsonb → 앱).
 * 형태가 조금이라도 어긋나면 null 을 돌려 호출부가 레거시 경로로 떨어지게 한다 —
 * 반쯤 읽힌 문서로 고객 화면을 그리는 것이 가장 나쁘다.
 */
export function parseDetailDocJson(value: unknown): DetailDoc | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.version !== 2 || !Array.isArray(v.blocks)) return null;

  const blocks: DetailNode[] = [];
  for (const raw of v.blocks) {
    const node = coerceNode(raw);
    if (node) blocks.push(node);
  }
  return { version: 2, blocks };
}

function coerceInline(value: unknown): Inline[] {
  if (!Array.isArray(value)) return [{ text: "" }];
  const out: Inline[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.text !== "string") continue;
    out.push({
      text: r.text,
      ...(r.bold === true ? { bold: true as const } : {}),
      ...(r.accent === true ? { accent: true as const } : {}),
    });
  }
  return out.length > 0 ? out : [{ text: "" }];
}

function coerceAlign(value: unknown): Align {
  return value === "center" || value === "right" ? value : "left";
}

function coerceNode(raw: unknown): DetailNode | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" && r.id ? r.id : nextId();
  const lead = r.lead === true ? { lead: true as const } : {};

  switch (r.type) {
    case "heading":
      return {
        id,
        type: "heading",
        level: r.level === 3 ? 3 : 2,
        align: coerceAlign(r.align),
        text: coerceInline(r.text),
        ...lead,
      };
    case "paragraph":
      return {
        id,
        type: "paragraph",
        align: coerceAlign(r.align),
        size: r.size === "sm" || r.size === "lg" ? r.size : "base",
        text: coerceInline(r.text),
        ...lead,
      };
    case "list":
      return {
        id,
        type: "list",
        ordered: r.ordered === true,
        items: Array.isArray(r.items) ? r.items.map(coerceInline) : [],
        ...lead,
      };
    case "quote":
      return { id, type: "quote", text: coerceInline(r.text), ...lead };
    case "divider":
      return { id, type: "divider" };
    case "spacer":
      return { id, type: "spacer", size: r.size === "sm" || r.size === "lg" ? r.size : "md" };
    case "image": {
      if (typeof r.src !== "string" || !/^https?:\/\//.test(r.src)) return null;
      const width = Number(r.width) || NOMINAL_WIDTH;
      const height = Number(r.height) || NOMINAL_HEIGHT;
      const pct = Number(r.widthPct);
      return {
        id,
        type: "image",
        src: r.src,
        alt: typeof r.alt === "string" ? r.alt : "",
        width,
        height,
        widthPct: Number.isFinite(pct) ? Math.min(100, Math.max(5, pct)) : 100,
        align: coerceAlign(r.align),
        ...(typeof r.sourceUrl === "string" ? { sourceUrl: r.sourceUrl } : {}),
      };
    }
    default:
      return null;
  }
}
