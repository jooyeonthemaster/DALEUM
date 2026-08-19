/* ============================================================
   서식 툴바 — 버튼 정의표와 "지금 커서 자리" 읽기

   왜 툴바(EditorToolbar.tsx)에서 떼어 냈는가:
   한 파일에 두 가지가 있었다. **무엇을 누를 수 있는가**(이 파일)와
   **어떻게 생겼는가**(툴바)다. 둘은 바뀌는 이유가 서로 다르다 —
   버튼이 하나 늘 때 고치는 곳과 여백·색을 손볼 때 고치는 곳이 같으면
   매번 상관없는 코드까지 함께 읽어야 한다. 규약(400줄)을 지키려고 자른 김에
   그 선을 따라 갈랐다.

   왜 표인가:
   같은 모양 버튼을 손으로 여섯 벌 적으면 반드시 하나만 어긋난다.
   ============================================================ */

import type { ChainedCommands } from "@tiptap/core";
import type { Editor } from "@tiptap/react";
import type { LucideIcon } from "lucide-react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Pilcrow,
  Quote,
} from "lucide-react";
import type { Align, TextSize } from "@/lib/detail-doc-v2";

/* 마크 이름은 tiptap-bridge.ts 가 이미 못 박아 둔 계약이다(marks: [{ type: "accent" }]).
   여기서 다른 이름을 쓰면 저장은 되는데 다시 열었을 때 강조가 조용히 사라진다. */
export const ACCENT_MARK = "accent";

/* lead 를 실제로 품는 노드. 목록·인용은 안쪽 문단이 아니라 바깥 노드가 주인이다 —
   bridge 가 bulletList/orderedList/blockquote 의 attrs 에서 lead 를 읽기 때문이다.
   배열 순서가 곧 우선순위다: 안쪽 문단보다 바깥 그릇을 먼저 잡는다. */
export const LEAD_OWNERS = [
  "bulletList",
  "orderedList",
  "blockquote",
  "heading",
  "paragraph",
] as const;

/* ------------------------------------------------------------
   지금 커서가 놓인 자리의 서식 상태
   ------------------------------------------------------------ */

export interface ToolbarState {
  isParagraph: boolean;
  isH2: boolean;
  isH3: boolean;
  isQuote: boolean;
  isBullet: boolean;
  isOrdered: boolean;
  isBold: boolean;
  isAccent: boolean;
  /** 정렬을 적어 둘 노드 이름. null 이면 지금 자리엔 정렬을 담을 칸이 없다 */
  alignTarget: "heading" | "paragraph" | null;
  align: Align;
  /** 본문 크기는 문단에만 담을 칸이 있다 — isParagraph 가 false 면 읽을 값이 아니다 */
  size: TextSize;
  /** lead 를 적어 둘 노드 이름 */
  leadTarget: string | null;
  leadOn: boolean;
  /** 칸 종류 버튼(BLOCK_PRESETS)이 지금 자리에서 실제로 먹히는가 — 키는 preset.key */
  canBlock: Record<string, boolean>;
}

export const IDLE: ToolbarState = {
  isParagraph: false,
  isH2: false,
  isH3: false,
  isQuote: false,
  isBullet: false,
  isOrdered: false,
  isBold: false,
  isAccent: false,
  alignTarget: null,
  align: "left",
  size: "base",
  leadTarget: null,
  leadOn: false,
  canBlock: {},
};

/* ------------------------------------------------------------
   프리셋 표
   ------------------------------------------------------------ */

/**
 * 인용 안에서는 **문단 말고 아무것도** 담기지 않는다.
 * 스키마가 아니라 저장 계약이 그렇다: tiptap-bridge.ts:248 의 blockquote 분기는
 * 인용에서 첫 문단 하나만 찾아 읽는다. 인용 안에 제목이나 목록을 만들면 화면은 바뀌는데
 * 저장본에는 text 가 빈 인용만 남는다 — 오류도 경고도 없이 관리자가 쓴 글이 통째로 사라진다.
 * can() 은 스키마만 볼 줄 알아서 이 손실을 막지 못한다(스키마가 허용하면 true 를 준다).
 * 그래서 계약 쪽 제약은 여기서 따로 잠근다. 빠져나가는 길은 「본문」 버튼이다.
 */
