import Image from "next/image";
import { parseStory, renderInline, type StoryBlockNode } from "./StoryBlock";

export interface DescriptionBlockProps {
  text: string;
  className?: string;
  /**
   * 렌더할 부분 — 기본은 전부.
   * 상세 이미지는 세로 수천 px 이라 구매 박스 칼럼 안에서 렌더하면 장바구니 버튼이
   * 그만큼 아래로 밀린다. 그래서 텍스트는 구매 박스에("text"),
   * 이미지는 하단 전체폭 상세 섹션에("images") 나눠 렌더한다.
   */
  only?: "text" | "images";
}

/** description 안에 상세 이미지가 하나라도 있는지 — 상세 섹션 노출 판단용 */
export function hasDescriptionImages(text: string): boolean {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .some((line) => IMAGE_RE.test(line.trim()));
}

interface DescriptionImage {
  alt: string;
  url: string;
  width: number;
  height: number;
}

/**
 * 연속된 이미지는 한 덩어리(images)로 묶는다 —
 * 상세 이미지는 세로로 긴 통이미지를 여러 장으로 잘라 둔 슬라이스라 사이가 벌어지면 그림이 끊겨 보인다.
 */
type DescriptionNode = StoryBlockNode | { type: "images"; images: DescriptionImage[] };

/**
 * 마크다운 이미지 한 줄. alt 뒤에 `|가로x세로` 로 원본 픽셀 치수를 실을 수 있다.
 *   ![상세 이미지 1|1080x4000](https://…/1.webp)
 * 치수를 실어 보내는 이유: next/image 는 width·height 를 요구하는데 DB에는 치수가 없어
 * 공칭값을 쓰면 로드 후 실제 비율로 다시 잡히면서 이미지가 튄다(레이아웃 시프트).
 * 상세 조각은 폭이 780~1,080, 마지막 조각 높이가 제각각이라 공칭값으로는 맞출 수 없다.
 *
 * URL 그룹은 탐욕적으로 잡아 줄 끝의 마지막 ')' 만 닫는 괄호로 본다 —
 * 파일명에 괄호가 든 URL(예: …/메인_260323(1000).png)이 와도 매칭이 깨지지 않는다.
 * 깨지면 마크다운 원문이 고객 화면에 그대로 노출된다.
 */
const IMAGE_RE = /^!\[([^\]]*?)(?:\|(\d+)x(\d+))?\]\((https?:\/\/.+)\)$/;

/**
 * 치수 표기가 없는 옛 데이터용 공칭값 — 소재 전처리 규격(폭 1,080 · 조각 높이 4,000)을 따른다.
 * 이 값은 렌더 크기가 아니라 자리표시 비율과 srcset 후보 폭의 기준일 뿐이고,
 * 실제 크기는 CSS(h-auto w-full)가 정한다.
 * sizes 는 일부러 주지 않는다 — srcset 을 1x/2x 두 후보로 묶어 변형 캐시를 줄이고,
 * 원본 폭을 넘는 요청은 next/image 가 확대 없이 원본 폭으로 되돌린다.
 */
const NOMINAL_WIDTH = 1080;
const NOMINAL_HEIGHT = 4000;

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
      const picture: DescriptionImage = {
        alt: image[1],
        url: image[4],
        width: Number(image[2]) || NOMINAL_WIDTH,
        height: Number(image[3]) || NOMINAL_HEIGHT,
      };
      const last = nodes[nodes.length - 1];
      // 직전 블록도 이미지면 같은 덩어리에 이어 붙인다
      if (last && last.type === "images") last.images.push(picture);
      else nodes.push({ type: "images", images: [picture] });
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
 * 마크다운 이미지(![alt](url))는 잘라 내거나 줄이지 않고 원본 종횡비 그대로 풀폭으로 흘린다.
 * (서버 컴포넌트)
 */
export default function DescriptionBlock({
  text,
  className = "",
  only,
}: DescriptionBlockProps) {
  const parsed = parseDescription(text);
  const blocks =
    only === "images"
      ? parsed.filter((block) => block.type === "images")
      : only === "text"
        ? parsed.filter((block) => block.type !== "images")
        : parsed;
  if (blocks.length === 0) return null;

  return (
    <div className={`space-y-4 ${className}`}>
      {blocks.map((block, i) => {
        if (block.type === "heading") {
          return (
            <p key={i} className="text-sm font-medium text-ink-800">
              {renderInline(block.text)}
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
                  {renderInline(item)}
                </li>
              ))}
            </ul>
          );
        }
        if (block.type === "images") {
          // 고정 aspect 박스 없이 원본 비율대로 흐른다 — 세로 18,000px 짜리 상세 이미지도 그대로 판독된다.
          // 헤어라인 테두리는 덩어리 전체에 한 번만 둘러 슬라이스 경계에 선이 생기지 않게 한다.
          return (
            <div key={i} className="my-6 border border-ink-100 bg-cream-100">
              {block.images.map((image, j) => (
                <Image
                  key={`${image.url}-${j}`}
                  src={image.url}
                  alt={image.alt || "상품 상세 이미지"}
                  width={image.width}
                  height={image.height}
                  className="block h-auto w-full"
                />
              ))}
            </div>
          );
        }
        return (
          <p key={i} className="text-sm leading-[1.85] text-ink-600">
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
