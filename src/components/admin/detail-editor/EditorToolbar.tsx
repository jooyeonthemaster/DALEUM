"use client";

/* ============================================================
   상세페이지 편집기 — 서식 툴바

   왜 캔버스에서 떼어 놓았는가:
   편집 캔버스가 하는 일은 "고객 화면과 1px 도 다르지 않게 그리는 것" 하나뿐이어야 한다.
   조작 버튼을 그 안에 섞으면 툴바의 여백·글자 크기가 본문 스타일에 새어 들어가고,
   그 순간부터 미리보기는 고객이 볼 화면이 아니라 '편집기에서만 그런 화면' 이 된다.

   왜 프리셋 버튼뿐인가:
   글꼴 목록·색상 피커·임의 크기를 주지 않은 것은 덜 만든 게 아니라 결정이다(SPEC §2.2).
   고를 수 있는 것을 브랜드가 허락한 몇 가지로 묶어 두면 누가 편집하든 상세페이지가
   같은 얼굴을 유지한다.

   왜 툴바가 에디터를 직접 구독하는가:
   부모가 다시 그려 주기를 기다리면, 부모가 성능을 위해 리렌더를 줄이는 날
   커서는 제목에 있는데 툴바에는 '본문' 이 켜져 있는 상태가 된다. 그러면 관리자는
   자기가 지금 무엇을 고치는지 알 수 없다. 그래서 필요한 값만 스스로 구독한다.

   왜 눌리는 버튼을 can() 으로 고르는가:
   "인용 안에서는 제목이 안 된다" 같은 규칙을 눈대중으로 적어 두면 스키마가 바뀌는 날
   툴바만 옛 규칙을 기억한다. can() 은 누를 때와 똑같은 명령을 dispatch 없이 굴려 보고
   성패만 돌려주므로 판정이 실제와 어긋날 수 없다. 판정은 상태와 함께 읽어 둔다
   (toolbar-presets.readState) — 그래야 '먹히는지' 가 바뀔 때 툴바가 다시 그려진다.

   버튼 정의표는 toolbar-presets.ts 에 있다. 이 파일은 그것을 어떻게 그리는지만 안다.
   ============================================================ */

import type { ChainedCommands } from "@tiptap/core";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import type { LucideIcon } from "lucide-react";
import {
  Baseline,
  Bold,
  ImagePlus,
  Minus,
  Monitor,
  MoveVertical,
  PanelRight,
  Smartphone,
} from "lucide-react";
// 강조색은 고객 화면이 실제로 칠하는 그 클래스여야 한다 — 같은 값을 손으로 적어 두면
// 브랜드 색을 바꾸는 날 버튼이 보여 주는 색과 칠해지는 색이 갈라진다(SPEC §8).
import { ACCENT_CLASS } from "@/components/catalog/detail-prose";
// 뷰포트 이름은 스테이지가 이미 정해 두었다 — 여기서 같은 뜻의 타입을 또 만들면
// 언젠가 한쪽에만 값이 늘어나 툴바와 캔버스가 다른 화면을 가리키게 된다.
import type { StageViewport } from "./stage-context";
import {
  ACCENT_MARK,
  ALIGN_PRESETS,
  BLOCK_PRESETS,
  IDLE,
  SIZE_PRESETS,
  readState,
} from "./toolbar-presets";

export interface EditorToolbarProps {
  editor: Editor | null;
  viewport: StageViewport;
  onViewportChange: (v: StageViewport) => void;
  /** 사진 고르기·올리기는 툴바의 일이 아니다 — 부모가 맡고 툴바는 신호만 보낸다 */
  onInsertImage: () => void;
}

const ICON = { size: 15, strokeWidth: 1.6 } as const;

/* 관리자 헤더(AdminHeader.tsx:38)는 `sticky top-0 z-30` 이고 높이가 h-14(56px)다.
   스크롤 컨테이너가 문서 본문이라(AdminShell 의 main 에 overflow 가 없다) top-0 으로 두면
   툴바가 화면 맨 위에 붙는 순간 헤더 뒤로 통째로 들어가 보이지 않는다 —
   긴 상세페이지를 스크롤하며 편집할 때 sticky 를 건 이유 자체가 무산된다.
   같은 함정을 겪고 기록해 둔 자리가 이미 있다: _list/BulkActionBar.tsx:21-29 (top-14 z-20). */
const TOOLBAR_STICKY = "sticky top-14 z-20";

/* ------------------------------------------------------------
   버튼 한 개
   ------------------------------------------------------------ */

