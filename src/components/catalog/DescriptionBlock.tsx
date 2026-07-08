import Image from "next/image";
import { parseStory, type StoryBlockNode } from "./StoryBlock";

export interface DescriptionBlockProps {
  text: string;
  className?: string;
}

type DescriptionNode = StoryBlockNode | { type: "image"; alt: string; url: string };

const IMAGE_RE = /^!\[([^\]]*)\]\((https?:\/\/[^)]+)\)$/;

function parseDescription(text: string): DescriptionNode[] {
  const nodes: DescriptionNode[] = [];
  let buffer: string[] = [];

  const flush = () => {
    if (buffer.some((line) => line.trim() !== "")) {
      nodes.push(...parseStory(buffer.join("\n")));
    }
    buffer = [];
  };

  for (const rawLine of text.replace(/\r\n/g, "\n").split("\n")) {
    const image = rawLine.trim().match(IMAGE_RE);
    if (image) {
      flush();
      nodes.push({ type: "image", alt: image[1], url: image[2] });
    } else {
      buffer.push(rawLine);
    }
  }

  flush();
  return nodes;
}

/**
 * 상품 설명(description) 렌더 — 구매 박스용 컴팩트 버전.
 * 하이픈(- ) 나열은 헤어라인 감성의 목록으로, 빈 줄은 문단 구분으로 살린다.
 * (서버 컴포넌트)
 */
export default function DescriptionBlock({
  text,
  className = "",
}: DescriptionBlockProps) {
  const blocks = parseDescription(text);
  if (blocks.length === 0) return null;

  return (
    <div className={`space-y-4 ${className}`}>
      {blocks.map((block, i) => {
        if (block.type === "heading") {
          return (
            <p key={i} className="text-sm font-medium text-ink-800">
              {block.text}
            </p>
          );
        }
        if (block.type === "list") {
          return (
            <ul key={i} className="space-y-1.5">
              {block.items.map((item, j) => (
                <li
                  key={j}
                  className="relative pl-5 text-[13px] leading-[1.8] text-ink-500 before:absolute before:left-0 before:text-ink-300 before:content-['—']"
                >
                  {item}
                </li>
              ))}
            </ul>
          );
        }
        if (block.type === "image") {
          return (
            <div
              key={i}
              className="relative my-6 aspect-[4/5] w-full overflow-hidden border border-ink-100 bg-cream-100"
            >
              <Image
                src={block.url}
                alt={block.alt || "상품 상세 이미지"}
                fill
                sizes="(min-width: 768px) 768px, 100vw"
                className="object-contain"
              />
            </div>
          );
        }
        return (
          <p key={i} className="text-sm leading-[1.85] text-ink-600">
            {block.lines.map((line, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {line}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
