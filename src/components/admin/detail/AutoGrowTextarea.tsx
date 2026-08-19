"use client";

/* ============================================================
   내용에 맞춰 높이가 저절로 늘어나는 입력칸.

   왜 만들었나:
   영양·스펙 값은 한 줄짜리가 아니다. 운영 중인 상품에서 원재료명은 386자,
   인증 문구는 310자다. 옛 편집기는 그것을 한 줄짜리 입력칸에 담아서
   글이 오른쪽 경계 뒤로 사라졌다 — 오타를 눈으로 잡을 방법이 아예 없었다.

   높이를 자바스크립트로 재면(ref 로 scrollHeight 읽고 상태에 넣기) 이 저장소 규칙
   (effect 안 setState 금지)에 걸리고, 첫 렌더에서 한 번 튀어 보인다.
   그래서 계산을 하지 않는다 — 같은 칸에 겹쳐 둔 '보이지 않는 같은 글자'가
   높이를 밀어 올리고, 입력칸은 그 높이를 그대로 채운다.
   두 요소의 글꼴·줄간격·여백이 1px 이라도 다르면 어긋나므로 SHAPE 를 함께 쓴다.
   ============================================================ */

import type { ComponentProps } from "react";

/** 겹쳐 놓은 두 요소가 반드시 공유해야 하는 글자 모양 */
const SHAPE = "px-3.5 py-2.5 text-sm leading-relaxed";

export interface AutoGrowTextareaProps
  extends Omit<ComponentProps<"textarea">, "value" | "rows"> {
  value: string;
  /** 값이 한도를 넘었을 때 테두리를 빨갛게 */
  invalid?: boolean;
}

export default function AutoGrowTextarea({
  value,
  invalid,
  className = "",
  ...props
}: AutoGrowTextareaProps) {
  return (
    <div
      className={`grid w-full rounded-none border bg-cream-50 transition-colors focus-within:border-forest-600 ${
        invalid ? "border-signal-red" : "border-ink-200"
      } ${className}`}
    >
      {/* 높이를 만드는 그림자 글자. 끝에 공백 한 칸을 붙이는 이유는,
          값이 줄바꿈으로 끝날 때 그 빈 줄이 높이로 잡히지 않기 때문이다. */}
      <span
        aria-hidden
        className={`col-start-1 row-start-1 invisible whitespace-pre-wrap break-words ${SHAPE}`}
      >
        {`${value} `}
      </span>
      <textarea
        {...props}
        value={value}
        rows={1}
        className={`col-start-1 row-start-1 resize-none overflow-hidden bg-transparent text-ink-900 placeholder:text-ink-300 focus:outline-none disabled:cursor-not-allowed disabled:text-ink-400 ${SHAPE}`}
      />
    </div>
  );
}
