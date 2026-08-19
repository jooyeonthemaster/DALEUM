/* ============================================================
   상세페이지 문서 모델 — 블록 목록 ↔ description 원문 변환

   왜 필요한가:
   고객 화면(components/catalog/DescriptionBlock + StoryBlock)은 상품 description 을
   줄 단위 마크다운으로 읽는다. 지금까지 관리자는 그 원문을 텍스트박스에 직접
   써야 했다 — 상세 이미지를 넣으려면
     ![맛있는 여주발효곤약밥 상세 이미지 1|1080x4000](https://…/1.webp)
   를 손으로 타이핑해야 한다는 뜻이다. 비개발자가 할 수 있는 일이 아니다.

   그래서 관리자 쪽에는 블록 목록(소제목/문단/목록/이미지)만 두고,
   저장할 때 여기서 원문으로 직렬화한다. 저장 형식이 그대로이므로
   고객 화면 렌더 코드는 손대지 않는다.

   ── 렌더러가 실제로 지원하는 것 (그 이상은 넣어도 글자 그대로 나온다) ──
     이미지   ^!\[alt(\|가로x세로)?\]\(url\)$     연속된 이미지는 한 덩어리로 묶인다
     소제목   ^#{1,3}\s+텍스트$
     목록     ^[-•*]\s+텍스트$
     강조     문장 안의 **이렇게** → 굵은 글씨 (StoryBlock.renderInline)
     문단     그 외의 줄. 빈 줄이 문단을 가른다. 문단 안의 줄바꿈은 <br> 로 살아난다
   기울임·표·링크·색·글꼴은 지원하지 않는다 — 넣어도 글자 그대로 나간다.

   강조를 문단 단위로만 여는 이유는 아래 `emphasis` 블록 주석 참고.
   글꼴·크기·색을 관리자가 자유롭게 정하게 하지 않는 것은 의도다 — 상품마다 제각각이 되면
   브랜드 화면이 무너진다. 강조는 디자인이 정한 굵기 하나로만 준다.
   ============================================================ */

export type DetailBlock =
  | { id: string; type: "heading"; text: string }
  | { id: string; type: "paragraph"; text: string }
  /**
   * 문단 하나를 통째로 굵게 — 고객 화면에서 강조되어 보인다.
   *
   * 왜 "선택한 글자만 굵게" 가 아니라 문단 단위인가:
   * 편집 칸이 평범한 글상자라 선택 범위를 굵게 만들려면 원문에 별표를 심어야 하는데,
   * 그러면 관리자 눈에 `**이렇게**` 가 보인다 — 코드를 보이지 않게 하는 것이 이 화면의 전제다.
   * 문단 단위로 두면 화면에는 굵은 글씨만 보이고 별표는 저장할 때만 붙는다.
   * (누군가 문장 중간에 별표를 직접 넣어도 고객 화면은 그대로 굵게 그린다 — StoryBlock.renderInline)
   */
  | { id: string; type: "emphasis"; text: string }
  | { id: string; type: "list"; items: string[] }
  | { id: string; type: "image"; url: string; alt: string; width: number; height: number };

export type DetailBlockType = DetailBlock["type"];

/** DescriptionBlock.tsx 의 IMAGE_RE 와 같아야 한다. */
const IMAGE_RE = /^!\[([^\]]*?)(?:\|(\d+)x(\d+))?\]\((https?:\/\/.+)\)$/;
const HEADING_RE = /^#{1,3}\s+(.+)$/;
/** 줄 전체가 강조인 경우 — 앞뒤 별표 두 개로 감싸고 안쪽에는 별표가 없다 */
const EMPHASIS_RE = /^\*\*([^*]+)\*\*$/;
const LIST_RE = /^[-•*]\s+(.+)$/;

/** 치수 표기가 없는 옛 데이터용 공칭값 — DescriptionBlock 의 NOMINAL_* 과 같다. */
const NOMINAL_WIDTH = 1080;
const NOMINAL_HEIGHT = 4000;

let seq = 0;
function nextId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  seq += 1;
  return `b${seq}-${Math.random().toString(16).slice(2, 8)}`;
}

/** 빈 블록 하나 만들기 — 편집기에서 "추가" 를 눌렀을 때 */
export function emptyBlock(type: DetailBlockType): DetailBlock {
  const id = nextId();
  if (type === "heading") return { id, type, text: "" };
  if (type === "emphasis") return { id, type, text: "" };
  if (type === "list") return { id, type, items: [""] };
  if (type === "image") return { id, type, url: "", alt: "", width: 0, height: 0 };
  return { id, type: "paragraph", text: "" };
}

/**
 * description 원문 → 블록 목록.
 * 고객 화면이 실제로 보는 것과 같은 규칙으로 읽는다.
 */
export function parseDetailDoc(raw: string | null | undefined): DetailBlock[] {
  if (!raw) return [];
  const blocks: DetailBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ id: nextId(), type: "paragraph", text: paragraph.join("\n") });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length > 0) {
      blocks.push({ id: nextId(), type: "list", items: list });
      list = [];
    }
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
        alt: image[1] ?? "",
        url: image[4],
        width: Number(image[2]) || NOMINAL_WIDTH,
        height: Number(image[3]) || NOMINAL_HEIGHT,
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
      blocks.push({ id: nextId(), type: "heading", text: heading[1] });
      continue;
    }

    // 줄 전체가 강조면 강조 칸으로 되살린다 (저장 → 다시 열기 왕복을 위해)
    const emphasis = line.match(EMPHASIS_RE);
    if (emphasis) {
      flushParagraph();
      flushList();
      blocks.push({ id: nextId(), type: "emphasis", text: emphasis[1].trim() });
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
  return blocks;
}

