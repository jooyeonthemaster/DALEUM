"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/format";

export interface InquiryItem {
  id: string;
  maskedName: string;
  /** 비밀글이고 내 글이 아니면 null (서버에서 마스킹됨) */
  question: string | null;
  /** 비밀글이고 내 글이 아니면 null */
  answer: string | null;
  isPrivate: boolean;
  isMine: boolean;
  answered: boolean;
  createdAt: string;
}

export interface InquiriesSectionProps {
  productId: string;
  inquiries: InquiryItem[];
  isLoggedIn: boolean;
  loginNext: string;
  className?: string;
}

const PAGE = 5;

/** 상품 문의 — 목록(비밀글 잠금 표시) + 작성 폼 */
export default function InquiriesSection({
  productId,
  inquiries,
  isLoggedIn,
  loginNext,
  className = "",
}: InquiriesSectionProps) {
  const router = useRouter();
  const [visible, setVisible] = useState(PAGE);

  const [question, setQuestion] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  async function handleSubmit() {
    const trimmed = question.trim();
    if (trimmed.length < 5) {
      setError("문의 내용을 5자 이상 입력해 주세요.");
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
      const { error: insertError } = await supabase
        .from("product_inquiries")
        .insert({
          product_id: productId,
          user_id: user.id,
          question: trimmed,
          is_private: isPrivate,
        });
      if (insertError) {
        setError("문의 등록에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      setQuestion("");
      setIsPrivate(false);
      setDoneMessage("문의가 등록되었습니다. 확인 후 답변드리겠습니다.");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={className}>
      {/* ---------- 목록 ---------- */}
      {inquiries.length === 0 ? (
        <p className="headline-serif text-lg text-ink-600">
          아직 등록된 문의가 없습니다. 궁금한 점을 편하게 남겨 주세요.
        </p>
      ) : (
        <>
          <ul className="hairline-t divide-y divide-ink-100">
            {inquiries.slice(0, visible).map((inquiry) => {
              const locked = inquiry.question === null;
              return (
                <li key={inquiry.id} className="py-6">
                  {locked ? (
                    <p className="flex items-center gap-2 text-sm text-ink-400">
                      <Lock size={14} strokeWidth={1.5} />
                      비밀글입니다.
                    </p>
                  ) : (
                    <p className="whitespace-pre-line text-sm leading-relaxed text-ink-800">
                      {inquiry.isPrivate && (
                        <Lock
                          size={13}
                          strokeWidth={1.5}
                          className="mb-0.5 mr-1.5 inline-block text-ink-400"
                        />
                      )}
                      {inquiry.question}
                    </p>
                  )}
                  <p className="mt-2.5 text-xs text-ink-400">
                    {inquiry.maskedName}
                    {inquiry.isMine && " (내 문의)"} · {formatDate(inquiry.createdAt)} ·{" "}
                    <span className={inquiry.answered ? "text-forest-600" : ""}>
                      {inquiry.answered ? "답변 완료" : "답변 대기"}
                    </span>
                  </p>
                  {inquiry.answer && (
                    <div className="mt-4 border-l border-forest-300 bg-cream-100 px-4 py-3.5">
                      <p className="label-caps text-[10px] text-forest-700">
                        다름 답변
                      </p>
                      <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-ink-700">
                        {inquiry.answer}
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {inquiries.length > visible && (
            <button
              type="button"
              onClick={() => setVisible((v) => v + PAGE)}
              className="hairline-t label-caps block w-full py-4 text-center text-ink-600 transition-colors hover:text-ink-900"
            >
              문의 더 보기 ({inquiries.length - visible})
            </button>
          )}
        </>
      )}

      {/* ---------- 작성 폼 ---------- */}
      <div className="hairline-t mt-10 pt-8">
        {!isLoggedIn ? (
          <p className="text-sm text-ink-500">
            상품 문의는 로그인 후 남기실 수 있습니다.{" "}
            <Link
              href={`/login?next=${encodeURIComponent(loginNext)}`}
              className="link-line font-medium text-ink-900"
            >
              로그인
            </Link>
          </p>
        ) : (
          <div>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="상품에 대해 궁금하신 점을 남겨 주세요."
              className="w-full resize-y border border-ink-200 bg-cream-50 px-3.5 py-3 text-sm text-ink-900 outline-none transition-colors placeholder:text-ink-300 focus:border-forest-600"
            />
            {error && <p className="mt-2 text-[13px] text-signal-red">{error}</p>}
            {doneMessage && !error && (
              <p className="mt-2 text-[13px] text-forest-700">{doneMessage}</p>
            )}
            <div className="mt-3 flex items-center justify-between gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-600">
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                  className="h-4 w-4 accent-forest-700"
                />
                비밀글로 문의하기
              </label>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="bg-forest-700 px-6 py-2.5 text-sm font-medium text-cream-50 transition-colors hover:bg-forest-800 disabled:opacity-50"
              >
                {submitting ? "등록 중…" : "문의 등록"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
