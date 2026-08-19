/* ============================================================
   DetailDoc ↔ TipTap JSON 변환

   편집기는 TipTap(ProseMirror) 문서를 다루고, 저장·렌더는 DetailDoc 을 다룬다.
   두 표현을 왕복 손실 없이 오가는 것이 이 파일의 유일한 책임이다.

   왕복 불변식(둘 다 테스트로 지킨다):
     docToTiptap(tiptapToDoc(x)) 의 의미가 x 와 같다
     tiptapToDoc(docToTiptap(y)) 의 의미가 y 와 같다
   "의미가 같다" 인 이유: id 는 새로 발급될 수 있고 빈 텍스트 노드는 정규화된다.
   ============================================================ */

import {
  nextId,
  type Align,
  type DetailDoc,
  type DetailNode,
  type Inline,
  type TextSize,
} from "@/lib/detail-doc-v2";

/** ProseMirror JSON 의 최소 형태 — 우리가 쓰는 부분만 */
export interface PMNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  text?: string;
  marks?: { type: string }[];
}

export interface PMDoc {
  type: "doc";
  content: PMNode[];
}

/* ------------------------------------------------------------
   인라인
   ------------------------------------------------------------ */

/**
 * Inline[] → ProseMirror text 노드들.
 * 문단 안의 줄바꿈은 hardBreak 노드로 바꾼다 — ProseMirror text 노드는 \n 을
 * 담을 수 없다(담으면 조용히 공백이 되어 관리자가 나눈 줄이 사라진다).
 */
export function inlineToPM(parts: Inline[]): PMNode[] {
  const out: PMNode[] = [];
  for (const part of parts) {
    if (!part.text) continue;
    const marks: { type: string }[] = [];
    if (part.bold) marks.push({ type: "bold" });
    if (part.accent) marks.push({ type: "accent" });

    const segments = part.text.split("\n");
    segments.forEach((seg, i) => {
      if (i > 0) out.push({ type: "hardBreak" });
      if (seg === "") return;
      out.push({ type: "text", text: seg, ...(marks.length ? { marks } : {}) });
    });
  }
  return out;
}

/** ProseMirror 인라인 내용 → Inline[] (hardBreak 는 \n 으로 되돌린다) */
export function pmToInline(content: PMNode[] | undefined): Inline[] {
  const out: Inline[] = [];
  if (!content) return [{ text: "" }];

  for (const node of content) {
    if (node.type === "hardBreak") {
      const last = out[out.length - 1];
      if (last) last.text += "\n";
      else out.push({ text: "\n" });
      continue;
    }
    if (node.type !== "text" || typeof node.text !== "string") continue;
    const bold = node.marks?.some((m) => m.type === "bold") ?? false;
    const accent = node.marks?.some((m) => m.type === "accent") ?? false;

    // 서식이 같으면 이어 붙인다 — 조각이 잘게 쪼개지면 저장본이 지저분해진다
    const last = out[out.length - 1];
    if (last && Boolean(last.bold) === bold && Boolean(last.accent) === accent) {
      last.text += node.text;
    } else {
      out.push({
        text: node.text,
        ...(bold ? { bold: true } : {}),
        ...(accent ? { accent: true } : {}),
      });
    }
  }
  return out.length > 0 ? out : [{ text: "" }];
}

/* ------------------------------------------------------------
   DetailDoc → TipTap
   ------------------------------------------------------------ */

function listItems(items: Inline[][]): PMNode[] {
  const source = items.length > 0 ? items : [[{ text: "" }]];
  return source.map((item) => ({
    type: "listItem",
    content: [{ type: "paragraph", content: inlineToPM(item) }],
  }));
}