interface ToolButtonProps {
  icon?: LucideIcon;
  label?: string;
  /** 아이콘만 있는 버튼은 이 이름으로만 읽힌다 — 비워 둘 수 없다 */
  ariaLabel: string;
  /** 관리자가 이름만 보고는 뜻을 짐작할 수 없는 버튼에 붙이는 설명 */
  title?: string;
  /** 켬/끔이 있는 버튼만 넘긴다. 넘기지 않으면 aria-pressed 를 붙이지 않는다 —
      사진 넣기처럼 한 번 실행되고 마는 버튼에는 '눌린 상태' 라는 게 없다. */
  active?: boolean;
  disabled?: boolean;
  iconClassName?: string;
  onClick: () => void;
}

function ToolButton({
  icon: Icon,
  label,
  ariaLabel,
  title,
  active,
  disabled = false,
  iconClassName = "",
  onClick,
}: ToolButtonProps) {
  const tone = disabled
    ? "cursor-not-allowed text-ink-300"
    : active
      ? "bg-forest-700 text-cream-50"
      : "text-ink-500 hover:bg-cream-200 hover:text-ink-900";

  return (
    <button
      // 이 툴바는 상품 등록 폼 안에서 산다. type 을 빠뜨리면 굵게 버튼이 상품을 저장한다.
      type="button"
      // 버튼을 누르는 순간 브라우저가 본문 선택을 풀어 버린다. 그러면 방금 긁어 둔
      // 문장이 아니라 커서 한 점에만 서식이 걸린다 — 기본 동작을 막아 선택을 지킨다.
      // (키보드로 오는 Enter 는 mousedown 을 거치지 않으므로 손해가 없다.)
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={active}
      title={title ?? ariaLabel}
      className={`inline-flex h-8 shrink-0 select-none items-center gap-1.5 px-2 text-[13px] leading-none transition-colors ${tone}`}
    >
      {Icon ? <Icon {...ICON} className={iconClassName} aria-hidden /> : null}
      {label ? <span>{label}</span> : null}
    </button>
  );
}

/** 묶음 사이 구분선 — 버튼이 스무 개 넘게 늘어서면 눈이 길을 잃는다 */
function Sep() {
  return <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-ink-200" />;
}

/* ------------------------------------------------------------
   툴바
   ------------------------------------------------------------ */

