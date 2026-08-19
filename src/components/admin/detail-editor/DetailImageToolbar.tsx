"use client";

/* ============================================================
   선택된 사진 위에 뜨는 도구 막대 — 끌기 손잡이 · 정렬 · 폭 프리셋 · 자르기 · 지우기

   맨 앞의 **끌기 손잡이**가 이 파일에서 제일 조심스러운 자리다.
   세 가지가 동시에 맞아야 "이미지를 끌어 순서 바꾸기" 가 동작한다.

   1) `data-drag-handle` 표식이 있어야 한다.
      detailImage 는 draggable 노드지만, @tiptap/core 의 NodeView.stopEvent 는
      mousedown 대상이 [data-drag-handle] 안에 있을 때만 isDragging 을 켜 준다.
      그 전까지는 dragstart 를 통째로 preventDefault 한다 — 즉 표식이 하나도 없으면
      드래그는 **언제나** 취소된다. 표식 없이 draggable 만 켜 두는 것이 이 편집기의
      기존 상태였고, 그래서 순서를 마우스로 바꿀 수 없었다.

   2) button 이 아니라 div 여야 한다.
      같은 stopEvent 는 그보다 먼저 INPUT/BUTTON/SELECT/TEXTAREA 를 만나면 바로
      true 를 돌려주고 끝낸다. 손잡이를 button 으로 만들면 위 1) 의 분기까지
      가지도 못하고 드래그가 다시 죽는다. 그래서 role="button" 으로 의미만 남긴다.

   3) 손잡이 위에서는 mousedown 기본동작을 막으면 안 된다.
      막대 전체는 preventDefault 로 "버튼을 누르는 순간 선택이 풀리는" 것을 막는데,
      mousedown 을 막으면 브라우저가 native 드래그를 시작하지 않는다.
      손잡이에서만 전파를 끊어 그 preventDefault 를 피한다.

   폭 조절 손잡이(DetailImageView 의 role="separator")와는 자리·모양·이름을 모두
   떼어 놓았다. 그쪽은 지금처럼 dragstart 를 막는 것이 맞다 — 두 제스처가 한 요소에서
   겹치면 폭 드래그가 유령 이미지를 끌고 다니는 순서 드래그로 바뀐다.

   키보드로 순서를 바꾸는 길(SPEC §6 의 Alt+↑/↓)은 키맵이라 extensions.ts 몫이다.
   여기서는 손잡이가 그 일을 대신하는 척하지 않는다.
   ============================================================ */

import {
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartVertical,
  Crop,
  GripVertical,
  Trash2,
} from "lucide-react";
import type { Align } from "@/lib/detail-doc-v2";

const ICON = { size: 14, strokeWidth: 1.5 } as const;

/** 폭 프리셋 — 자주 쓰는 세 값만. 나머지는 가장자리를 끌어 맞춘다 */
const WIDTH_PRESETS = [50, 75, 100] as const;

const ALIGN_BUTTONS = [
  { value: "left", label: "왼쪽에 붙이기", Icon: AlignStartVertical },
  { value: "center", label: "가운데 놓기", Icon: AlignCenterVertical },
  { value: "right", label: "오른쪽에 붙이기", Icon: AlignEndVertical },
] as const;

const TOOL_BUTTON =
  "flex h-7 min-w-7 items-center justify-center px-1.5 text-[11px] text-cream-200 transition-colors hover:bg-forest-600 hover:text-cream-50";
const TOOL_BUTTON_ON = "bg-forest-700 text-cream-50";

export interface DetailImageToolbarProps {
  align: Align;
  widthPct: number;
  onAlign: (align: Align) => void;
  onWidth: (widthPct: number) => void;
  onCrop: () => void;
  onDelete: () => void;
}

export default function DetailImageToolbar({
  align,
  widthPct,
  onAlign,
  onWidth,
  onCrop,
  onDelete,
}: DetailImageToolbarProps) {
  // 막대는 사진에 붙어 다닌다 — 사진이 오른쪽에 붙어 있으면 막대도 오른쪽이다
  const side =
    align === "right" ? "right-0" : align === "center" ? "left-1/2 -translate-x-1/2" : "left-0";

  return (
    <div
      contentEditable={false}
      // 누르는 순간 선택이 풀리면 노드가 사라진 것처럼 보인다 (손잡이는 위 3) 참고)
      onMouseDown={(e) => e.preventDefault()}
      className={`absolute top-2 z-30 flex items-center gap-px bg-ink-900 p-1 ${side}`}
    >
      <div
        role="button"
        tabIndex={0}
        title="끌어서 순서 바꾸기"
        aria-label="끌어서 순서 바꾸기"
        data-drag-handle
        draggable
        onMouseDown={(e) => e.stopPropagation()}
        className={`${TOOL_BUTTON} cursor-grab bg-forest-800 active:cursor-grabbing`}
      >
        <GripVertical {...ICON} />
      </div>

      <span aria-hidden className="mx-1 h-4 w-px bg-ink-700" />

      {ALIGN_BUTTONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          title={label}
          aria-label={label}
          aria-pressed={align === value}
          onClick={() => onAlign(value)}
          className={`${TOOL_BUTTON} ${align === value ? TOOL_BUTTON_ON : ""}`}
        >
          <Icon {...ICON} />
        </button>
      ))}

      <span aria-hidden className="mx-1 h-4 w-px bg-ink-700" />

      {WIDTH_PRESETS.map((pct) => (
        <button
          key={pct}
          type="button"
          title={`폭 ${pct}%`}
          aria-label={`폭 ${pct}%로 맞추기`}
          aria-pressed={Math.round(widthPct) === pct}
          onClick={() => onWidth(pct)}
          className={`krw ${TOOL_BUTTON} ${Math.round(widthPct) === pct ? TOOL_BUTTON_ON : ""}`}
        >
          {pct}%
        </button>
      ))}

      <span aria-hidden className="mx-1 h-4 w-px bg-ink-700" />

      <button type="button" title="자르기" aria-label="사진 자르기" onClick={onCrop} className={TOOL_BUTTON}>
        <Crop {...ICON} />
      </button>
      <button
        type="button"
        title="지우기"
        aria-label="이 사진 지우기"
        onClick={onDelete}
        className={`${TOOL_BUTTON} hover:bg-signal-red`}
      >
        <Trash2 {...ICON} />
      </button>
    </div>
  );
}