export function docToTiptap(doc: DetailDoc): PMDoc {
  const content: PMNode[] = [];

  for (const node of doc.blocks) {
    switch (node.type) {
      case "heading":
        content.push({
          type: "heading",
          attrs: {
            level: node.level,
            align: node.align,
            lead: node.lead === true,
            blockId: node.id,
          },
          content: inlineToPM(node.text),
        });
        break;
      case "paragraph":
        content.push({
          type: "paragraph",
          attrs: {
            align: node.align,
            size: node.size,
            lead: node.lead === true,
            blockId: node.id,
          },
          content: inlineToPM(node.text),
        });
        break;
      case "list":
        content.push({
          type: node.ordered ? "orderedList" : "bulletList",
          attrs: { lead: node.lead === true, blockId: node.id },
          content: listItems(node.items),
        });
        break;
      case "quote":
        content.push({
          type: "blockquote",
          attrs: { lead: node.lead === true, blockId: node.id },
          content: [{ type: "paragraph", content: inlineToPM(node.text) }],
        });
        break;
      case "divider":
        content.push({ type: "horizontalRule", attrs: { blockId: node.id } });
        break;
      case "spacer":
        content.push({ type: "spacer", attrs: { size: node.size, blockId: node.id } });
        break;
      case "image":
        content.push({
          type: "detailImage",
          attrs: {
            src: node.src,
            alt: node.alt,
            width: node.width,
            height: node.height,
            widthPct: node.widthPct,
            align: node.align,
            sourceUrl: node.sourceUrl ?? null,
            blockId: node.id,
          },
        });
        break;
    }
  }

  // 완전히 빈 문서는 ProseMirror 가 싫어한다 — 빈 문단 하나를 둔다
  if (content.length === 0) content.push({ type: "paragraph", attrs: {} });
  return { type: "doc", content };
}

/* ------------------------------------------------------------
   TipTap → DetailDoc
   ------------------------------------------------------------ */

function attrAlign(attrs: Record<string, unknown> | undefined): Align {
  const v = attrs?.align;
  return v === "center" || v === "right" ? v : "left";
}

function attrSize(attrs: Record<string, unknown> | undefined): TextSize {
  const v = attrs?.size;
  return v === "sm" || v === "lg" ? v : "base";
}

function attrLead(attrs: Record<string, unknown> | undefined): boolean {
  return attrs?.lead === true;
}

function attrId(attrs: Record<string, unknown> | undefined): string {
  const v = attrs?.blockId;
  return typeof v === "string" && v ? v : nextId();
}

/** listItem > paragraph > inline 을 평평하게 편다 */
function itemInline(item: PMNode): Inline[] {
  const para = item.content?.find((c) => c.type === "paragraph");
  return pmToInline(para?.content);
}

export function tiptapToDoc(pm: PMDoc | { content?: PMNode[] }): DetailDoc {
  const blocks: DetailNode[] = [];
  const content = pm.content ?? [];

  for (const node of content) {
    const id = attrId(node.attrs);

    switch (node.type) {
      case "heading": {
        const rawLevel = Number(node.attrs?.level);
        blocks.push({
          id,
          type: "heading",
          level: rawLevel === 3 ? 3 : 2,
          align: attrAlign(node.attrs),
          text: pmToInline(node.content),
          ...(attrLead(node.attrs) ? { lead: true as const } : {}),
        });
        break;
      }
      case "paragraph":
        blocks.push({
          id,
          type: "paragraph",
          align: attrAlign(node.attrs),
          size: attrSize(node.attrs),
          text: pmToInline(node.content),
          ...(attrLead(node.attrs) ? { lead: true as const } : {}),
        });
        break;
      case "bulletList":
      case "orderedList":
        blocks.push({
          id,
          type: "list",
          ordered: node.type === "orderedList",
          items: (node.content ?? []).map(itemInline),
          ...(attrLead(node.attrs) ? { lead: true as const } : {}),
        });
        break;
      case "blockquote": {
        const para = node.content?.find((c) => c.type === "paragraph");
        blocks.push({
          id,
          type: "quote",
          text: pmToInline(para?.content),
          ...(attrLead(node.attrs) ? { lead: true as const } : {}),
        });
        break;
      }
      case "horizontalRule":
        blocks.push({ id, type: "divider" });
        break;
      case "spacer": {
        const s = node.attrs?.size;
        blocks.push({ id, type: "spacer", size: s === "sm" || s === "lg" ? s : "md" });
        break;
      }
      case "detailImage": {
        const src = node.attrs?.src;
        if (typeof src !== "string" || !src) break;
        const pct = Number(node.attrs?.widthPct);
        const sourceUrl = node.attrs?.sourceUrl;
        blocks.push({
          id,
          type: "image",
          src,
          alt: typeof node.attrs?.alt === "string" ? node.attrs.alt : "",
          width: Number(node.attrs?.width) || 1080,
          height: Number(node.attrs?.height) || 4000,
          widthPct: Number.isFinite(pct) ? Math.min(100, Math.max(5, pct)) : 100,
          align: attrAlign(node.attrs),
          ...(typeof sourceUrl === "string" && sourceUrl ? { sourceUrl } : {}),
        });
        break;
      }
      default:
        break;
    }
  }

  return { version: 2, blocks };
}
