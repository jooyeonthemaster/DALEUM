"use client";

/* ============================================================
   상품 카드 한 장.

   접을 수 있게 만든 이유:
   옛 화면은 모든 카드를 항상 펼친 채로 그렸다. 카드 한 장이 약 500px 이므로
   실제 품목표를 불러오면 한 장짜리 폼이 1만 3천 px, 상한인 50개면 2만 5천 px 이 된다.
   "3번 상품의 판매가를 확인해 주세요" 같은 안내를 받아도 스크롤로 눈으로 세어
   찾아야 했다. 이제 기본은 한 줄 요약이고, 눌러야 펼쳐진다.

   등록에 성공한 카드는 잠근다 — 성공한 22개를 그대로 다시 보내
   전부 중복 오류가 나던 사고(부분 실패 복구 불가)를 막기 위해서다.
   ============================================================ */

import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Lock,
  Trash2,
  XCircle,
} from "lucide-react";
import { Help, Textarea, Toggle } from "@/components/admin/Field";
import type { Category } from "@/lib/types";
import DraftBasicFields from "./DraftBasicFields";
import DraftExtraFields from "./DraftExtraFields";
import DraftImageLane from "./DraftImageLane";
import VariantTable from "./VariantTable";
import {
  DRAFT_STATUS_LABELS,
  type BulkResult,
  type DraftIssue,
  type DraftImage,
  type ProductDraft,
} from "./bulk-types";

export interface DraftCardProps {
  draft: ProductDraft;
  /** 화면에 보이는 카드 순번 — 안내 문구의 번호와 반드시 같아야 한다 */
  index: number;
  categories: Category[];
  result?: BulkResult;
  issues: DraftIssue[];
  onPatch: (patch: Partial<ProductDraft>) => void;
  onRemove: () => void;
  /** 부모가 이 카드로 스크롤할 수 있게 실제 요소를 넘겨준다 (DOM id 대신) */
  sectionRef?: (el: HTMLElement | null) => void;
}

