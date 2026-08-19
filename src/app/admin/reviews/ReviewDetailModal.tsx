"use client";

/* ============================================================
   리뷰 상세 — 사진 확대 / 답글 / 노출·숨김 / 영구 삭제

   사진을 새 탭으로 열지 않는 이유:
   예전 화면은 사진을 누르면 저장소 주소(https://….supabase.co/storage/…)로 이동했다.
   대표 눈에 개발자용 주소가 그대로 노출되고, 돌아오면 모달이 닫혀 있어 답글을 다시 열어야 했다.
   그래서 이 화면 안에서 크게 본다.
   ============================================================ */

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import Modal from "@/components/admin/Modal";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { Help, Textarea, Toggle } from "@/components/admin/Field";
import { formatDateTime } from "@/lib/format";
import { TOGGLE_LABELS } from "@/lib/admin-labels";
import { authorName, RatingDots, type ReviewRow } from "./review-ui";

export interface ReviewDetailModalProps {
  review: ReviewRow;
  onClose: () => void;
  /** 답글·노출 상태가 바뀐 리뷰 */
  onUpdated: (next: ReviewRow) => void;
  onDeleted: (id: string) => void;
}

export default function ReviewDetailModal({
  review,
  onClose,
  onUpdated,
  onDeleted,
}: ReviewDetailModalProps) {
  const [reply, setReply] = useState(review.admin_reply ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const photos = review.image_urls ?? [];

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/reviews/${review.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      onUpdated(json.review as ReviewRow);
    } catch {
      setError("네트워크 문제로 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    const res = await fetch(`/api/admin/reviews/${review.id}`, { method: "DELETE" });
    setConfirmDelete(false);
    if (res.ok) {
      onDeleted(review.id);
      return;
    }
    const json = await res.json().catch(() => ({}));
    setError(json.error ?? "삭제하지 못했습니다.");
  }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title="리뷰 상세"
        size="lg"
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-[13px] text-ink-400 transition-colors hover:text-signal-red"
            >
              영구 삭제
            </button>
            <div className="flex items-center gap-4">
              <Toggle
                checked={!review.is_hidden}
                disabled={saving}
                onChange={(next) => patch({ is_hidden: !next })}
                label={review.is_hidden ? TOGGLE_LABELS.off : TOGGLE_LABELS.on}
              />
              <button
                type="button"
                onClick={() => patch({ admin_reply: reply })}
                disabled={saving}
                className="bg-forest-700 px-4 py-2.5 text-sm text-cream-50 transition-colors hover:bg-forest-800 disabled:opacity-50"
              >
                {saving ? "저장 중…" : "답글 저장"}
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-5">
          {/* ---------- 머리 ---------- */}
          <div>
            {review.products ? (
              <Link
                href={`/admin/products/${review.products.id}`}
                className="text-sm font-semibold text-ink-900 underline-offset-4 hover:underline"
              >
                {review.products.name}
              </Link>
            ) : (
              <p className="text-sm font-semibold text-ink-400">삭제된 상품</p>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-400">
              <RatingDots rating={review.rating} />
              <span>{authorName(review)}</span>
              <span className="krw">{formatDateTime(review.created_at)}</span>
              {review.is_hidden && (
                <span className="bg-ink-100 px-2 py-0.5 text-[11px] text-ink-500">
                  지금은 스토어에 보이지 않습니다
                </span>
              )}
            </div>
          </div>

          <p className="whitespace-pre-wrap border-t border-ink-100 pt-4 text-sm leading-relaxed text-ink-700">
            {review.content}
          </p>

          {/* ---------- 사진 ---------- */}
          {photos.length > 0 && (
            <div>
              {zoom !== null && (
                <div className="relative mb-3 border border-ink-200 bg-cream-100">
                  <div className="relative h-[46vh] w-full">
                    <Image
                      src={photos[zoom]}
                      alt={`고객이 올린 사진 ${zoom + 1}`}
                      fill
                      sizes="(max-width: 768px) 100vw, 720px"
                      className="object-contain"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 border-t border-ink-200 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setZoom((z) => ((z ?? 0) - 1 + photos.length) % photos.length)}
                      disabled={photos.length < 2}
                      aria-label="이전 사진"
                      className="p-1 text-ink-500 transition-colors hover:text-ink-900 disabled:text-ink-200"
                    >
                      <ChevronLeft size={18} strokeWidth={1.5} />
                    </button>
                    <span className="krw text-xs text-ink-500">
                      {zoom + 1} / {photos.length}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setZoom((z) => ((z ?? 0) + 1) % photos.length)}
                        disabled={photos.length < 2}
                        aria-label="다음 사진"
                        className="p-1 text-ink-500 transition-colors hover:text-ink-900 disabled:text-ink-200"
                      >
                        <ChevronRight size={18} strokeWidth={1.5} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setZoom(null)}
                        aria-label="크게 보기 닫기"
                        className="p-1 text-ink-400 transition-colors hover:text-ink-900"
                      >
                        <X size={16} strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {photos.map((url, i) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => setZoom(i)}
                    aria-label={`고객이 올린 사진 ${i + 1} 크게 보기`}
                    className={`relative block h-20 w-20 overflow-hidden border transition-colors ${
                      zoom === i ? "border-forest-600" : "border-ink-200 hover:border-ink-400"
                    }`}
                  >
                    <Image src={url} alt="" fill sizes="80px" className="object-cover" />
                  </button>
                ))}
              </div>
              <Help>사진을 누르면 이 화면 안에서 크게 볼 수 있습니다.</Help>
            </div>
          )}

          {/* ---------- 답글 ---------- */}
          <div className="border-t border-ink-100 pt-4">
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="admin-reply" className="text-[13px] font-medium text-ink-700">
                관리자 답글
              </label>
              <button
                type="button"
                onClick={() =>
                  setReply((prev) =>
                    prev.trimEnd().endsWith("다름 드림")
                      ? prev
                      : `${prev.trimEnd()}${prev.trim() ? "\n\n" : ""}다름 드림`
                  )
                }
                className="text-xs text-ink-500 transition-colors hover:text-forest-700"
              >
                서명 넣기
              </button>
            </div>
            <Textarea
              id="admin-reply"
              rows={5}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="소중한 후기 감사합니다. …"
            />
            <Help>
              답글은 저장하는 즉시 스토어 상품 페이지의 이 리뷰 아래에 공개됩니다. 끝인사는{" "}
              <strong>&ldquo;다름 드림&rdquo;</strong>으로 마무리해 주세요. 내용을 비우고 저장하면
              답글이 지워집니다.
            </Help>
            {review.admin_replied_at && (
              <p className="mt-1 text-xs text-ink-400 krw">
                마지막 답글: {formatDateTime(review.admin_replied_at)}
              </p>
            )}
            {error && <Help tone="error">{error}</Help>}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title="이 리뷰를 영구 삭제할까요?"
        description={
          "리뷰 본문과 사진이 모두 지워지고 되돌릴 수 없습니다.\n" +
          "잠시 가려 두려는 것이라면 삭제 대신 숨김으로 두세요. 숨김은 언제든 다시 노출할 수 있습니다."
        }
        confirmLabel="영구 삭제"
        danger
      />
    </>
  );
}
