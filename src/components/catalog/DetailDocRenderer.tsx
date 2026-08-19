import Image from "next/image";
import type { ReactNode } from "react";
import {
  ACCENT_CLASS,
  ALIGN_CLASS,
  BOLD_CLASS,
  FLOW,
  IMAGE_ALIGN_CLASS,
  LEAD,
  SPACER_HEIGHT,
  flowSizeClass,
} from "./detail-prose";
import {
  flowNodes,
  isTextNode,
  leadNodes,
  type DetailDoc,
  type DetailNode,
  type ImageNode,
  type Inline,
} from "@/lib/detail-doc-v2";

/* ============================================================
   상세페이지 v2 렌더 — 고객 화면 (서버 컴포넌트)

   두 자리에 나눠 실린다:
     place="lead"  가격 옆 구매 박스 — lead 로 표시된 글만
     place="flow"  페이지 아래 「상품 상세」 — 나머지 전부(사진 포함)가 순서대로

   스타일은 detail-prose.ts 한 곳에서 가져온다. 편집 캔버스도 같은 상수를 쓰므로
   두 화면이 갈라질 수 없다 — 이것이 "고객 화면 그대로 편집" 의 구조적 보장이다.
   ============================================================ */

export interface DetailDocRendererProps {
  doc: DetailDoc;
  place: "lead" | "flow";
  className?: string;
}

/** 인라인 조각 렌더 — 굵게/강조색 두 가지만 */
function renderInline(parts: Inline[]): ReactNode {
  return parts.map((part, i) => {
    if (!part.text) return null;
    const cls = [part.bold ? BOLD_CLASS : "", part.accent ? ACCENT_CLASS : ""]
      .filter(Boolean)
      .join(" ");
    // 문단 안의 줄바꿈은 <br> 로 살린다 (관리자가 Enter 로 나눈 줄)
    const lines = part.text.split("\n");
    const body = lines.map((line, j) => (
      <span key={j}>
        {j > 0 && <br />}
        {line}
      </span>
    ));
    return cls ? (
      <span key={i} className={cls}>
        {body}
      </span>
    ) : (
      <span key={i}>{body}</span>
    );
  });
}

/**
 * 폭 100%·가운데 정렬인 이미지가 연달아 오면 한 덩어리로 묶는다.
 * 상세 통이미지를 잘라 둔 슬라이스가 대부분이라, 사이가 벌어지면 그림이 끊겨 보인다.
 * 폭이나 정렬이 다르면 관리자가 의도적으로 따로 배치한 것이므로 묶지 않는다.
 */
function isSeamless(node: DetailNode): node is ImageNode {
  return node.type === "image" && node.widthPct === 100 && node.align === "center";
}

type FlowChunk =
  | { kind: "images"; images: ImageNode[] }
  | { kind: "node"; node: DetailNode };

function chunkFlow(nodes: DetailNode[]): FlowChunk[] {
  const out: FlowChunk[] = [];
  for (const node of nodes) {
    if (isSeamless(node)) {
      const last = out[out.length - 1];
      if (last && last.kind === "images") last.images.push(node);
      else out.push({ kind: "images", images: [node] });
      continue;
    }
    out.push({ kind: "node", node });
  }
  return out;
}

function LeadBody({ nodes }: { nodes: DetailNode[] }) {
  return (
    <>
      {nodes.map((node) => {
        if (node.type === "heading") {
          return (
            <p key={node.id} className={LEAD.heading}>
              {renderInline(node.text)}
            </p>
          );
        }
        if (node.type === "list") {
          return (
            <ul key={node.id} className={LEAD.list}>
              {node.items.map((item, j) => (
                <li key={j} className={LEAD.listItem}>
                  {renderInline(item)}
                </li>
              ))}
            </ul>
          );
        }
        if (node.type === "paragraph" || node.type === "quote") {
          return (
            <p key={node.id} className={LEAD.paragraph}>
              {renderInline(node.text)}
            </p>
          );
        }
        return null;
      })}
    </>
  );
}

