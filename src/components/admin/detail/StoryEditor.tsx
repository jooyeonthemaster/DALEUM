"use client";

/* ============================================================
   브랜드 스토리 편집기 — 상세페이지와 같은 '칸 쌓기' 방식.

   왜 텍스트박스를 걷어냈나:
   브랜드 스토리도 저장은 마크다운 원문이다. 그런데 고객 화면(StoryBlock)이
   실제로 알아듣는 것은 소제목·항목 나열·문단 세 가지뿐이다.
   굵게(별표 두 개)는 고객 화면이 지원한다 — 화면에 별표를 보이지 않으려고 「강조 문단」 칸으로 제공한다.
   그러니 텍스트박스를 두면 두 가지 중 하나가 반드시 일어난다 —
   서식 안내를 안 하면 아무도 소제목을 못 만들고,
   서식 안내를 하면 화면에 마크다운 기호가 노출된다(이 프로젝트의 금지 사항).

   그래서 관리자에게는 칸만 보여 주고, 저장할 때 원문으로 바꾼다.
   읽어 들이는 쪽은 고객 화면의 parseStory 를 그대로 쓴다 —
   편집기가 보는 구조와 고객이 보는 구조가 어긋날 수 없게 하기 위해서다.
   ============================================================ */

import { useState } from "react";
import { Eye, Heading, List, Pilcrow } from "lucide-react";
import StoryBlock, { parseStory } from "@/components/catalog/StoryBlock";
import { Help } from "@/components/admin/Field";
import {
  BLOCK_LABELS,
  emptyBlock,
  serializeDetailDoc,
  type DetailBlock,
  type DetailBlockType,
} from "@/lib/detail-doc";
import BlockCard from "./BlockCard";

export interface StoryEditorProps {
  /** 저장된 브랜드 스토리 원문 */
  story: string;
  onChange: (story: string) => void;
}

/** 스토리에는 사진이 들어가지 않는다 — 고객 화면 StoryBlock 이 사진을 렌더하지 않기 때문 */
const ADD_BUTTONS: { type: DetailBlockType; icon: typeof Heading; hint: string }[] = [
  { type: "heading", icon: Heading, hint: "이야기를 나누는 작은 제목" },
  { type: "paragraph", icon: Pilcrow, hint: "여러 줄 이야기" },
  { type: "list", icon: List, hint: "짧은 항목 나열" },
];

/**
 * 원문 → 칸 목록. 고객 화면과 같은 파서를 쓴다.
 * id 를 위치로 정하는 이유: 렌더 도중에도 불릴 수 있어 난수를 쓰면 안 되기 때문이다.
 */
function storyToBlocks(story: string): DetailBlock[] {
  return parseStory(story).map((node, i): DetailBlock => {
    if (node.type === "heading") return { id: `s${i}`, type: "heading", text: node.text };
    if (node.type === "list") return { id: `s${i}`, type: "list", items: node.items };
    return { id: `s${i}`, type: "paragraph", text: node.lines.join("\n") };
  });
}