function StatusBadge({ result, locked }: { result?: BulkResult; locked: boolean }) {
  if (locked) {
    return (
      <span className="inline-flex items-center gap-1 border border-forest-200 bg-forest-50 px-2.5 py-1 text-xs text-forest-700">
        <CheckCircle2 size={13} strokeWidth={1.5} />
        등록 완료
      </span>
    );
  }
  if (!result) {
    return (
      <span className="inline-flex items-center gap-1 border border-ink-200 bg-cream-50 px-2.5 py-1 text-xs text-ink-400">
        아직 확인 안 함
      </span>
    );
  }
  if (!result.ok) {
    return (
      <span className="inline-flex items-center gap-1 border border-signal-red bg-[#f8eee9] px-2.5 py-1 text-xs text-signal-red">
        <XCircle size={13} strokeWidth={1.5} />
        확인 필요
      </span>
    );
  }
  if (result.warnings.length > 0) {
    return (
      <span className="inline-flex items-center gap-1 border border-signal-amber bg-[#faf3df] px-2.5 py-1 text-xs text-[#8a650e]">
        <AlertTriangle size={13} strokeWidth={1.5} />
        살펴볼 점 있음
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 border border-forest-200 bg-forest-50 px-2.5 py-1 text-xs text-forest-700">
      <CheckCircle2 size={13} strokeWidth={1.5} />
      확인됨
    </span>
  );
}


export default function DraftCard({
  draft,
  index,
  categories,
  result,
  issues,
  onPatch,
  onRemove,
  sectionRef,
}: DraftCardProps) {
  const locked = draft.registeredId != null;
  const issueOf = (field: DraftIssue["field"]) => issues.find((i) => i.field === field)?.message;
  const imageCount = draft.galleryImages.length + draft.detailImages.length;

  /** 대표 칸에서 세로로 긴 사진이 나오면 상세 칸으로 넘겨받는다(그 반대도 마찬가지) */
  function spillTo(lane: "gallery" | "detail", images: DraftImage[]) {
    if (lane === "gallery") onPatch({ galleryImages: [...draft.galleryImages, ...images] });
    else onPatch({ detailImages: [...draft.detailImages, ...images] });
  }

  return (
    <section
      /* DOM id 를 쓰지 않는다 — id 에 난수를 담으면 서버/클라이언트 HTML 이 어긋난다.
         카드로 이동해야 할 때는 부모가 이 ref 를 붙잡아 쓴다. */
      ref={sectionRef}
      className={`scroll-mt-24 border bg-cream-50 transition-colors ${
        issues.length > 0 ? "border-signal-red" : "border-ink-200"
      }`}
    >
      {/* 머리말 — 접혀 있을 때는 이 한 줄이 카드 전부다 */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 px-4 py-3">
        <button
          type="button"
          onClick={() => onPatch({ collapsed: !draft.collapsed })}
          aria-expanded={!draft.collapsed}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          {draft.collapsed ? (
            <ChevronDown size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-ink-400" />
          ) : (
            <ChevronUp size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-ink-400" />
          )}
          <span className="min-w-0">
            <span className="krw block text-xs text-ink-400">상품 {index + 1}</span>
            <span className="mt-0.5 block truncate text-base font-semibold text-ink-900">
              {draft.name.trim() || "이름 없는 상품"}
            </span>
            <span className="krw mt-0.5 block text-xs text-ink-500">
              {draft.price ? `${Number(draft.price.replace(/[^\d-]/g, "") || 0).toLocaleString("ko-KR")}원` : "판매가 없음"}
              {` · 재고 ${draft.stock || 0}`}
              {` · 사진 ${imageCount}장`}
              {draft.variants.length > 0 && ` · 옵션 ${draft.variants.length}개`}
              {` · ${DRAFT_STATUS_LABELS[draft.status]}`}
            </span>
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge result={result} locked={locked} />
          {locked ? (
            <span className="p-2 text-forest-700" title="등록이 끝나 잠긴 카드입니다">
              <Lock size={16} strokeWidth={1.5} />
            </span>
          ) : (
            <button
              type="button"
              onClick={onRemove}
              aria-label={`상품 ${index + 1} 카드 삭제`}
              className="p-2 text-ink-400 transition-colors hover:text-signal-red"
            >
              <Trash2 size={17} strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>

      {draft.notes.length > 0 && (
        <ul className="border-b border-ink-100 bg-[#faf3df] px-4 py-2">
          {draft.notes.map((note) => (
            <li key={note} className="text-xs leading-relaxed text-[#8a650e]">
              {note}
            </li>
          ))}
        </ul>
      )}

      {!draft.collapsed && (
        <div className="grid gap-5 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(26rem,0.85fr)]">
          <div className="space-y-4">
            <DraftBasicFields
              draft={draft}
              categories={categories}
              locked={locked}
              issueOf={issueOf}
              onPatch={onPatch}
            />

            <VariantTable
              basePrice={draft.price}
              value={draft.variants}
              disabled={locked}
              onChange={(variants) => onPatch({ variants })}
            />
            {issueOf("variants") && <Help tone="error">{issueOf("variants")}</Help>}

            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-ink-700">상품 설명</span>
              <Textarea
                rows={4}
                value={draft.description}
                disabled={locked}
                onChange={(e) => onPatch({ description: e.target.value })}
                placeholder="상품 특징, 조리법, 맛과 식감 등을 자유롭게 적어 주세요."
              />
            </label>

            <button
              type="button"
              onClick={() => onPatch({ showMore: !draft.showMore })}
              aria-expanded={draft.showMore}
              className="inline-flex items-center gap-1.5 text-sm text-ink-500 transition-colors hover:text-forest-700"
            >
              {draft.showMore ? <ChevronUp size={16} strokeWidth={1.5} /> : <ChevronDown size={16} strokeWidth={1.5} />}
              한줄 소개 · 배지 · 영양 정보 더 넣기
            </button>

            {draft.showMore && (
              <DraftExtraFields draft={draft} locked={locked} onPatch={onPatch} />
            )}

            <Toggle
              checked={draft.status === "active"}
              disabled={locked}
              onChange={(checked) => onPatch({ status: checked ? "active" : "draft" })}
              label="등록하자마자 판매중으로 열기"
            />
          </div>

          <div className="space-y-5">
            <DraftImageLane
              lane="gallery"
              label="상품 사진"
              helper="맨 앞 사진이 대표입니다. 목록과 상세 위쪽에 나옵니다."
              value={draft.galleryImages}
              disabled={locked}
              uploadPrefix={`bulk/${draft.id}/gallery`}
              onChange={(galleryImages) => onPatch({ galleryImages })}
              onSpill={(images) => spillTo("detail", images)}
            />
            {issueOf("gallery") && <Help tone="error">{issueOf("gallery")}</Help>}

            <DraftImageLane
              lane="detail"
              label="상세페이지 사진"
              helper="상품 설명 아래에 순서대로 이어 붙습니다. 길어도 그대로 올리세요."
              value={draft.detailImages}
              disabled={locked}
              uploadPrefix={`bulk/${draft.id}/detail`}
              onChange={(detailImages) => onPatch({ detailImages })}
              onSpill={(images) => spillTo("gallery", images)}
            />
          </div>
        </div>
      )}

      {(result?.errors.length || result?.warnings.length || draft.registeredId) && (
        <div className="border-t border-ink-100 px-4 py-3">
          {result?.errors.map((error) => (
            <p key={error} className="text-sm text-signal-red">
              {error}
            </p>
          ))}
          {result?.warnings.map((warning) => (
            <p key={warning} className="text-sm text-[#8a650e]">
              {warning}
            </p>
          ))}
          {draft.registeredId && (
            <Link
              href={`/admin/products/${draft.registeredId}`}
              className="mt-1 inline-block text-sm text-forest-700 hover:underline"
            >
              등록된 상품 열어 보기
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
