import type { ReactNode } from "react";

export interface MarqueeProps {
  /** 흐를 내용 — 내부에서 2회 복제되므로 그대로 한 벌만 넘기면 된다 */
  children: ReactNode;
  className?: string;
}

/**
 * 무한 흐름 스트립 — globals.css의 .marquee-track 애니메이션 사용.
 * 내용이 화면 폭 이상이어야 자연스럽다 (짧으면 항목을 여러 번 나열해서 전달).
 */
export default function Marquee({ children, className = "" }: MarqueeProps) {
  return (
    <div className={`overflow-hidden ${className}`}>
      <div className="marquee-track">
        <div className="flex shrink-0 items-center">{children}</div>
        <div className="flex shrink-0 items-center" aria-hidden>
          {children}
        </div>
      </div>
      {/* 모션 최소화 사용자는 흐름 정지 */}
      <style>{`@media (prefers-reduced-motion: reduce){.marquee-track{animation:none}}`}</style>
    </div>
  );
}
