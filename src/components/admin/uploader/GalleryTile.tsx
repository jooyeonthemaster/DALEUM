"use client";

/* ============================================================
   상품 사진 타일 한 칸.

   ImageUploader 본체에서 떼어 낸 이유는 두 가지다.
    1) 본체가 업로드·순서·상한·경고를 모두 지고 있어 한 파일에 두면 400줄을 넘긴다.
    2) 타일 안에서만 쓰는 조작(자르기·대표 지정·삭제)이 본체 로직과 섞이면
       "어느 버튼이 무엇을 바꾸는지" 를 읽기 어려워진다.

   삭제 버튼을 순서 화살표와 같은 줄에 두지 않는다 —
   예전 타일은 ‹ › ✕ 가 14px 간격으로 한 줄에 붙어 있어
   순서를 바꾸려다 오른쪽 끝 삭제를 누르기 쉬웠다. 삭제는 사진 위 우상단으로 뺐다.
   ============================================================ */

import Image from "next/image";
import { ChevronLeft, ChevronRight, Crop, GripVertical, Star, X } from "lucide-react";

export interface GalleryTileProps {
  url: string;
  index: number;
  total: number;
  /** 첫 장이 대표 — 여러 장 모드에서만 의미가 있다 */
  isPrimary: boolean;
  /** "2,000 × 1,333" 같은 크기 설명. 이번에 올린 사진만 알 수 있다 */
  caption: string | null;
  /** 원본 파일명 — 마우스를 올리면 보인다 */
  sourceName: string | null;
  /** 미리보기 가로/세로 비율 (고객 화면과 맞추기 위한 값) */
  previewAspect: number;
  /** 고객 화면이 확대해 잘라 내는 영역을 점선으로 그릴지 */
  showSafeArea: boolean;
  /**
   * 순서 조작(끌기·화살표·대표 지정)을 보일지.
   * 한 장짜리 자리(배너·팝업·카테고리 대표컷)에서는 순서라는 개념이 없어서,
   * 눌러도 아무 일 없는 버튼만 늘어놓게 된다.
   */
  sortable: boolean;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onCrop: () => void;
  onMakePrimary: () => void;
  dragging: boolean;
  dropTarget: boolean;
  dragHandlers: {
    onDragStart: () => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
    onDragEnd: () => void;
  };
}

const ICON = { size: 14, strokeWidth: 1.5 } as const;

export default function GalleryTile({
  url,
  index,
  total,
  isPrimary,
  caption,
  sourceName,
  previewAspect,
  showSafeArea,
  sortable,
  onMove,
  onRemove,
  onCrop,
  onMakePrimary,
  dragging,
  dropTarget,
  dragHandlers,
}: GalleryTileProps) {
  return (
    <li
      draggable={sortable}
      onDragStart={(e) => {
        // 파이어폭스는 dataTransfer 에 아무것도 없으면 드래그를 시작조차 하지 않는다.
        // 순서 바꾸기는 화살표로도 되지만, 되는 브라우저가 갈리면 조작법을 설명할 수 없다.
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(index));
        dragHandlers.onDragStart();
      }}
      onDragOver={dragHandlers.onDragOver}
      onDrop={dragHandlers.onDrop}
      onDragEnd={dragHandlers.onDragEnd}
      aria-label={sortable ? `${index + 1}번째 사진` : "등록된 사진"}
      className={`group relative border bg-cream-50 transition-colors ${
        dragging ? "border-forest-600 opacity-40" : "border-ink-200"
      } ${dropTarget ? "border-l-2 border-l-forest-700" : ""}`}
    >
      <div
        className="relative w-full overflow-hidden bg-cream-100"
        style={{ aspectRatio: `${previewAspect}` }}
      >
        <Image
          src={url}
          alt={`상품 사진 ${index + 1}`}
          fill
          sizes="(max-width: 640px) 33vw, 200px"
          className="object-cover"
          draggable={false}
        />

        {/* 고객 화면은 사진을 조금 더 확대해 보여 준다 — 점선 바깥은 잘려 나간다 */}
        {showSafeArea && (
          <div
            aria-hidden
            title="점선 안쪽만 고객 화면에 보입니다"
            className="pointer-events-none absolute inset-[4.6%] border border-dashed border-cream-50/75"
          />
        )}

        {isPrimary && (
          <span className="absolute left-0 top-0 bg-forest-900/85 px-2 py-0.5 text-[10px] font-medium text-cream-50">
            대표
          </span>
        )}

        {sortable && (
          <span
            aria-hidden
            className="absolute bottom-1 left-1 cursor-grab text-cream-50/60 transition-colors group-hover:text-cream-50"
          >
            <GripVertical {...ICON} />
          </span>
        )}

        {/* 삭제는 사진 위 우상단에 둔다 — 순서 화살표와 멀리 떼어 놓아야 오조작이 줄어든다 */}
        <button
          type="button"
          onClick={onRemove}
          aria-label={`${index + 1}번째 사진 지우기`}
          className="absolute right-1 top-1 bg-ink-900/60 p-1 text-cream-50 opacity-0 transition-opacity hover:bg-signal-red focus-visible:opacity-100 group-hover:opacity-100"
        >
          <X {...ICON} />
        </button>
      </div>

      <div className="flex items-center justify-between border-t border-ink-100 px-1 py-1">
        {/* 끌어서 옮기는 게 빠르지만, 키보드만 쓰는 사람에게는 화살표가 유일한 수단이다 */}
        <div className="flex">
          {sortable && (
            <>
              <button
                type="button"
                onClick={() => onMove(-1)}
                disabled={index === 0}
                aria-label="앞으로 옮기기"
                className="p-1 text-ink-400 transition-colors hover:text-forest-700 disabled:opacity-25"
              >
                <ChevronLeft {...ICON} />
              </button>
              <button
                type="button"
                onClick={() => onMove(1)}
                disabled={index === total - 1}
                aria-label="뒤로 옮기기"
                className="p-1 text-ink-400 transition-colors hover:text-forest-700 disabled:opacity-25"
              >
                <ChevronRight {...ICON} />
              </button>
            </>
          )}
        </div>
        <div className="flex">
          {sortable && !isPrimary && (
            <button
              type="button"
              onClick={onMakePrimary}
              title="대표로 지정"
              aria-label={`${index + 1}번째 사진을 대표로 지정`}
              className="p-1 text-ink-400 transition-colors hover:text-forest-700"
            >
              <Star {...ICON} />
            </button>
          )}
          <button
            type="button"
            onClick={onCrop}
            title="자르기"
            aria-label={sortable ? `${index + 1}번째 사진 자르기` : "사진 자르기"}
            className="p-1 text-ink-400 transition-colors hover:text-forest-700"
          >
            <Crop {...ICON} />
          </button>
        </div>
      </div>

      {/* 크기는 이번에 올린 사진만 알 수 있다 — 이미 올라가 있던 사진에까지
          "정보 없음" 같은 줄을 붙이면 타일만 지저분해진다 */}
      {(caption ?? sourceName) && (
        <p
          title={sourceName ?? undefined}
          className="truncate border-t border-ink-100 px-1.5 py-1 text-[10px] leading-tight text-ink-400"
        >
          {caption ?? sourceName}
        </p>
      )}
    </li>
  );
}
