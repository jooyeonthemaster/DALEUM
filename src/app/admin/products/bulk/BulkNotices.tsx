"use client";

/* ============================================================
   화면 위쪽 알림 세 가지 — 이어서 하기 · 방금 결과 · 등록 진행률

   화면 파일에서 떼어 냈다(한 파일 400줄에서 분할, 500줄 절대 초과 금지).
   셋 다 "지금 무슨 일이 벌어졌는지" 를 알리는 역할이라 한곳에 모았다.

   특히 진행률이 중요하다: 예전에는 전 행을 한 번에 보내고 화면에는 버튼 안
   동그라미 하나만 돌았다. 30개를 올리면 몇 분간 멈춘 것처럼 보여, 참지 못하고
   새로고침하면 그때까지 올라간 것이 어디까지인지 알 길이 없었다.
   ============================================================ */

import { BTN_GHOST, BTN_PRIMARY } from "../product-ui";
import type { ProductDraft } from "./bulk-types";

export interface BulkNoticesProps {
  /** 새로고침 전에 작성하던 내용. 없으면 묻지 않는다 */
  restorable: ProductDraft[] | null;
  onRestore: (drafts: ProductDraft[]) => void;
  onDiscardRestore: () => void;
  message: { tone: "ok" | "error"; text: string } | null;
  /** 등록을 10개씩 나눠 보내는 동안의 진행 */
  sent: { done: number; total: number } | null;
}

export default function BulkNotices({
  restorable,
  onRestore,
  onDiscardRestore,
  message,
  sent,
}: BulkNoticesProps) {
  return (
    <>
      {restorable && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-forest-200 bg-forest-50 px-4 py-3">
          <p className="text-sm text-forest-800">
            작성하던 상품 {restorable.length}개가 남아 있습니다. 이어서 하시겠어요?
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => onRestore(restorable)} className={BTN_PRIMARY}>
              이어서 하기
            </button>
            <button type="button" onClick={onDiscardRestore} className={BTN_GHOST}>
              새로 시작
            </button>
          </div>
        </div>
      )}

      {message && (
        <p
          role="status"
          className={`mb-4 border px-4 py-3 text-sm leading-relaxed ${
            message.tone === "ok"
              ? "border-forest-200 bg-forest-50 text-forest-700"
              : "border-signal-red bg-[#f8eee9] text-signal-red"
          }`}
        >
          {message.text}
        </p>
      )}

      {sent && (
        <div className="mb-4 border border-ink-200 bg-cream-50 px-4 py-3">
          <p className="krw text-sm text-ink-700">
            {sent.total}개 중 {sent.done}개 등록 완료
          </p>
          <div className="mt-2 h-1 w-full bg-ink-100">
            <div
              className="h-full bg-forest-700 transition-all duration-300"
              style={{ width: `${Math.round((sent.done / Math.max(1, sent.total)) * 100)}%` }}
            />
          </div>
        </div>
      )}
    </>
  );
}
