"use client";

/* ============================================================
   불러오기 두 창구 — 엑셀과 이미지 폴더

   화면 파일에서 떼어 냈다(한 파일 500줄 상한).
   둘 다 접이식인 이유는, 카드를 손으로 채우는 사람에게는 필요 없는 단계이기 때문이다.
   대신 안내 문구에 "회사 품목표를 그대로 올려도 된다" 는 사실을 분명히 적는다 —
   예전에는 이 화면이 회사 파일을 못 읽었고, 그 사실도 알려 주지 않았다.
   ============================================================ */

import { ChevronDown, ChevronUp, FolderOpen, Sheet } from "lucide-react";
import type { Category } from "@/lib/types";
import FolderIntakePanel, { type FolderApplyResult } from "./FolderIntakePanel";
import SheetMappingPanel from "./SheetMappingPanel";
import type { SheetImportResult } from "./bulk-sheet";
import type { ProductDraft } from "./bulk-types";

export interface IntakeSectionsProps {
  categories: Category[];
  drafts: ProductDraft[];
  showSheet: boolean;
  showFolder: boolean;
  setShowSheet: (fn: (open: boolean) => boolean) => void;
  setShowFolder: (fn: (open: boolean) => boolean) => void;
  onSheetConfirm: (result: SheetImportResult) => void;
  onFolderApply: (results: FolderApplyResult[], noteCount: number, failures: string[]) => void;
}

export default function IntakeSections({
  categories,
  drafts,
  showSheet,
  showFolder,
  setShowSheet,
  setShowFolder,
  onSheetConfirm,
  onFolderApply,
}: IntakeSectionsProps) {
  return (
    <>
  {/* 엑셀 */}
  <section className="mb-3 border border-ink-200 bg-cream-50">
    <button
      type="button"
      onClick={() => setShowSheet((open) => !open)}
      aria-expanded={showSheet}
      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
    >
      <span className="flex items-center gap-2">
        <Sheet size={17} strokeWidth={1.5} className="text-ink-400" />
        <span>
          <span className="block text-sm font-semibold text-ink-900">엑셀로 상품 정보 불러오기</span>
          <span className="mt-0.5 block text-xs text-ink-400">
            회사에서 쓰는 품목표를 그대로 올려도 됩니다. 같은 상품의 10입·20입은 옵션으로 묶입니다.
          </span>
        </span>
      </span>
      {showSheet ? <ChevronUp size={18} strokeWidth={1.5} /> : <ChevronDown size={18} strokeWidth={1.5} />}
    </button>
    {showSheet && (
      <div className="border-t border-ink-100 px-4 py-4">
        <SheetMappingPanel
          categories={categories}
          onConfirm={onSheetConfirm}
        />
      </div>
    )}
  </section>

  {/* 폴더 */}
  <section className="mb-5 border border-ink-200 bg-cream-50">
    <button
      type="button"
      onClick={() => setShowFolder((open) => !open)}
      aria-expanded={showFolder}
      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
    >
      <span className="flex items-center gap-2">
        <FolderOpen size={17} strokeWidth={1.5} className="text-ink-400" />
        <span>
          <span className="block text-sm font-semibold text-ink-900">이미지 폴더 통째로 올리기</span>
          <span className="mt-0.5 block text-xs text-ink-400">
            상품별 폴더를 끌어다 놓으면 폴더 이름으로 상품을 찾아 사진을 나눠 담습니다.
          </span>
        </span>
      </span>
      {showFolder ? <ChevronUp size={18} strokeWidth={1.5} /> : <ChevronDown size={18} strokeWidth={1.5} />}
    </button>
    {showFolder && (
      <div className="border-t border-ink-100 px-4 py-4">
        <FolderIntakePanel drafts={drafts} onApply={onFolderApply} />
      </div>
    )}
  </section>
    </>
  );
}
