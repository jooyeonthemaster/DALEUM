"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from "react";

export type RevealVariant =
  | "fade" // 아래에서 떠오름 (기본)
  | "up"
  | "left" // 왼쪽에서 미끄러져 들어옴
  | "right"
  | "zoom" // 살짝 커졌다 가라앉음
  | "blur" // 블러가 걷히며 등장
  | "clip" // 커튼이 아래로 걷힘 (자식에 적용 — 이미지용)
  | "clip-left"
  | "clip-right"
  | "words" // 어절 단위 스태거 (RevealText 내부용)
  | "rule"; // 헤어라인이 좌→우로 그어짐

const VARIANT_CLASS: Record<RevealVariant, string> = {
  fade: "reveal",
  up: "reveal-up",
  left: "reveal-left",
  right: "reveal-right",
  zoom: "reveal-zoom",
  blur: "reveal-blur",
  clip: "reveal-clip",
  "clip-left": "reveal-clip-left",
  "clip-right": "reveal-clip-right",
  words: "reveal-words",
  rule: "reveal-rule",
};

export interface RevealProps {
  /** 렌더링할 태그 (기본 div) — 예: "section", "li", "figure" */
  as?: ElementType;
  className?: string;
  /** 등장 지연(초). CSS 변수 --reveal-delay로 전달된다 */
  delay?: number;
  variant?: RevealVariant;
  style?: CSSProperties;
  children?: ReactNode;
}

/**
 * 스크롤 리빌 래퍼 — 뷰포트에 들어오면 .is-inview를 붙이고, 한 번 보이면 유지한다.
 * 실제 모션은 globals.css가 담당한다.
 *
 * 중요: clip 계열은 래퍼가 아닌 "직계 자식"이 잘려 나타나는 구조다.
 * (관찰 대상 자체를 clip-path로 가리면 IntersectionObserver가 발동하지 않는다)
 */
export default function Reveal({
  as = "div",
  className = "",
  delay = 0,
  variant = "fade",
  style,
  children,
}: RevealProps) {
  const Tag = as as ElementType;
  const ref = useRef<HTMLElement | null>(null);
  const [inview, setInview] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      setInview(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInview(true);
            observer.disconnect();
          }
        }
      },
      // threshold 0 + 하단 여유 — 긴 요소도 확실히 발동
      { threshold: 0, rootMargin: "0px 0px -6% 0px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const base = VARIANT_CLASS[variant] ?? "reveal";
  const mergedStyle: CSSProperties = {
    ...style,
    ...(delay > 0 ? ({ "--reveal-delay": `${delay}s` } as CSSProperties) : {}),
  };

  return (
    <Tag
      ref={ref}
      className={`${base}${inview ? " is-inview" : ""}${className ? ` ${className}` : ""}`}
      style={mergedStyle}
    >
      {children}
    </Tag>
  );
}
