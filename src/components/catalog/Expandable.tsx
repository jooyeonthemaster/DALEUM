"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export interface ExpandableProps {
  /**
   * 접었을 때 보여줄 줄 수. 이 요소의 line-height 기준(lh 단위)이라
   * 폰트 크기·행간이 달라도 항상 "N줄"로 잘린다.
   */
  lines?: number;
  moreLabel?: string;
  lessLabel?: string;
  className?: string;
  children: ReactNode;
}

/**
 * 잘린 끝을 부드럽게 흐려 "아래에 더 있다"를 말해 준다.
 * 고정 길이(em)로 흐리면 2줄짜리에서는 둘째 줄이 통째로 지워져 읽을 수가 없다.
 * 비율로 잡아 두면 2줄에서는 마지막 글자 밑동만, 긴 블록에서는 끝 한 줄쯤이
 * 흐려져 어느 높이에서든 같은 인상이 된다.
 */
const FADE = "linear-gradient(to bottom, #000 82%, transparent 100%)";

/**
 * 긴 본문을 N줄만 남기고 접어 두는 래퍼 — "자세히 보기"로 펼친다.
 * 원재료·원산지처럼 길이를 예측할 수 없는 값이 표를 무너뜨리는 걸 막는다.
 *
 * 잘라야 할 만큼 긴지는 렌더된 결과를 실측해서 판단한다.
 * 같은 문장도 폭에 따라 데스크톱 2줄 / 모바일 6줄이 되므로 글자 수로는 알 수 없고,
 * 잘리지도 않는데 "자세히 보기"가 붙는 건 그 자체로 잡음이기 때문이다.
 *
 * 측정 전(서버 렌더 직후)에는 접힌 상태로 둔다. 펼쳐진 채로 그렸다가 접으면
 * 긴 글에서 화면이 크게 출렁인다. 반대로 짧은 글은 어차피 자르는 높이 안에 들어와
 * 접힌 채로 그려도 보이는 모습이 같아, 어느 쪽도 깜빡이지 않는다.
 */
export default function Expandable({
  lines = 2,
  moreLabel = "자세히 보기",
  lessLabel = "접기",
  className = "",
  children,
}: ExpandableProps) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  const [open, setOpen] = useState(false);
  /** null = 아직 측정 전 */
  const [overflowing, setOverflowing] = useState<boolean | null>(null);
  const [fullHeight, setFullHeight] = useState<number | null>(null);

  useEffect(() => {
    const box = boxRef.current;
    const inner = innerRef.current;
    if (!box || !inner) return;

    const measure = () => {
      const style = getComputedStyle(box);
      // line-height: normal 은 숫자로 안 읽힌다 — 그때만 폰트 크기로 근사한다.
      const parsed = Number.parseFloat(style.lineHeight);
      const lineHeight = Number.isFinite(parsed)
        ? parsed
        : (Number.parseFloat(style.fontSize) || 16) * 1.5;

      // 안쪽 요소는 높이 제한을 받지 않으므로(자르는 건 바깥 상자다)
      // scrollHeight 가 언제나 "펼쳤을 때의 실제 높이"다.
      const full = inner.scrollHeight;
      setFullHeight(full);
      setOverflowing(full > lineHeight * lines + 2);
    };

    measure();

    // 폭이 바뀌면 줄 수가 달라지고, 콘텐츠가 바뀌면 높이가 달라진다.
    const observer = new ResizeObserver(measure);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [lines]);

  // 측정 결과 잘릴 게 없으면 높이 제한 자체를 걷는다.
  const clamped = overflowing !== false && !open;

  return (
    <div className={className}>
      <div
        ref={boxRef}
        id={panelId}
        className="overflow-hidden transition-[max-height] duration-500 ease-hall motion-reduce:transition-none"
        style={{
          maxHeight: clamped
            ? `${lines}lh`
            : open && fullHeight != null
              ? `${fullHeight}px`
              : undefined,
          // 페이드는 "확실히 잘렸다"고 판명된 뒤에만 — 짧은 값의 끝줄이 괜히 흐려지지 않게.
          ...(overflowing === true && !open
            ? { maskImage: FADE, WebkitMaskImage: FADE }
            : {}),
        }}
      >
        <div ref={innerRef}>{children}</div>
      </div>

      {overflowing === true && (
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-controls={panelId}
          className="label-caps mt-2 inline-flex items-center gap-1 text-[10px] text-forest-600 transition-colors duration-300 hover:text-forest-800"
        >
          {open ? lessLabel : moreLabel}
          <ChevronDown
            size={13}
            strokeWidth={1.75}
            aria-hidden
            className={`transition-transform duration-500 ease-hall motion-reduce:transition-none ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>
      )}
    </div>
  );
}
