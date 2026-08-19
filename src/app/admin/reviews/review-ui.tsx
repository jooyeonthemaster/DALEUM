"use client";

/* ============================================================
   리뷰 화면 공통 조각 — 행 타입 / 평점 표시 / 공개 상태 배지

   평점을 별 이모지로 찍지 않는 이유: 기기마다 다른 그림으로 렌더되고
   스크린리더는 "노란 별 노란 별…" 을 그대로 읽는다. 도트 다섯 개 + 숫자로 대신한다.
   ============================================================ */

import { TOGGLE_LABELS } from "@/lib/admin-labels";
import type { Review } from "@/lib/types";

export interface ReviewRow extends Omit<Review, "profiles"> {
  products: { id: string; name: string; slug: string } | null;
  profiles: { name: string | null; email: string | null } | null;
}

export interface ProductOption {
  id: string;
  name: string;
}

export interface ReviewCounts {
  all: number;
  pending: number;
  hidden: number;
}

export function RatingDots({ rating, className = "" }: { rating: number; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 ${className}`}
      role="img"
      aria-label={`평점 ${rating}점`}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          aria-hidden
          className={`h-2 w-2 rounded-full ${i < rating ? "bg-forest-600" : "bg-ink-200"}`}
        />
      ))}
      <span className="ml-1 text-xs text-ink-500 krw">{rating}.0</span>
    </span>
  );
}

/** 작성자 표시 — 이름이 없으면 이메일, 그것도 없으면 탈퇴/미기입 표시 */
export function authorName(r: ReviewRow): string {
  return r.profiles?.name || r.profiles?.email || "이름 없음";
}

/** 스토어에 보이는지 — 켜고 끄는 말은 노출/숨김으로 통일한다(TOGGLE_LABELS) */
export function VisibilityBadge({ hidden }: { hidden: boolean }) {
  return hidden ? (
    <span className="bg-ink-100 px-2 py-0.5 text-[11px] text-ink-500">{TOGGLE_LABELS.off}</span>
  ) : (
    <span className="bg-forest-100 px-2 py-0.5 text-[11px] text-forest-800">
      {TOGGLE_LABELS.on}
    </span>
  );
}

export function ReplyBadge({ replied }: { replied: boolean }) {
  return replied ? (
    <span className="bg-cream-200 px-2 py-0.5 text-[11px] text-ink-600">답글 완료</span>
  ) : (
    <span className="bg-brass-300/25 px-2 py-0.5 text-[11px] text-brass-700">답글 대기</span>
  );
}