function FlowImage({ image }: { image: ImageNode }) {
  return (
    <Image
      src={image.src}
      alt={image.alt || "상품 상세 이미지"}
      width={image.width}
      height={image.height}
      className={FLOW.image}
    />
  );
}

function FlowBody({ chunks }: { chunks: FlowChunk[] }) {
  return (
    <>
      {chunks.map((chunk, i) => {
        if (chunk.kind === "images") {
          // 테두리는 덩어리 전체에 한 번만 — 슬라이스 경계에 선이 생기지 않게 한다
          return (
            <div key={i} className={FLOW.imageFrame}>
              {chunk.images.map((image) => (
                <FlowImage key={image.id} image={image} />
              ))}
            </div>
          );
        }

        const node = chunk.node;

        if (node.type === "image") {
          return (
            <div
              key={node.id}
              className={`${FLOW.imageFrame} ${IMAGE_ALIGN_CLASS[node.align]}`}
              style={{ width: `${node.widthPct}%` }}
            >
              <FlowImage image={node} />
            </div>
          );
        }
        if (node.type === "divider") {
          return <div key={node.id} className={FLOW.divider} />;
        }
        if (node.type === "spacer") {
          // 높이는 detail-prose 한 곳에서만 정한다 — 편집 캔버스가 같은 상수를 쓴다
          return <div key={node.id} style={{ height: SPACER_HEIGHT[node.size] }} aria-hidden />;
        }
        if (node.type === "heading") {
          const Tag = node.level === 3 ? "h4" : "h3";
          return (
            <Tag
              key={node.id}
              className={`${node.level === 3 ? FLOW.heading3 : FLOW.heading2} ${
                ALIGN_CLASS[node.align]
              }`}
            >
              {renderInline(node.text)}
            </Tag>
          );
        }
        if (node.type === "quote") {
          return (
            <blockquote key={node.id} className={FLOW.quote}>
              {renderInline(node.text)}
            </blockquote>
          );
        }
        if (node.type === "list") {
          const Tag = node.ordered ? "ol" : "ul";
          return (
            <Tag
              key={node.id}
              // 마커는 목록에 붙는다 — 편집 캔버스가 같은 상수를 쓰므로 어긋날 수 없다
              className={`${FLOW.list} ${node.ordered ? FLOW.orderedList : FLOW.bulletList}`}
            >
              {node.items.map((item, j) => (
                <li key={j} className={FLOW.listItem}>
                  {renderInline(item)}
                </li>
              ))}
            </Tag>
          );
        }
        return (
          <p
            key={node.id}
            className={`${FLOW.paragraph} ${flowSizeClass(node.size)} ${
              ALIGN_CLASS[node.align]
            }`}
          >
            {renderInline(node.text)}
          </p>
        );
      })}
    </>
  );
}

export default function DetailDocRenderer({
  doc,
  place,
  className = "",
}: DetailDocRendererProps) {
  if (place === "lead") {
    const nodes = leadNodes(doc);
    if (nodes.length === 0) return null;
    return (
      <div className={`${LEAD.root} ${className}`}>
        <LeadBody nodes={nodes} />
      </div>
    );
  }

  const nodes = flowNodes(doc);
  if (nodes.length === 0) return null;
  return (
    <div className={`${FLOW.root} ${className}`}>
      <FlowBody chunks={chunkFlow(nodes)} />
    </div>
  );
}

/** 하단 「상품 상세」 섹션을 띄울지 판단 — 페이지가 섹션 자체를 감쌀지 정할 때 쓴다 */
export function docHasFlow(doc: DetailDoc): boolean {
  return flowNodes(doc).some((n) => {
    if (n.type === "image") return Boolean(n.src);
    if (n.type === "divider" || n.type === "spacer") return true;
    if (n.type === "list") return n.items.length > 0;
    if (isTextNode(n)) return n.text.some((p) => p.text.trim() !== "");
    return false;
  });
}
