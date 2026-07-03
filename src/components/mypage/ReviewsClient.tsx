"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Review } from "@/lib/types";
import { formatDate } from "@/lib/format";
import Skeleton from "@/components/shop/Skeleton";
import ShopModal from "./ShopModal";

const MIN_CONTENT_LENGTH = 10;

interface PendingItem {
  orderItemId: string;
  productId: string;
  name: string;
  option: string | null;
  imageUrl: string | null;
  orderedAt: string;
}

interface OrderJoinRow {
  id: string;
  created_at: string;
  order_items: {
    id: string;
    product_id: string | null;
    name_snapshot: string;
    option_snapshot: string | null;
    image_url: string | null;
  }[];
}

interface WrittenReview extends Review {
  products?: { name: string; slug: string } | { name: string; slug: string }[] | null;
}

/** 별점 표시/선택 */
function Stars({
  value,
  onChange,
  size = 18,
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
}) {
  if (!onChange) {
    return (
      <span className="flex items-center gap-0.5" aria-label={`별점 ${value}점`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            size={size}
            strokeWidth={1.5}
            className={n <= value ? "fill-forest-600 text-forest-600" : "text-ink-300"}
            aria-hidden
          />
        ))}
      </span>
    );
  }
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="별점 선택">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n}점`}
          onClick={() => onChange(n)}
          className="p-0.5"
        >
          <Star
            size={size + 6}
            strokeWidth={1.5}
            className={`transition-colors ${
              n <= value ? "fill-forest-600 text-forest-600" : "text-ink-300 hover:text-ink-500"
            }`}
            aria-hidden
          />
        </button>
      ))}
    </div>
  );
}

/** 나의 리뷰 — 작성 가능한 리뷰 / 작성한 리뷰 탭 */
export default function ReviewsClient() {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const requestedItem = searchParams.get("item");

  const [tab, setTab] = useState<"writable" | "written">("writable");
  const [pending, setPending] = useState<PendingItem[] | null>(null);
  const [written, setWritten] = useState<WrittenReview[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [writing, setWriting] = useState<PendingItem | null>(null);
  const [rating, setRating] = useState(5);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState<WrittenReview | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [consumedParam, setConsumedParam] = useState<string | null>(null);

  const load = useCallback(() => {
    return supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);

      return Promise.all([
        supabase
          .from("orders")
          .select(
            "id, created_at, order_items(id, product_id, name_snapshot, option_snapshot, image_url)"
          )
          .eq("user_id", user.id)
          .in("status", ["delivered", "confirmed"])
          .order("created_at", { ascending: false }),
        supabase
          .from("reviews")
          .select("*, products(name, slug)")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
      ]).then(([ordersRes, reviewsRes]) => {
        if (ordersRes.error || reviewsRes.error) {
          setError("리뷰 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
          setPending([]);
          setWritten([]);
          return;
        }

        const reviews = (reviewsRes.data ?? []) as unknown as WrittenReview[];
        const reviewedItemIds = new Set(
          reviews.map((r) => r.order_item_id).filter((v): v is string => Boolean(v))
        );

        const items: PendingItem[] = [];
        for (const order of (ordersRes.data ?? []) as unknown as OrderJoinRow[]) {
          for (const item of order.order_items ?? []) {
            if (!item.product_id || reviewedItemIds.has(item.id)) continue;
            items.push({
              orderItemId: item.id,
              productId: item.product_id,
              name: item.name_snapshot,
              option: item.option_snapshot,
              imageUrl: item.image_url,
              orderedAt: order.created_at,
            });
          }
        }

        setPending(items);
        setWritten(reviews);
      });
    });
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  // ?item= 파라미터로 진입하면 해당 상품 리뷰 작성 폼 자동 열기 (렌더 중 상태 보정 패턴)
  if (pending && requestedItem && consumedParam !== requestedItem) {
    setConsumedParam(requestedItem);
    const target = pending.find((p) => p.orderItemId === requestedItem);
    if (target) {
      setWriting(target);
      setRating(5);
      setContent("");
      setFormError(null);
    }
  }

  const openWrite = (item: PendingItem) => {
    setWriting(item);
    setRating(5);
    setContent("");
    setFormError(null);
  };

  const closeWrite = () => {
    if (busy) return;
    setWriting(null);
  };

  const submit = async () => {
    if (!writing || !userId || busy) return;
    if (content.trim().length < MIN_CONTENT_LENGTH) {
      setFormError(`리뷰는 ${MIN_CONTENT_LENGTH}자 이상 작성해 주세요.`);
      return;
    }
    setBusy(true);
    setFormError(null);
    const { error: insertError } = await supabase.from("reviews").insert({
      product_id: writing.productId,
      user_id: userId,
      order_item_id: writing.orderItemId,
      rating,
      content: content.trim(),
    });
    setBusy(false);
    if (insertError) {
      setFormError("리뷰 등록에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    setWriting(null);
    setTab("written");
    await load();
  };

  const removeReview = async () => {
    if (!deleting || busy) return;
    setBusy(true);
    const { error: deleteError } = await supabase
      .from("reviews")
      .delete()
      .eq("id", deleting.id);
    setBusy(false);
    if (deleteError) {
      setError("리뷰 삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    }
    setDeleting(null);
    await load();
  };

  const productOf = (review: WrittenReview) => {
    const p = review.products;
    if (!p) return null;
    return Array.isArray(p) ? (p[0] ?? null) : p;
  };

  const loading = pending === null || written === null;

  return (
    <div>
      <h2 className="headline-serif mb-6 text-xl text-ink-900 md:text-[1.35rem]">나의 리뷰</h2>

      {/* 탭 */}
      <div className="flex gap-6 border-b border-ink-200" role="tablist">
        {(
          [
            { key: "writable", label: "작성 가능한 리뷰", count: pending?.length },
            { key: "written", label: "작성한 리뷰", count: written?.length },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 pb-3 text-sm transition-colors ${
              tab === t.key
                ? "border-forest-700 font-medium text-ink-900"
                : "border-transparent text-ink-500 hover:text-ink-900"
            }`}
          >
            {t.label}
            {t.count != null && (
              <span className={`krw ml-1.5 text-xs ${tab === t.key ? "text-forest-700" : "text-ink-400"}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-4 text-[13px] text-signal-red">
          {error}
        </p>
      )}

      {loading ? (
        <div className="mt-6 space-y-3" aria-hidden>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : tab === "writable" ? (
        pending.length === 0 ? (
          <div className="border-x border-b border-ink-200 px-6 py-16 text-center">
            <p className="headline-serif text-lg text-ink-900">
              지금 작성할 수 있는 리뷰가 없습니다.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-ink-500">
              배송 완료된 주문의 상품에 리뷰를 남길 수 있습니다.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-ink-100 border-x border-b border-ink-200">
            {pending.map((item) => (
              <li key={item.orderItemId} className="flex items-center gap-4 px-5 py-4">
                <div className="relative h-16 w-[52px] shrink-0 overflow-hidden bg-cream-100">
                  {item.imageUrl ? (
                    <Image
                      src={item.imageUrl}
                      alt={item.name}
                      fill
                      sizes="52px"
                      className="object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-[8px] tracking-[0.18em] text-ink-300">
                      DALEUM
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">{item.name}</p>
                  {item.option && <p className="mt-0.5 text-xs text-ink-500">{item.option}</p>}
                  <p className="mt-0.5 text-xs text-ink-400">
                    {formatDate(item.orderedAt)} 주문
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openWrite(item)}
                  className="shrink-0 border border-ink-900 px-4 py-2 text-[13px] text-ink-900 transition-colors hover:bg-ink-900 hover:text-cream-50"
                >
                  리뷰 쓰기
                </button>
              </li>
            ))}
          </ul>
        )
      ) : written.length === 0 ? (
        <div className="border-x border-b border-ink-200 px-6 py-16 text-center">
          <p className="headline-serif text-lg text-ink-900">작성한 리뷰가 아직 없습니다.</p>
          <p className="mt-3 text-sm leading-relaxed text-ink-500">
            첫 리뷰로 발효 곤약의 경험을 나눠주세요.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-ink-100 border-x border-b border-ink-200">
          {written.map((review) => {
            const product = productOf(review);
            return (
              <li key={review.id} className="px-5 py-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {product ? (
                    <Link
                      href={`/products/${product.slug}`}
                      className="link-line text-sm font-medium text-ink-900"
                    >
                      {product.name}
                    </Link>
                  ) : (
                    <span className="text-sm text-ink-400">판매 종료된 상품</span>
                  )}
                  <span className="text-xs text-ink-400">{formatDate(review.created_at)}</span>
                </div>
                <div className="mt-2">
                  <Stars value={review.rating} size={14} />
                </div>
                <p className="mt-2.5 whitespace-pre-line text-sm leading-relaxed text-ink-700">
                  {review.content}
                </p>
                {review.is_hidden && (
                  <p className="mt-2 text-xs text-ink-400">
                    관리자에 의해 비공개 처리된 리뷰입니다.
                  </p>
                )}
                {review.admin_reply && (
                  <div className="mt-3.5 bg-cream-100 px-4 py-3.5">
                    <p className="label-caps text-forest-600">Daleum 답변</p>
                    <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-ink-600">
                      {review.admin_reply}
                    </p>
                  </div>
                )}
                <div className="mt-3 text-right">
                  <button
                    type="button"
                    onClick={() => setDeleting(review)}
                    className="text-xs text-ink-400 transition-colors hover:text-signal-red"
                  >
                    삭제
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* 리뷰 작성 모달 */}
      <ShopModal
        open={writing !== null}
        onClose={closeWrite}
        title="리뷰 쓰기"
        footer={
          <>
            <button
              type="button"
              onClick={closeWrite}
              disabled={busy}
              className="border border-ink-200 px-4 py-2 text-sm text-ink-700 transition-colors hover:bg-cream-100 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="bg-forest-700 px-4 py-2 text-sm text-cream-50 transition-colors hover:bg-forest-800 disabled:opacity-50"
            >
              {busy ? "등록 중…" : "등록하기"}
            </button>
          </>
        }
      >
        {writing && (
          <div>
            <div className="flex items-center gap-3.5">
              <div className="relative h-14 w-11 shrink-0 overflow-hidden bg-cream-100">
                {writing.imageUrl ? (
                  <Image
                    src={writing.imageUrl}
                    alt={writing.name}
                    fill
                    sizes="44px"
                    className="object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[8px] tracking-[0.18em] text-ink-300">
                    DALEUM
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink-900">{writing.name}</p>
                {writing.option && (
                  <p className="mt-0.5 text-xs text-ink-500">{writing.option}</p>
                )}
              </div>
            </div>

            <p className="mt-6 mb-2 text-[13px] text-ink-600">상품은 어떠셨나요?</p>
            <Stars value={rating} onChange={setRating} />

            <label htmlFor="review-content" className="mt-5 mb-1.5 block text-[13px] text-ink-600">
              리뷰 내용
            </label>
            <textarea
              id="review-content"
              rows={5}
              maxLength={1000}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="맛, 식감, 조리법 등 솔직한 경험을 들려주세요. (10자 이상)"
              className="w-full border border-ink-200 bg-transparent px-3.5 py-3 text-sm leading-relaxed text-ink-900 transition-colors placeholder:text-ink-300 focus:border-forest-600 focus-visible:outline-none"
            />
            <p className="krw mt-1 text-right text-[11px] text-ink-400">
              {content.trim().length}/1000
            </p>

            {formError && (
              <p role="alert" className="mt-2 text-[13px] text-signal-red">
                {formError}
              </p>
            )}
          </div>
        )}
      </ShopModal>

      {/* 리뷰 삭제 확인 */}
      <ShopModal
        open={deleting !== null}
        onClose={() => !busy && setDeleting(null)}
        title="리뷰 삭제"
        footer={
          <>
            <button
              type="button"
              onClick={() => setDeleting(null)}
              disabled={busy}
              className="border border-ink-200 px-4 py-2 text-sm text-ink-700 transition-colors hover:bg-cream-100 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={removeReview}
              disabled={busy}
              className="bg-signal-red px-4 py-2 text-sm text-cream-50 transition-colors hover:bg-[#9c3c27] disabled:opacity-50"
            >
              {busy ? "삭제 중…" : "삭제"}
            </button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-ink-600">
          작성한 리뷰를 삭제합니다. 삭제한 리뷰는 복구할 수 없습니다.
        </p>
      </ShopModal>
    </div>
  );
}