export default function EditorToolbar({
  editor,
  viewport,
  onViewportChange,
  onInsertImage,
}: EditorToolbarProps) {
  // 고른 값이 실제로 바뀔 때만 다시 그린다. 매 타자마다 툴바 전체를 다시 그리면
  // 긴 상세페이지에서 입력이 눈에 띄게 무거워진다.
  const picked = useEditorState({
    editor,
    selector: ({ editor: e }) => (e ? readState(e) : null),
  });

  /* 폴백이 IDLE 이 아닌 이유:
     @tiptap/react 3.30.2 의 EditorStateManager.watch 는 editor 를 null→인스턴스로 갈아끼울 때
     transactionNumber 를 올리지도 구독자에게 알리지도 않고, getSnapshot 은
     `transactionNumber === lastTransactionNumber` 면 옛 스냅샷을 그대로 돌려준다
     (node_modules/@tiptap/react/dist/index.js:183-189, 206-213).
     DetailEditor 는 immediatelyRender:false 라 첫 렌더에서 editor 가 null 이므로
     이 경로에 정확히 걸린다 — IDLE 로 두면 편집기를 처음 열었을 때 정렬·크기·lead 가
     전부 회색으로 잠긴 채 첫 타자를 칠 때까지 풀리지 않는다.
     readState 는 순수 조회라 렌더 중에 불러도 안전하다. */
  const s = picked ?? (editor ? readState(editor) : IDLE);
  const off = editor === null;

  /* 가격 옆 요약(lead)으로 올린 글은 좁은 칸 전용 스케일로만 그려진다 —
     DetailDocRenderer.tsx 의 LeadBody(92-125)는 LEAD.* 클래스만 쓰고 ALIGN_CLASS 도
     flowSizeClass 도 부르지 않는다. 즉 정렬·크기를 아무리 만져도 고객 화면은 그대로다.
     반영되지 않는 서식을 만질 수 있게 두면 관리자는 자기가 한 일에 속는다. */
  const leadIgnoresLayout = s.leadOn;

  const cmd = (fn: (c: ChainedCommands) => ChainedCommands) => () => {
    if (!editor) return;
    // focus() 를 먼저 태워야 방금 버튼 쪽으로 옮겨 간 초점이 본문으로 돌아온다
    fn(editor.chain().focus()).run();
  };

  /** 노드 속성 고치기는 '지금 커서가 어느 노드에 있는가' 를 알아야 해서 따로 둔다 */
  const setNodeAttr = (target: string | null, attrs: Record<string, unknown>) => () => {
    if (!editor || !target) return;
    editor.chain().focus().updateAttributes(target, attrs).run();
  };

  return (
    <div
      // role="toolbar" 는 화살표키로 버튼 사이를 옮겨 다니는 동작까지 약속하는 이름이다.
      // 그 동작을 만들지 않았으므로 지키지 못할 약속 대신 group 으로 둔다.
      role="group"
      aria-label="글 서식 도구"
      className={`${TOOLBAR_STICKY} flex flex-wrap items-center gap-0.5 border-b border-ink-200 bg-cream-50 px-2 py-1.5`}
    >
      {/* 1. 이 칸을 무엇으로 볼 것인가 — 지금 자리에서 먹히지 않는 것은 잠근다 */}
      {BLOCK_PRESETS.map((preset) => (
        <ToolButton
          key={preset.key}
          icon={preset.icon}
          ariaLabel={preset.label}
          title={preset.title}
          active={preset.isOn(s)}
          disabled={off || !s.canBlock[preset.key]}
          onClick={cmd(preset.apply)}
        />
      ))}

      <Sep />

      {/* 2. 본문 크기 — 제목·목록·인용에는 담을 칸이 없어 꺼진다 */}
      {SIZE_PRESETS.map((preset) => (
        <ToolButton
          key={preset.key}
          label={preset.label}
          ariaLabel={`본문 크기 ${preset.label}`}
          active={s.isParagraph && s.size === preset.key}
          disabled={off || !s.isParagraph || leadIgnoresLayout}
          onClick={cmd((c) => c.updateAttributes("paragraph", { size: preset.key }))}
        />
      ))}

      <Sep />

      {/* 3. 정렬 */}
      {ALIGN_PRESETS.map((preset) => (
        <ToolButton
          key={preset.key}
          icon={preset.icon}
          ariaLabel={preset.label}
          active={s.alignTarget !== null && s.align === preset.key}
          disabled={off || s.alignTarget === null || leadIgnoresLayout}
          onClick={setNodeAttr(s.alignTarget, { align: preset.key })}
        />
      ))}

      {/* 왜 잠겼는지 한 줄로 말해 준다 — 잠긴 버튼만 보여 주면 고장으로 읽힌다 */}
      {leadIgnoresLayout && (
        <span className="px-1.5 text-[11px] leading-tight text-ink-400">
          가격 옆 요약이라 정렬·크기는 반영되지 않습니다
        </span>
      )}

      <Sep />

      {/* 4. 고른 글자에 거는 서식 */}
      <ToolButton
        icon={Bold}
        ariaLabel="굵게"
        active={s.isBold}
        disabled={off}
        onClick={cmd((c) => c.toggleBold())}
      />
      <ToolButton
        icon={Baseline}
        ariaLabel="강조색"
        title="고른 글자를 브랜드 초록으로 물들입니다"
        active={s.isAccent}
        disabled={off}
        // 꺼져 있을 때 아이콘을 미리 초록으로 물들여 둔다 —
        // 무슨 색이 칠해지는지 눌러 보지 않고도 알게 하려는 것이다.
        iconClassName={off || s.isAccent ? "" : ACCENT_CLASS}
        onClick={cmd((c) => c.toggleMark(ACCENT_MARK))}
      />

      <Sep />

      {/* 5. 넣기 */}
      <ToolButton icon={ImagePlus} ariaLabel="사진 넣기" disabled={off} onClick={onInsertImage} />
      <ToolButton
        icon={Minus}
        ariaLabel="구분선 넣기"
        title="이야기가 바뀌는 자리에 가는 선을 긋습니다"
        disabled={off}
        onClick={cmd((c) => c.setHorizontalRule())}
      />
      <ToolButton
        icon={MoveVertical}
        ariaLabel="여백 넣기"
        title="글과 사진 사이를 한 칸 띄웁니다"
        disabled={off}
        onClick={cmd((c) => c.insertContent({ type: "spacer", attrs: { size: "md" } }))}
      />

      <Sep />

      {/* 6. lead — 이름만 봐서는 무슨 말인지 알 수 없는 기능이라 설명을 달아 둔다 */}
      <ToolButton
        icon={PanelRight}
        label="가격 옆에도 싣기"
        ariaLabel="가격 옆에도 싣기"
        title="켜면 이 글이 상품 페이지 가격 옆 요약에도 실립니다"
        active={s.leadOn}
        disabled={off || s.leadTarget === null}
        onClick={setNodeAttr(s.leadTarget, { lead: !s.leadOn })}
      />

      {/* 7. 어느 화면으로 볼 것인가 — 에디터가 없어도 눌러 볼 수 있어야 한다 */}
      <div className="ml-auto flex shrink-0 items-center">
        <ToolButton
          icon={Monitor}
          ariaLabel="PC 화면으로 보기"
          active={viewport === "pc"}
          onClick={() => onViewportChange("pc")}
        />
        <ToolButton
          icon={Smartphone}
          ariaLabel="모바일 화면으로 보기"
          active={viewport === "mobile"}
          onClick={() => onViewportChange("mobile")}
        />
      </div>
    </div>
  );
}