const inQuote = (s: ToolbarState) => s.isQuote;

/**
 * 거꾸로, **인용으로 감쌀 수 있는 것**도 보통 문단 하나뿐이다.
 * 지금 스키마(blockquote content: "block+")에서는 제목에 커서를 두고 인용을 눌러도 명령이
 * 성사되어 blockquote > heading 이 만들어지는데(실측: wrapIn(blockquote) → true),
 * 그러면 위와 같은 이유로 저장본에서 제목 글자가 통째로 빠진다.
 * 그래서 켜는 건 보통 문단에서만, 끄는 건 인용 안에서만 허용한다.
 */
const notQuotable = (s: ToolbarState) => !s.isQuote && !s.isParagraph;

export interface BlockPreset {
  key: string;
  icon: LucideIcon;
  label: string;
  title?: string;
  isOn: (s: ToolbarState) => boolean;
  apply: (c: ChainedCommands) => ChainedCommands;
  /**
   * can() 판정을 건너뛴다. 「본문」 하나뿐이다 —
   * clearNodes 는 dispatch 가 없으면 아무 일도 하지 않고 true 만 돌려주므로
   * (node_modules/@tiptap/core/dist/index.js:286-288) 예행연습에서는 인용·목록 껍질이 벗겨지지 않고,
   * 뒤따르는 setParagraph 이 "이미 문단" 을 만나 false 를 준다.
   * 그 값을 믿으면 **언제나 열려 있어야 할 탈출구**가 잠긴다.
   */
  skipCanCheck?: boolean;
  /** 스키마는 허용해도 저장 계약이 담아 주지 못하는 자리 (위 inQuote 주석 참고) */
  losesContentIn?: (s: ToolbarState) => boolean;
}

/** 이 칸을 무엇으로 볼 것인가 — 여섯 개가 한 표 안에 있어야 서로 어긋나지 않는다 */
export const BLOCK_PRESETS: BlockPreset[] = [
  {
    key: "paragraph",
    icon: Pilcrow,
    label: "본문",
    title: "보통 글로 되돌립니다 — 인용·목록에서도 빠져나옵니다",
    isOn: (s) => s.isParagraph,
    // clearNodes 를 앞에 태우는 이유: setParagraph 만으로는 인용·목록 껍질을 벗지 못한다.
    // 벗기지 않으면 title 이 약속한 "되돌립니다" 가 거짓이 되고, 인용에 갇힌 글은
    // 나갈 길이 없어진다 — 인용 안에서 잠기는 버튼들의 유일한 출구가 이 버튼이다.
    apply: (c) => c.clearNodes().setParagraph(),
    skipCanCheck: true,
  },
  {
    key: "h2",
    icon: Heading2,
    label: "큰제목",
    isOn: (s) => s.isH2,
    apply: (c) => c.toggleHeading({ level: 2 }),
    losesContentIn: inQuote,
  },
  {
    key: "h3",
    icon: Heading3,
    label: "작은제목",
    isOn: (s) => s.isH3,
    apply: (c) => c.toggleHeading({ level: 3 }),
    losesContentIn: inQuote,
  },
  {
    key: "quote",
    icon: Quote,
    label: "인용",
    title: "한 발 물러선 말투로 보이게 합니다",
    isOn: (s) => s.isQuote,
    apply: (c) => c.toggleBlockquote(),
    losesContentIn: notQuotable,
  },
  {
    key: "bullet",
    icon: List,
    label: "목록",
    isOn: (s) => s.isBullet,
    apply: (c) => c.toggleBulletList(),
    losesContentIn: inQuote,
  },
  {
    key: "ordered",
    icon: ListOrdered,
    label: "번호 목록",
    isOn: (s) => s.isOrdered,
    apply: (c) => c.toggleOrderedList(),
    losesContentIn: inQuote,
  },
];