/**
 * 블록 목록 → description 원문.
 *
 * 블록 사이는 빈 줄로 가른다. 이미지 사이에 빈 줄이 들어가도 렌더러는 여전히
 * 한 덩어리로 묶는다 (빈 줄만 든 버퍼는 flush 되지 않기 때문) — 조각 경계에 선이 생기지 않는다.
 */
export function serializeDetailDoc(blocks: DetailBlock[]): string {
  const chunks: string[] = [];

  for (const block of blocks) {
    if (block.type === "heading") {
      const text = block.text.replace(/\s+/g, " ").trim();
      if (text) chunks.push(`## ${text}`);
      continue;
    }
    if (block.type === "emphasis") {
      // 별표는 여기서만 붙는다 — 화면에는 끝까지 보이지 않는다
      const text = block.text.replace(/[*\r\n]/g, " ").replace(/\s+/g, " ").trim();
      if (text) chunks.push(`**${text}**`);
      continue;
    }
    if (block.type === "list") {
      const items = block.items.map((i) => i.replace(/\s+/g, " ").trim()).filter(Boolean);
      if (items.length > 0) chunks.push(items.map((i) => `- ${i}`).join("\n"));
      continue;
    }
    if (block.type === "image") {
      if (!block.url) continue;
      const alt = block.alt.replace(/[[\]|]/g, " ").replace(/\s+/g, " ").trim();
      const dims = block.width > 0 && block.height > 0 ? `|${block.width}x${block.height}` : "";
      chunks.push(`![${alt}${dims}](${block.url})`);
      continue;
    }
    const text = block.text
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((l) => l.trim())
      .filter((l, i, arr) => l !== "" || (i > 0 && i < arr.length - 1))
      .join("\n")
      .trim();
    if (text) chunks.push(text);
  }

  return chunks.join("\n\n");
}

/**
 * 편집 중 블록을 정돈한다 — 저장 직전이 아니라 입력 직후에 부른다.
 *
 * 문단 안에 "- " 로 시작하는 줄이나 "## " 로 시작하는 줄이 섞이면, 저장 후 다시 열었을 때
 * 목록/소제목으로 바뀌어 편집 화면과 결과가 어긋난다. 그 어긋남을 입력 시점에 없앤다
 * (사용자가 하이픈을 찍었다면 목록을 의도한 것이 맞다).
 */
export function normalizeBlocks(blocks: DetailBlock[]): DetailBlock[] {
  const out: DetailBlock[] = [];

  for (const block of blocks) {
    if (block.type !== "paragraph") {
      out.push(block);
      continue;
    }
    const lines = block.text.replace(/\r\n/g, "\n").split("\n");
    let buffer: string[] = [];
    let listBuffer: string[] = [];

    const flushBuffer = () => {
      if (buffer.length > 0) {
        out.push({ id: nextId(), type: "paragraph", text: buffer.join("\n") });
        buffer = [];
      }
    };
    const flushList = () => {
      if (listBuffer.length > 0) {
        out.push({ id: nextId(), type: "list", items: listBuffer });
        listBuffer = [];
      }
    };

    for (const raw of lines) {
      const line = raw.trim();
      const item = line.match(LIST_RE);
      if (item) {
        flushBuffer();
        listBuffer.push(item[1]);
        continue;
      }
      const heading = line.match(HEADING_RE);
      if (heading) {
        flushBuffer();
        flushList();
        out.push({ id: nextId(), type: "heading", text: heading[1] });
        continue;
      }
      flushList();
      buffer.push(raw);
    }
    flushBuffer();
    flushList();

    // 원래 블록이 통째로 비어 있었다면 빈 문단 하나는 남겨 둔다 (편집 중 사라지면 당황스럽다)
    if (block.text.trim() === "") out.push(block);
  }

  return out;
}

/** 상세 이미지 블록만 순서대로 */
export function detailImages(blocks: DetailBlock[]) {
  return blocks.filter((b): b is Extract<DetailBlock, { type: "image" }> => b.type === "image");
}

/**
 * 이미지 alt 를 "{상품명} 상세 이미지 {n}" 으로 다시 매긴다.
 * 순서를 바꾸거나 중간에 끼워 넣은 뒤 부른다 — 번호가 1..N 로 연속돼야
 * scripts/verify_catalog.mjs 의 연속성 검사를 통과한다.
 */
export function renumberDetailImages(blocks: DetailBlock[], productName: string): DetailBlock[] {
  let n = 0;
  return blocks.map((block) => {
    if (block.type !== "image") return block;
    n += 1;
    return { ...block, alt: `${productName || "상품"} 상세 이미지 ${n}` };
  });
}

/** 블록 목록이 실질적으로 비어 있는가 (저장 시 null 로 보낼지 판단) */
export function isEmptyDoc(blocks: DetailBlock[]): boolean {
  return serializeDetailDoc(blocks).trim() === "";
}

/** 사람이 읽는 블록 이름 — 화면 라벨에 쓴다 */
export const BLOCK_LABELS: Record<DetailBlockType, string> = {
  heading: "소제목",
  paragraph: "문단",
  emphasis: "강조 문단",
  list: "항목 나열",
  image: "이미지",
};