export default function StoryEditor({ story, onChange }: StoryEditorProps) {
  // 밖에서 스토리가 통째로 바뀌었을 때만 다시 읽는다(상품을 열 때 populate 가 그렇다).
  // effect 가 아니라 렌더 중 비교로 처리한다 — 이 저장소 규칙이자, 첫 프레임이 비어 보이지 않는다.
  const [syncedText, setSyncedText] = useState(story);
  const [blocks, setBlocks] = useState<DetailBlock[]>(() => storyToBlocks(story));
  const [preview, setPreview] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  if (story !== syncedText) {
    setSyncedText(story);
    setBlocks(storyToBlocks(story));
  }

  /** 칸이 바뀔 때마다 원문으로 되돌려 부모에 올린다 */
  function commit(next: DetailBlock[]) {
    setBlocks(next);
    const text = serializeDetailDoc(next);
    setSyncedText(text);
    onChange(text);
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  }

  function reorder(from: number, to: number) {
    if (from === to) return;
    const next = [...blocks];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    commit(next);
  }

  const text = serializeDetailDoc(blocks);
  // 짝이 맞지 않는 별표는 고객 화면에 글자 그대로 나간다 — 그때만 알려 준다.
  const hasStrayAsterisk = /\*\*/.test(text);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <p className="text-sm leading-relaxed text-ink-600">
            브랜드 스토리도 <strong className="font-medium text-ink-900">칸을 쌓아</strong>{" "}
            만듭니다. 제품 설명보다 브랜드·개발 배경 이야기를 3~5문장으로 써 주세요.
          </p>
          <Help>
            쓸 수 있는 칸은 소제목 · 문단 · 강조 문단 · 항목 나열 네 가지입니다. 한 문단을 통째로
            굵게 하려면 「강조 문단」을 쓰세요. 글자 크기나 색은 브랜드 화면이 정해 둔 대로 나갑니다.
          </Help>
        </div>
        <button
          type="button"
          onClick={() => setPreview((v) => !v)}
          aria-pressed={preview}
          className={`inline-flex shrink-0 items-center gap-1.5 border px-3 py-2 text-xs transition-colors ${
            preview
              ? "border-forest-700 bg-forest-700 text-cream-50"
              : "border-ink-200 text-ink-700 hover:bg-cream-100"
          }`}
        >
          <Eye size={15} strokeWidth={1.5} />
          고객 화면으로 보기
        </button>
      </div>

      {hasStrayAsterisk && (
        <p className="mt-3 text-xs leading-relaxed text-ink-400">
          글 안에 별표(*)가 있습니다. 별표 두 개로 감싼 부분은 고객 화면에서 굵게 보입니다 —
          의도한 것이 아니라면 지워 주세요.
        </p>
      )}

      {preview ? (
        <section
          aria-label="고객 화면 미리보기"
          className="mt-5 border border-ink-200 bg-cream-50 p-5"
        >
          <p className="label-caps text-center text-forest-600">Story</p>
          <p className="headline-serif mt-2 text-center text-xl text-ink-900">
            다름이 빚은 이야기
          </p>
          {text.trim() ? (
            <StoryBlock story={text} className="mt-8" />
          ) : (
            <p className="py-10 text-center text-sm text-ink-400">
              비워 두면 상품 페이지에서 이 구역이 통째로 사라집니다.
            </p>
          )}
        </section>
      ) : (
        <>
          {blocks.length === 0 ? (
            <div className="mt-5 border border-dashed border-ink-200 py-10 text-center">
              <p className="headline-serif text-ink-500">브랜드 스토리가 비어 있습니다.</p>
              <p className="mt-1.5 text-xs text-ink-400">
                비워 두면 상품 페이지 가운데의 「다름이 빚은 이야기」 구역이 통째로 사라집니다.
              </p>
            </div>
          ) : (
            <ul className="mt-5 space-y-2">
              {blocks.map((block, i) => (
                <BlockCard
                  key={block.id}
                  block={block}
                  index={i}
                  total={blocks.length}
                  onChange={(next) => commit(blocks.map((b, j) => (j === i ? next : b)))}
                  onRemove={() => commit(blocks.filter((_, j) => j !== i))}
                  onMove={(dir) => move(i, dir)}
                  dragging={dragIndex === i}
                  dropTarget={overIndex === i && dragIndex !== null && dragIndex !== i}
                  dragHandlers={{
                    onDragStart: () => setDragIndex(i),
                    onDragOver: (e) => {
                      e.preventDefault();
                      setOverIndex(i);
                    },
                    onDrop: () => {
                      if (dragIndex !== null) reorder(dragIndex, i);
                      setDragIndex(null);
                      setOverIndex(null);
                    },
                    onDragEnd: () => {
                      setDragIndex(null);
                      setOverIndex(null);
                    },
                  }}
                />
              ))}
            </ul>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {ADD_BUTTONS.map(({ type, icon: Icon, hint }) => (
              <button
                key={type}
                type="button"
                onClick={() => commit([...blocks, emptyBlock(type)])}
                title={hint}
                className="inline-flex items-center gap-1.5 border border-dashed border-ink-300 px-3.5 py-2 text-sm text-ink-600 transition-colors hover:border-forest-600 hover:text-forest-700"
              >
                <Icon size={15} strokeWidth={1.5} />
                {BLOCK_LABELS[type]} 추가
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
