"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from "react";

export interface RevealProps {
  /** 렌더링할 태그 (기본 div) — 예: "section", "li", "figure" */
  as?: ElementType;
  className?: string;
  /** 등장 지연(초). CSS 변수 --reveal-delay로 전달된다 */
  delay?: number;
  /** fade: 아래에서 떠오름(.reveal) / clip: 위→아래로 드러남(.reveal-clip) */
  variant?: "fade" | "clip";
  style?: CSSProperties;
  children?: ReactNode;
}

/**
 * 스크롤 리빌 래퍼 — 뷰포트에 들어오면 .is-inview를 붙이고, 한 번 보이면 유지한다.
 * 실제 모션은 globals.css의 .reveal / .reveal-clip이 담당한다.
 * (prefers-reduced-motion 사용자는 CSS 쪽에서 모션이 해제됨)
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

    // IntersectionObserver 미지원 환경 폴백 — DOM에 직접 표시
    if (typeof IntersectionObserver === "undefined") {
      el.classList.add("is-inview");
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
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const base = variant === "clip" ? "reveal-clip" : "reveal";
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
