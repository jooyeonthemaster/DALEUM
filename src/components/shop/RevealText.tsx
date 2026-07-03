"use client";

import { useEffect, useRef, useState, type CSSProperties, type ElementType } from "react";

export interface RevealTextProps {
  /** 렌더링할 태그 (기본 span) — 예: "h1", "h2", "p" */
  as?: ElementType;
  className?: string;
  /** 전체 시작 지연(초) */
  delay?: number;
  /** 어절 간 간격(초) */
  stagger?: number;
  /** 줄바꿈은 "\n" 으로 표기 */
  text: string;
}

/**
 * 어절 단위 스태거 리빌 — 세리프 대형 헤드라인용.
 * 각 어절을 span으로 감싸므로 한글 줄바꿈도 어절 단위로만 일어난다.
 */
export default function RevealText({
  as = "span",
  className = "",
  delay = 0,
  stagger = 0.055,
  text,
}: RevealTextProps) {
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
      { threshold: 0, rootMargin: "0px 0px -6% 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const lines = text.split("\n");
  let wordIndex = 0;

  return (
    <Tag
      ref={ref}
      className={`reveal-words${inview ? " is-inview" : ""}${className ? ` ${className}` : ""}`}
      aria-label={text.replace(/\n/g, " ")}
    >
      {lines.map((line, li) => (
        <span key={li} className="block">
          {line
            .split(/\s+/)
            .filter(Boolean)
            .map((word, wi) => {
              const d = delay + wordIndex * stagger;
              wordIndex += 1;
              return (
                <span
                  key={wi}
                  aria-hidden
                  className="reveal-word"
                  style={{ "--word-delay": `${d}s` } as CSSProperties}
                >
                  {word}
                  {" "}
                </span>
              );
            })}
        </span>
      ))}
    </Tag>
  );
}