export const SIZE_PRESETS: { key: TextSize; label: string }[] = [
  { key: "sm", label: "작게" },
  { key: "base", label: "기본" },
  { key: "lg", label: "크게" },
];

export const ALIGN_PRESETS: { key: Align; label: string; icon: LucideIcon }[] = [
  { key: "left", label: "왼쪽 맞춤", icon: AlignLeft },
  { key: "center", label: "가운데 맞춤", icon: AlignCenter },
  { key: "right", label: "오른쪽 맞춤", icon: AlignRight },
];

/* ------------------------------------------------------------
   상태 읽기
   ------------------------------------------------------------ */

/** TipTap 이 돌려주는 attrs 는 느슨하다 — any 로 새지 않게 unknown 으로 받아 좁힌다 */
function attrOf(editor: Editor, name: string, key: string): unknown {
  return (editor.getAttributes(name) as Record<string, unknown>)[key];
}

/**
 * 이 버튼이 지금 자리에서 **실제로 먹히는가**를 TipTap 에게 직접 물어본다.
 * 눈대중(isActive 조합)으로 규칙을 적어 두면 스키마가 바뀌는 날 툴바만 옛 규칙을 기억한다.
 * can() 은 누를 때와 똑같은 명령을 dispatch 없이 그대로 굴려 보고 성패만 돌려주므로
 * 판정이 실제와 어긋날 수 없다 — focus() 까지 같이 태우는 것도 실제 체인과 한 글자라도
 * 달라지지 않게 하려는 것이다.
 */
function canRunBlock(editor: Editor, preset: BlockPreset): boolean {
  if (preset.skipCanCheck) return true;
  return preset.apply(editor.can().chain().focus()).run();
}

export function readState(editor: Editor): ToolbarState {
  const isBullet = editor.isActive("bulletList");
  const isOrdered = editor.isActive("orderedList");
  const isQuote = editor.isActive("blockquote");
  const isH2 = editor.isActive("heading", { level: 2 });
  const isH3 = editor.isActive("heading", { level: 3 });
  const heading = isH2 || isH3;

  // 목록·인용 **안쪽** 문단의 정렬과 크기는 저장될 자리가 없다 —
  // bridge 는 목록에서 글자만, 인용에서 문장만 읽어 간다. 눌러도 사라질 버튼을
  // 켜 두면 관리자는 "왜 안 먹히지" 를 반복하게 되므로 아예 잠근다.
  const nested = isBullet || isOrdered || isQuote;
  const isParagraph = editor.isActive("paragraph") && !nested && !heading;

  const alignTarget: "heading" | "paragraph" | null = nested
    ? null
    : heading
      ? "heading"
      : isParagraph
        ? "paragraph"
        : null;
  const rawAlign = alignTarget ? attrOf(editor, alignTarget, "align") : undefined;
  const rawSize = isParagraph ? attrOf(editor, "paragraph", "size") : undefined;

  let leadTarget: string | null = null;
  for (const name of LEAD_OWNERS) {
    if (editor.isActive(name)) {
      leadTarget = name;
      break;
    }
  }

  const state: ToolbarState = {
    isParagraph,
    isH2,
    isH3,
    isQuote,
    isBullet,
    isOrdered,
    isBold: editor.isActive("bold"),
    isAccent: editor.isActive(ACCENT_MARK),
    alignTarget,
    align: rawAlign === "center" || rawAlign === "right" ? rawAlign : "left",
    size: rawSize === "sm" || rawSize === "lg" ? rawSize : "base",
    leadTarget,
    leadOn: leadTarget ? attrOf(editor, leadTarget, "lead") === true : false,
    canBlock: {},
  };

  // 계약(losesContentIn)이 먼저다 — 스키마가 허락해도 저장이 못 담으면 잠근다.
  for (const preset of BLOCK_PRESETS) {
    const lossy = preset.losesContentIn?.(state) ?? false;
    state.canBlock[preset.key] = !lossy && canRunBlock(editor, preset);
  }

  return state;
}
