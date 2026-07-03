import { parseStory } from "./StoryBlock";

export interface DescriptionBlockProps {
  text: string;
  className?: string;
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
  const blocks = parseStory(text);
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
