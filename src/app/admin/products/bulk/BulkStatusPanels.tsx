"use client";

/* ============================================================
   목록 위쪽 상태 패널 — 숫자 요약 · 확인이 필요한 항목 · 대기열

   화면 파일에서 떼어 냈다(한 파일 500줄 상한).

   숫자 카드의 라벨이 예전에는 PRODUCTS / IMAGES / PASSED 였다.
   'PASSED' 가 무엇을 통과했다는 뜻인지 알 수 없었고, 390px 폭에서는
   3열을 강제해 'PRODUCT' 와 'S' 가 두 줄로 쪼개져 보였다.
   이제 한국어 라벨 + 한 줄 설명을 달고, 모바일에서는 한 줄씩 눕힌다.
   ============================================================ */

import { krw } from "@/lib/format";
import { BTN_GHOST } from "../product-ui";
import { MAX_PRODUCTS, type DraftIssue } from "./bulk-types";

export interface BulkStatusPanelsProps {
  readyCount: number;
  imageTotal: number;
  passedCount: number;
  issues: DraftIssue[];
  queuedCount: number;
  draftCount: number;
  /** 이미 등록이 끝나 잠긴 카드 수 */
  registeredCount: number;
  /** 안내를 눌렀을 때 그 카드를 펼치고 그리로 이동한다 */
  onFocusIssue: (draftId: string) => void;
  onLoadQueued: () => void;
  onCollapseAll: (collapsed: boolean) => void;
  onClearRegistered: () => void;
}

export default function BulkStatusPanels({
  readyCount,
  imageTotal,
  passedCount,
  issues,
  queuedCount,
  draftCount,
  registeredCount,
  onFocusIssue,
  onLoadQueued,
  onCollapseAll,
  onClearRegistered,
}: BulkStatusPanelsProps) {
  return (
    <>
  {/* 숫자 요약 — 모바일에서는 한 줄씩 눕힌다 */}
  <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
    {[
      { label: "등록 대기 상품", value: readyCount, hint: "이번에 등록될 상품 수", tone: "text-ink-900" },
      { label: "올린 사진", value: imageTotal, hint: "상품 사진과 상세페이지 사진 전부", tone: "text-ink-900" },
      { label: "확인 통과", value: passedCount, hint: "바로 등록할 수 있는 상품 수", tone: "text-forest-700" },
    ].map((card) => (
      <div
        key={card.label}
        className="flex items-center justify-between gap-3 border border-ink-200 bg-cream-50 px-4 py-3 sm:block"
      >
        <div>
          <p className="text-xs font-medium text-ink-700">{card.label}</p>
          <p className="mt-0.5 text-[11px] text-ink-400">{card.hint}</p>
        </div>
        <p className={`krw text-2xl font-semibold sm:mt-2 ${card.tone}`}>{krw(card.value)}</p>
      </div>
    ))}
  </div>

  {/* 확인이 필요한 항목 요약 — 눌러서 해당 카드로 이동 */}
  {issues.length > 0 && (
    <div className="mb-4 border border-signal-red bg-[#f8eee9] px-4 py-3">
      <p className="text-sm font-medium text-signal-red">확인이 필요한 항목 {issues.length}개</p>
      <ul className="mt-2 space-y-1">
        {issues.map((issue, i) => (
          <li key={`${issue.draftId}-${issue.field}-${i}`}>
            <button
              type="button"
              onClick={() => onFocusIssue(issue.draftId)}
              className="text-left text-xs leading-relaxed text-signal-red underline-offset-2 hover:underline"
            >
              {issue.message}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )}

  {/* 부분 실패 뒤의 정리 — 30개 중 22개가 들어가고 8개가 남는 상황이 흔하다.
      끝난 22개를 치워야 남은 8개만 놓고 볼 수 있다. 치워도 상품은 그대로 있으므로
      "지우기" 가 아니라 "치우기" 라고 부른다 — 상품이 삭제되는 줄 알면 아무도 못 누른다. */}
  {registeredCount > 0 && (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-forest-200 bg-forest-50 px-4 py-3">
      <p className="krw text-sm text-forest-800">
        {krw(registeredCount)}개 등록 완료 · {krw(readyCount)}개 남음
      </p>
      <button type="button" onClick={onClearRegistered} className={BTN_GHOST}>
        끝난 {krw(registeredCount)}개 카드 치우기
      </button>
    </div>
  )}

  {queuedCount > 0 && (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-signal-amber bg-[#faf3df] px-4 py-3">
      <p className="text-sm text-[#8a650e]">
        아직 올리지 않은 상품 {queuedCount}개가 대기 중입니다.
      </p>
      <button type="button" onClick={onLoadQueued} disabled={draftCount >= MAX_PRODUCTS} className={BTN_GHOST}>
        남은 {queuedCount}개 이어서 불러오기
      </button>
    </div>
  )}

  {draftCount > 1 && (
    <div className="mb-3 flex gap-2">
      <button type="button" onClick={() => onCollapseAll(true)} className="text-xs text-ink-500 hover:text-forest-700">
        전체 접기
      </button>
      <span className="text-xs text-ink-300">|</span>
      <button type="button" onClick={() => onCollapseAll(false)} className="text-xs text-ink-500 hover:text-forest-700">
        전체 펼치기
      </button>
    </div>
  )}

    </>
  );
}
