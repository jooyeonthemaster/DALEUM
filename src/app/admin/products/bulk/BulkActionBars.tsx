"use client";

/* ============================================================
   위·아래 두 개의 실행 줄 — 화면 맨 위 머리말과 아래에 붙어 따라다니는 막대

   화면 파일에서 떼어 냈다(한 파일 400줄에서 분할).

   같은 단추를 위아래 두 곳에 두는 이유: 카드 50개를 펼치면 화면이 수만 px 이 되어
   위쪽 단추가 한참 위로 사라진다. 아래 막대가 따라다니지 않으면 등록 한 번 누르려고
   맨 위까지 되감아야 한다.

   단추 이름을 상황에 따라 바꾼다 — 일부만 성공한 뒤에는 "등록하기" 가 아니라
   "남은 8개 등록" 이라고 적어야, 이미 들어간 22개가 또 들어가는 게 아니라는 것이 보인다.
   ============================================================ */

import Link from "next/link";
import { CheckCircle2, Loader2, Plus, Send } from "lucide-react";
import { krw } from "@/lib/format";
import { BTN_GHOST, BTN_PRIMARY } from "../product-ui";
import { MAX_PRODUCTS } from "./bulk-types";

export interface BulkActionBarsProps {
  /** 이번에 등록될 상품 수 (등록이 끝난 카드는 빠져 있다) */
  readyCount: number;
  /** 이미 등록이 끝나 잠긴 카드 수 */
  registeredCount: number;
  /** 화면에 놓인 카드 총수 — 상한에 닿으면 '상품 추가' 를 막는다 */
  draftCount: number;
  busy: boolean;
  onAddDraft: () => void;
  onValidate: () => void;
  onRequestCreate: () => void;
}

/** 상황에 맞는 등록 단추 이름 */
function createLabel(readyCount: number, registeredCount: number): string {
  return registeredCount > 0 ? `남은 ${krw(readyCount)}개 등록` : "등록하기";
}

export function BulkHeader({
  readyCount,
  registeredCount,
  draftCount,
  busy,
  onAddDraft,
  onValidate,
  onRequestCreate,
}: BulkActionBarsProps) {
  const full = draftCount >= MAX_PRODUCTS;

  return (
    <header className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <Link href="/admin/products" className="text-xs text-ink-400 transition-colors hover:text-forest-700">
          상품 목록으로
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-ink-900">상품 일괄 등록</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-500">
          엑셀 한 장과 상품별 사진 폴더로 여러 상품을 한 번에 올립니다. 한 번에 {MAX_PRODUCTS}개까지 등록할 수
          있습니다.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onAddDraft}
          disabled={full}
          // 예전에는 50개에서 아무 반응 없이 무시돼 단추가 고장 난 줄 알았다
          title={full ? `한 번에 ${MAX_PRODUCTS}개까지 등록할 수 있습니다` : undefined}
          className={`${BTN_GHOST} inline-flex items-center gap-2`}
        >
          <Plus size={16} strokeWidth={1.5} />
          상품 추가
        </button>
        <button
          type="button"
          onClick={onValidate}
          disabled={busy}
          className={`${BTN_GHOST} inline-flex items-center gap-2`}
        >
          <CheckCircle2 size={16} strokeWidth={1.5} />
          미리 확인
        </button>
        <button
          type="button"
          onClick={onRequestCreate}
          disabled={busy || readyCount === 0}
          className={`${BTN_PRIMARY} inline-flex items-center gap-2`}
        >
          {busy ? (
            <Loader2 size={16} strokeWidth={1.5} className="animate-spin" />
          ) : (
            <Send size={16} strokeWidth={1.5} />
          )}
          {createLabel(readyCount, registeredCount)}
        </button>
      </div>
    </header>
  );
}

export function BulkStickyBar({
  readyCount,
  registeredCount,
  busy,
  onValidate,
  onRequestCreate,
}: Omit<BulkActionBarsProps, "draftCount" | "onAddDraft">) {
  return (
    <div className="sticky bottom-0 z-20 mt-8 flex flex-col gap-3 border-t border-ink-200 bg-cream-50/95 py-4 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-ink-500">
        등록할 상품 <span className="krw font-medium text-ink-900">{krw(readyCount)}</span>개
        {registeredCount > 0 && (
          <span className="krw text-forest-700"> · 등록 완료 {krw(registeredCount)}개</span>
        )}
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={onValidate} disabled={busy} className={BTN_GHOST}>
          미리 확인
        </button>
        <button
          type="button"
          onClick={onRequestCreate}
          disabled={busy || readyCount === 0}
          className={BTN_PRIMARY}
        >
          {busy ? "처리 중" : createLabel(readyCount, registeredCount)}
        </button>
      </div>
    </div>
  );
}
