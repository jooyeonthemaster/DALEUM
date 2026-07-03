"use client";

import { useEffect, useRef, useState } from "react";

export interface OdorScaleItem {
  label: string;
  /** 라벨 옆 보조 설명 — 예: "참고 기준" */
  note?: string;
  /** 측정 최소값 (단일값이면 max와 동일하게) */
  min: number;
  /** 측정 최대값 — 바 길이의 기준 */
  max: number;
  tone?: "muted" | "forest" | "ref";
}

export interface OdorScaleProps {
  items: OdorScaleItem[];
  /** 축의 최대 눈금 (기본 80) */
  scaleMax?: number;
  caption?: string;
  className?: string;
}

const TONE_CLASS: Record<NonNullable<OdorScaleItem["tone"]>, string> = {
  muted: "bg-ink-400",
  forest: "bg-forest-600",
  ref: "bg-forest-300",
};

/**
 * 냄새 측정 수치 비교 바 — 뷰포트에 들어오면 바가 값만큼 천천히 채워진다.
 * 값이 범위(min–max)면 상한 기준으로 바를 그리고, 라벨에 범위를 표기한다.
 */
export default function OdorScale({
  items,
  scaleMax = 80,
  caption,
  className = "",
}: OdorScaleProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inview, setInview] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // IntersectionObserver 미지원 환경 폴백 — 다음 프레임에 바로 채운다
    if (typeof IntersectionObserver === "undefined") {
      const raf = requestAnimationFrame(() => setInview(true));
      return () => cancelAnimationFrame(raf);
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
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={className}>
      <ul className="space-y-7">
        {items.map((item, i) => {
          const width = Math.min(100, (item.max / scaleMax) * 100);
          const valueText =
            item.min === item.max ? `${item.max}` : `${item.min}–${item.max}`;
          return (
            <li key={item.label}>
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-sm font-medium text-ink-900">
                  {item.label}
                  {item.note && (
                    <span className="ml-2 text-xs font-normal text-ink-400">
                      {item.note}
                    </span>
                  )}
                </p>
                <p className="krw shrink-0 text-sm text-ink-600">{valueText}</p>
              </div>
              <div className="mt-2.5 h-2 w-full overflow-hidden bg-cream-200">
                <div
                  className={`h-full transition-[width] duration-[1400ms] ease-hall ${
                    TONE_CLASS[item.tone ?? "forest"]
                  }`}
                  style={{
                    width: inview ? `${width}%` : "0%",
                    transitionDelay: `${i * 0.18}s`,
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <div className="krw mt-4 flex justify-between text-[11px] text-ink-300">
        <span>0</span>
        <span>{scaleMax}</span>
      </div>

      {caption && (
        <p className="mt-5 text-xs leading-relaxed text-ink-400">{caption}</p>
      )}
    </div>
  );
}
