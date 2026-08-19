"use client";

/* ============================================================
   영양·스펙 표의 한 줄.

   한 줄에 들어가는 것: 끌어서 옮기는 손잡이 · 항목 이름 · 값 · 순서/삭제 버튼.
   값 칸은 자동으로 높이가 늘어난다(원재료명 386자가 실제로 들어온다).

   드래그 가능 표시는 **손잡이에만** 건다. 칸 전체를 드래그 가능하게 하면
   문단 안에서 글자를 마우스로 긁어 고칠 수 없다 — 브라우저가 그 동작을
   '요소 끌기'로 가로채기 때문이다. 편집기에서 가장 기본적인 조작을 막는 셈이라
   손잡이에만 건다.
   ============================================================ */

import { ArrowDown, ArrowUp, GripVertical, X } from "lucide-react";
import { Input } from "@/components/admin/Field";
import AutoGrowTextarea from "./AutoGrowTextarea";
import { KV_KEY_MAX, KV_VALUE_MAX, KV_VALUE_WARN } from "./kv-presets";
import type { KvRow } from "@/app/admin/products/form-types";

export interface KvRowItemProps {
  row: KvRow;
  index: number;
  total: number;
  onChange: (patch: Partial<KvRow>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  /** 같은 항목 이름이 두 번 이상 쓰였다 — 저장하면 한 줄이 사라진다 */
  duplicate: boolean;
  /** 항목을 찾는 중에는 순서 조작을 감춘다(보이는 줄만 뒤섞이면 더 헷갈린다) */
  reorderable: boolean;
  dragging?: boolean;
  dropTarget?: boolean;
  dragHandlers?: {
    onDragStart: () => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: () => void;
    onDragEnd: () => void;
  };
  keyPlaceholder: string;
  valuePlaceholder: string;
}

const ICON = { size: 15, strokeWidth: 1.5 } as const;

export default function KvRowItem({
  row,
  index,
  total,
  onChange,
  onRemove,
  onMove,
  duplicate,
  reorderable,
  dragging,
  dropTarget,
  dragHandlers,
  keyPlaceholder,
  valuePlaceholder,
}: KvRowItemProps) {
  const length = row.value.length;
  const tooLong = length > KV_VALUE_MAX;
  const showCount = length >= KV_VALUE_WARN;

  return (
    <li
      onDragOver={dragHandlers?.onDragOver}
      onDrop={dragHandlers?.onDrop}
      // 저장 바(화면 하단 고정)가 지금 입력 중인 줄을 덮지 않도록 여유를 준다
      className={`scroll-mb-28 border-t-2 py-1 transition-colors ${
        dropTarget ? "border-t-forest-700" : "border-t-transparent"
      } ${dragging ? "opacity-40" : ""}`}
    >
      <div className="flex flex-wrap items-start gap-2">
        {reorderable && dragHandlers && (
          <span
            draggable
            onDragStart={dragHandlers.onDragStart}
            onDragEnd={dragHandlers.onDragEnd}
            aria-hidden
            className="mt-2.5 cursor-grab text-ink-300 transition-colors hover:text-ink-600"
          >
            <GripVertical {...ICON} />
          </span>
        )}

        <div className="w-full md:w-44 md:shrink-0">
          <Input
            value={row.key}
            maxLength={KV_KEY_MAX}
            onChange={(e) => onChange({ key: e.target.value })}
            placeholder={keyPlaceholder}
            aria-label={`${index + 1}번째 항목 이름`}
            className={duplicate ? "border-signal-red" : ""}
          />
          {duplicate && (
            <p className="mt-1 text-xs leading-relaxed text-signal-red">
              같은 이름이 이미 있습니다. 이대로 저장하면 한 줄만 남습니다.
            </p>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <AutoGrowTextarea
            value={row.value}
            invalid={tooLong}
            onChange={(e) => onChange({ value: e.target.value })}
            placeholder={valuePlaceholder}
            aria-label={`${index + 1}번째 항목 값`}
          />
          {(showCount || tooLong) && (
            <p
              className={`mt-1 text-xs leading-relaxed ${
                tooLong ? "text-signal-red" : "text-ink-400"
              }`}
            >
              <span className="krw">
                {length.toLocaleString("ko-KR")} / {KV_VALUE_MAX.toLocaleString("ko-KR")}
              </span>
              자
              {tooLong && " — 이대로는 저장이 거절됩니다. 길이를 줄여 주세요."}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {reorderable && (
            <>
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
            </>
          )}
          <button
            type="button"
            onClick={onRemove}
            aria-label="이 줄 지우기"
            className="p-1.5 text-ink-400 transition-colors hover:text-signal-red"
          >
            <X {...ICON} />
          </button>
        </div>
      </div>
    </li>
  );
}
