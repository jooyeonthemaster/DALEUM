import type { ReactNode } from "react";

export interface StoryBlockProps {
  story: string;
  className?: string;
}

/**
 * 문장 안의 강조 표시(`**이렇게**`)를 굵은 글씨로 바꾼다.
 *
 * 왜 이것만 지원하는가:
 * 관리자 화면은 오래 전부터 "마크다운을 지원합니다 — 예: **굵게**" 라고 안내해 왔는데
 * 정작 파서에는 그 규칙이 없어서, 안내를 그대로 따른 사람의 화면에는 별표가 날것으로 보였다.
 * 약속을 지키는 쪽으로 맞춘다.
 *
 * 굵게 하나만 두는 것은 의도적이다. 글꼴·크기·색을 관리자가 자유롭게 정하게 하면
 * 상품마다 제각각이 되어 브랜드 화면이 무너진다. 강조는 디자인이 정한 굵기 하나로만 준다.
 * 별표가 짝을 이루지 않으면 규칙에 걸리지 않고 원문 그대로 남는다.
 */
export function renderInline(text: string): ReactNode {
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    // split 의 홀수 자리가 캡처 그룹(별표 안쪽)이다
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-ink-900">
        {part}
      </strong>
    ) : (
      part
    )
  );
}

export type StoryBlockNode =
  | { type: "heading"; text: string }
  | { type: "list"; items: string[] }
  | { type: "paragraph"; lines: string[] };

/** 아주 단순한 마크다운 파서 — 제목(#/##/###)·목록(-)·문단/줄바꿈만 처리 */
export function parseStory(story: string): StoryBlockNode[] {
  const blocks: StoryBlockNode[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: "paragraph", lines: paragraph });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length > 0) {
      blocks.push({ type: "list", items: list });
      list = [];
    }
  };

  for (const raw of story.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", text: heading[1] });
      continue;
    }

    const item = line.match(/^[-•*]\s+(.+)$/);
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
  return blocks;
}

/** 에디토리얼 스토리 렌더 — 서버 컴포넌트 */
export default function StoryBlock({ story, className = "" }: StoryBlockProps) {
  const blocks = parseStory(story);
  if (blocks.length === 0) return null;

  return (
    <div className={`space-y-6 ${className}`}>
      {blocks.map((block, i) => {
        if (block.type === "heading") {
          return (
            <h3
              key={i}
              className="headline-serif pt-4 text-xl text-ink-900 first:pt-0"
            >
              {renderInline(block.text)}
            </h3>
          );
        }
        if (block.type === "list") {
          return (
            <ul key={i} className="space-y-2.5">
              {block.items.map((item, j) => (
                <li
                  key={j}
                  className="relative pl-6 text-[15px] leading-[1.85] text-ink-700 before:absolute before:left-0 before:text-ink-300 before:content-['—']"
                >
                  {renderInline(item)}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="text-[15px] leading-[1.95] text-ink-700">
            {block.lines.map((line, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {renderInline(line)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
