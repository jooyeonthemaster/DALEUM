"use client";

/* ============================================================
   상세페이지 블록 한 칸 — 종류에 따라 다른 입력을 보여 준다.
   관리자에게 마크다운을 보이지 않는 것이 이 파일의 존재 이유다.
   ============================================================ */

import Image from "next/image";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2, X } from "lucide-react";
import type { DetailBlock } from "@/lib/detail-doc";
import { BLOCK_LABELS } from "@/lib/detail-doc";
import { describeAsset } from "@/lib/admin-upload";
import { Input, Textarea } from "@/components/admin/Field";

export interface BlockCardProps {
  block: DetailBlock;
  index: number;
  total: number;
  onChange: (next: DetailBlock) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  /** 드래그 정렬 훅 — 카드 손잡이에 붙는다 */
  dragHandlers?: {
    onDragStart: () => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: () => void;
    onDragEnd: () => void;
  };
  dragging?: boolean;
  dropTarget?: boolean;
}

const ICON = { size: 15, strokeWidth: 1.5 } as const;

export default function BlockCard({
  block,
  index,
  total,
  onChange,
  onRemove,
  onMove,
  dragHandlers,
  dragging,
  dropTarget,
}: BlockCardProps) {
  return (
    // 드래그를 시작하는 권한은 손잡이에만 준다. 카드 전체를 draggable 로 두면
    // 브라우저가 문단·소제목 칸 안의 마우스 끌기를 '글자 선택'이 아니라 '요소 끌기'로
    // 가로채, 쓴 문장을 마우스로 긁어 고치는 가장 기본적인 편집이 불가능해진다.
    // 떨어뜨려 받는 쪽(onDragOver/onDrop)은 카드 전체가 맡아야 겨냥하기 쉽다.
    <li
      onDragOver={dragHandlers?.onDragOver}
      onDrop={dragHandlers?.onDrop}
      aria-label={`${index + 1}번째 ${BLOCK_LABELS[block.type]}`}
      className={`group relative border bg-cream-50 transition-colors ${
        dragging ? "border-forest-600 opacity-40" : "border-ink-200"
      } ${dropTarget ? "border-t-2 border-t-forest-700" : ""}`}
    >
      {/* 머리 — 종류 이름과 순서 조작 */}
      <div className="flex items-center justify-between gap-2 border-b border-ink-100 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {dragHandlers && (
            <span
              draggable
              onDragStart={dragHandlers.onDragStart}
              onDragEnd={dragHandlers.onDragEnd}
              aria-hidden
              className="cursor-grab text-ink-300 transition-colors group-hover:text-ink-500"
            >
              <GripVertical {...ICON} />
            </span>
          )}
          <span className="label-caps shrink-0 text-ink-400">{BLOCK_LABELS[block.type]}</span>
          <span className="krw text-xs text-ink-300">{index + 1}</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label="위로 옮기기"
            className="p-1.5 text-ink-400 transition-colors hover:text-forest-700 disabled:opacity-25"
          >
            <ArrowUp {...ICON} />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label="아래로 옮기기"
            className="p-1.5 text-ink-400 transition-colors hover:text-forest-700 disabled:opacity-25"
          >
            <ArrowDown {...ICON} />
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label="이 칸 지우기"
            className="p-1.5 text-ink-400 transition-colors hover:text-signal-red"
          >
            <Trash2 {...ICON} />
          </button>
        </div>
      </div>

      <div className="p-3">
        {block.type === "heading" && (
          <Input
            value={block.text}
            onChange={(e) => onChange({ ...block, text: e.target.value })}
            placeholder="예: 발효가 만든 차이"
            aria-label="소제목 내용"
            className="text-base font-medium"
          />
        )}

        {block.type === "emphasis" && (
          <div>
            <Textarea
              value={block.text}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
              rows={2}
              placeholder="한 줄로 힘주어 말하고 싶은 문장을 쓰세요."
              aria-label="강조 문단 내용"
              className="font-semibold text-ink-900"
            />
            <p className="mt-1.5 text-xs text-ink-400">
              고객 화면에서 이 문단 전체가 굵게 보입니다.
            </p>
          </div>
        )}

        {block.type === "paragraph" && (
          <Textarea
            value={block.text}
            onChange={(e) => onChange({ ...block, text: e.target.value })}
            rows={Math.min(10, Math.max(3, block.text.split("\n").length + 1))}
            placeholder="고객에게 들려줄 이야기를 편하게 쓰세요. 줄을 바꾸면 그대로 줄이 바뀝니다."
            aria-label="문단 내용"
          />
        )}

        {block.type === "list" && (
          <ListEditor
            items={block.items}
            onChange={(items) => onChange({ ...block, items })}
          />
        )}

        {block.type === "image" && (
          <div className="flex items-start gap-3">
            <div className="relative h-24 w-20 shrink-0 overflow-hidden border border-ink-200 bg-cream-100">
              {block.url ? (
                <Image
                  src={block.url}
                  alt=""
                  fill
                  sizes="80px"
                  className="object-cover object-top"
                  unoptimized
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-ink-300">
                  없음
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink-700">상세 이미지</p>
              <p className="mt-1 krw text-xs text-ink-400">
                {block.width > 0 ? describeAsset(block.width, block.height) : "크기 정보 없음"}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-ink-400">
                고객 화면에서는 원래 비율 그대로 화면 폭에 꽉 차게 보입니다.
              </p>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

function ListEditor({
  items,
  onChange,
}: {
  items: string[];
  onChange: (items: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span aria-hidden className="text-ink-300">
            —
          </span>
          <Input
            value={item}
            onChange={(e) => onChange(items.map((v, j) => (j === i ? e.target.value : v)))}
            placeholder="예: 1팩 150g에 170kcal"
            aria-label={`${i + 1}번째 항목`}
          />
          <button
            type="button"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            disabled={items.length <= 1}
            aria-label="이 항목 지우기"
            className="shrink-0 p-1.5 text-ink-400 transition-colors hover:text-signal-red disabled:opacity-25"
          >
            <X {...ICON} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, ""])}
        className="inline-flex items-center gap-1.5 border border-dashed border-ink-300 px-3 py-1.5 text-xs text-ink-500 transition-colors hover:border-forest-600 hover:text-forest-700"
      >
        <Plus {...ICON} />
        항목 추가
      </button>
    </div>
  );
}
