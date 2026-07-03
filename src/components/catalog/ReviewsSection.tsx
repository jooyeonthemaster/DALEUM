"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/format";

export interface ReviewItem {
  id: string;
  maskedName: string;
  rating: number;
  content: string;
  imageUrls: string[];
  /** order_item_id 존재 = 구매 확인 리뷰 */
  isBuyer: boolean;
  adminReply: string | null;
  createdAt: string;
}

export interface ReviewsSectionProps {
  productId: string;
  reviews: ReviewItem[];
  isLoggedIn: boolean;
  /** 이미 이 상품에 리뷰를 남긴 경우 */
  alreadyReviewed: boolean;
  /** 구매 이력이 있으면 해당 order_item id (구매 확인 표시용) */
  orderItemId: string | null;
  /** 로그인 후 돌아올 경로 */
  loginNext: string;
  className?: string;
}

const PAGE = 5;

function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={`별점 ${rating}점 (5점 만점)`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          strokeWidth={1.5}
          className={n <= rating ? "text-forest-600" : "text-ink-200"}
          fill={n <= rating ? "currentColor" : "none"}
        />
      ))}
    </span>
  );
}

/** 리뷰 섹션 — 평점 요약(평균+분포) + 목록 + 작성 폼 */
export default function ReviewsSection({
  productId,
  reviews,
  isLoggedIn,
  alreadyReviewed,
  orderItemId,
  loginNext,
  className = "",
}: ReviewsSectionProps) {
  const router = useRouter();
  const [visible, setVisible] = useState(PAGE);

  // ---------- 작성 폼 상태 ----------
  const [rating, setRating] = useState(5);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const stats = useMemo(() => {
    const total = reviews.length;
    const dist = [0, 0, 0, 0, 0]; // index 0 = 1점
    let sum = 0;
    for (const r of reviews) {
      sum += r.rating;
      if (r.rating >= 1 && r.rating <= 5) dist[r.rating - 1] += 1;
    }
    return { total, average: total > 0 ? sum / total : 0, dist };
  }, [reviews]);

  async function handleSubmit() {
    const trimmed = content.trim();
    if (trimmed.length < 5) {
      setError("리뷰 내용을 5자 이상 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("로그인이 필요합니다. 다시 로그인해 주세요.");
        return;
      }
      const { error: insertError } = await supabase.from("reviews").insert({
        product_id: productId,
        user_id: user.id,
        order_item_id: orderItemId,
        rating,
        content: trimmed,
      });
      if (insertError) {
        setError("리뷰 등록에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      setDone(true);
      setContent("");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={className}>
      {/* ---------- 평점 요약 ---------- */}
      {stats.total > 0 ? (
        <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:gap-14">
          <div className="shrink-0 text-center sm:text-left">
            <p className="headline-serif text-5xl text-ink-900">
              {stats.average.toFixed(1)}
            </p>
            <div className="mt-2.5 flex justify-center sm:justify-start">
              <Stars rating={Math.round(stats.average)} size={16} />
            </div>
            <p className="krw mt-2 text-[13px] text-ink-500">
              {stats.total}개의 리뷰
            </p>
          </div>
          <ul className="w-full max-w-sm space-y-2">
            {[5, 4, 3, 2, 1].map((score) => {
              const count = stats.dist[score - 1];
              const ratio = stats.total > 0 ? (count / stats.total) * 100 : 0;
              return (
                <li key={score} className="flex items-center gap-3">
                  <span className="krw w-6 shrink-0 text-right text-xs text-ink-500">
                    {score}점
                  </span>
                  <span className="relative h-1 flex-1 overflow-hidden bg-ink-100">
                    <span
                      aria-hidden
                      className="absolute inset-y-0 left-0 bg-forest-600"
                      style={{ width: `${ratio}%` }}
                    />
                  </span>
                  <span className="krw w-7 shrink-0 text-right text-xs text-ink-400">
                    {count}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="headline-serif text-lg text-ink-600">
          아직 작성된 리뷰가 없습니다. 첫 번째 이야기를 남겨 주세요.
        </p>
      )}

      {/* ---------- 리뷰 목록 ---------- */}
      {stats.total > 0 && (
        <>
          <ul className="hairline-t mt-10 divide-y divide-ink-100">
            {reviews.slice(0, visible).map((review) => (
              <li key={review.id} className="py-7">
                <div className="flex flex-wrap items-center gap-2.5">
                  <Stars rating={review.rating} />
                  {review.isBuyer && (
                    <span className="label-caps rounded-full border border-forest-200 px-2 py-0.5 text-[9px] text-forest-700">
                      구매 확인
                    </span>
                  )}
                </div>
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-800">
                  {review.content}
                </p>
                {review.imageUrls.length > 0 && (
                  <div className="mt-4 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {review.imageUrls.map((url, i) => (
                      <span
                        key={`${review.id}-img-${i}`}
                        className="relative block h-20 w-20 shrink-0 overflow-hidden rounded-sm bg-cream-100"
                      >
                        <Image
                          src={url}
                          alt={`리뷰 이미지 ${i + 1}`}
                          fill
                          sizes="80px"
                          className="object-cover"
                        />
                      </span>
                    ))}
                  </div>
                )}
                <p className="mt-3 text-xs text-ink-400">
                  {review.maskedName} · {formatDate(review.createdAt)}
                </p>
                {review.adminReply && (
                  <div className="mt-4 bg-cream-100 px-4 py-3.5">
                    <p className="label-caps text-[10px] text-forest-700">
                      다름 드림
                    </p>
                    <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-ink-700">
                      {review.adminReply}
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {reviews.length > visible && (
            <button
              type="button"
              onClick={() => setVisible((v) => v + PAGE)}
              className="hairline-t label-caps block w-full py-4 text-center text-ink-600 transition-colors hover:text-ink-900"
            >
              리뷰 더 보기 ({reviews.length - visible})
            </button>
          )}
        </>
      )}

      {/* ---------- 작성 폼 ---------- */}
      <div className="hairline-t mt-10 pt-8">
        {!isLoggedIn ? (
          <p className="text-sm text-ink-500">
            리뷰는 로그인 후 작성하실 수 있습니다.{" "}
            <Link
              href={`/login?next=${encodeURIComponent(loginNext)}`}
              className="link-line font-medium text-ink-900"
            >
              로그인
            </Link>
          </p>
        ) : alreadyReviewed || done ? (
          <p className="text-sm text-ink-500">
            이미 이 상품에 리뷰를 남겨 주셨습니다. 소중한 의견 감사합니다.
          </p>
        ) : (
          <div>
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-[13px] text-ink-500">별점</span>
              <span className="inline-flex items-center gap-1" role="radiogroup" aria-label="별점 선택">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={rating === n}
                    aria-label={`${n}점`}
                    onClick={() => setRating(n)}
                    className="p-0.5"
                  >
                    <Star
                      size={20}
                      strokeWidth={1.5}
                      className={
                        n <= rating ? "text-forest-600" : "text-ink-200 transition-colors hover:text-ink-400"
                      }
                      fill={n <= rating ? "currentColor" : "none"}
                    />
                  </button>
                ))}
              </span>
              {orderItemId && (
                <span className="label-caps rounded-full border border-forest-200 px-2 py-0.5 text-[9px] text-forest-700">
                  구매 확인 리뷰
                </span>
              )}
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="상품을 사용해 보신 솔직한 이야기를 들려주세요."
              className="mt-4 w-full resize-y border border-ink-200 bg-cream-50 px-3.5 py-3 text-sm text-ink-900 outline-none transition-colors placeholder:text-ink-300 focus:border-forest-600"
            />
            {error && <p className="mt-2 text-[13px] text-signal-red">{error}</p>}
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="bg-forest-700 px-6 py-2.5 text-sm font-medium text-cream-50 transition-colors hover:bg-forest-800 disabled:opacity-50"
              >
                {submitting ? "등록 중…" : "리뷰 등록"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
