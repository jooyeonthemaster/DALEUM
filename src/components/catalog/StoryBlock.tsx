export interface StoryBlockProps {
  story: string;
  className?: string;
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
              {block.text}
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
                  {item}
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
                {line}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
