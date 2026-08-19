"use client";

/* ============================================================
   상세페이지 편집기 — 마크다운 대신 "칸"을 쌓는다.

   여기서 해결하는 문제:
   전에는 상세 설명이 텍스트박스 하나였다. 상세 이미지를 넣으려면 관리자가
     ![맛있는 여주발효곤약밥 상세 이미지 1|1080x4000](https://…/1.webp)
   를 손으로 타이핑해야 했고, 그 문자열의 치수 표기를 빠뜨리면 고객 화면에서
   이미지가 로드 후 튀었다. 게다가 수다락에서 받는 상세 원본은 970×17,558px / 11.3MB 라
   업로드 자체가 막혔다.

   이제 관리자는 통이미지를 끌어다 놓기만 한다 — 조각내기·압축·업로드·번호매김·치수 기록이
   전부 자동이다. 저장 형식(description 마크다운)은 그대로라 고객 화면 코드는 손대지 않는다.
   ============================================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bold, Eye, Heading, ImagePlus, List, Pilcrow, UploadCloud } from "lucide-react";
import DescriptionBlock from "@/components/catalog/DescriptionBlock";
import Expandable from "@/components/catalog/Expandable";
import { Help } from "@/components/admin/Field";
import {
  BLOCK_LABELS,
  emptyBlock,
  renumberDetailImages,
  serializeDetailDoc,
  type DetailBlock,
  type DetailBlockType,
} from "@/lib/detail-doc";
import { guessRole, readImageMeta } from "@/lib/image-pipeline";
import { isImageFile, uploadDetailImage, uploadGalleryImage } from "@/lib/admin-upload";
import BlockCard from "./BlockCard";

export interface DetailPageEditorProps {
  blocks: DetailBlock[];
  onChange: (blocks: DetailBlock[]) => void;
  /** 이미지 alt 번호매김에 쓰는 상품명 */
  productName: string;
  /** 업로드 경로 접두어 (상품 id 또는 임시 초안 id) */
  uploadPrefix: string;
  /**
   * 다른 탭에서 넘겨받은 사진.
   *
   * 상품 사진 탭에 세로로 아주 긴 사진(=상세페이지 통이미지)을 떨어뜨리면
   * 업로더가 "상세페이지로 보내기" 를 권한다. 그때 파일이 이리로 넘어온다 —
   * 관리자가 같은 파일을 탭을 옮겨 가며 두 번 고르지 않게 하려는 것이다.
   * `id` 는 같은 파일을 다시 보냈을 때도 새 반입임을 알아보기 위한 일련번호다.
   */
  intake?: { id: number; files: File[] } | null;
  /** 반입 처리가 끝났음을 알린다 — 보낸 쪽이 큐를 비운다 */
  onIntakeDone?: () => void;
}

interface Progress {
  fileName: string;
  done: number;
  total: number;
  stage: "slicing" | "uploading";
}

const ADD_BUTTONS: { type: DetailBlockType; icon: typeof Heading; hint: string }[] = [
  { type: "heading", icon: Heading, hint: "구역을 나누는 제목" },
  { type: "paragraph", icon: Pilcrow, hint: "여러 줄 설명" },
  { type: "emphasis", icon: Bold, hint: "한 문단을 통째로 굵게" },
  { type: "list", icon: List, hint: "짧은 항목 나열" },
];

export default function DetailPageEditor({
  blocks,
  onChange,
  productName,
  uploadPrefix,
  intake,
  onIntakeDone,
}: DetailPageEditorProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [dropping, setDropping] = useState(false);
  const [preview, setPreview] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const imageCount = useMemo(() => blocks.filter((b) => b.type === "image").length, [blocks]);
  const hasText = useMemo(() => blocks.some((b) => b.type !== "image"), [blocks]);
  const previewText = useMemo(() => serializeDetailDoc(blocks), [blocks]);

  const commit = useCallback(
    (next: DetailBlock[]) => onChange(renumberDetailImages(next, productName)),
    [onChange, productName]
  );

  /* 사진 설명(번호)은 상품명에서 만들어지는데, 번호를 다시 매기는 일은 칸이 바뀔 때만 일어났다.
     새 상품 화면은 네 탭이 모두 살아 있어서 상세 탭부터 열어 사진을 먼저 던져 넣는 순서가
     얼마든지 가능하다 — 그러면 설명이 '상품 상세 이미지 1' 로 굳고, 나중에 기본 정보 탭에서
     상품명을 채워도 되돌아오지 않아 상품명 없는 설명이 그대로 저장됐다.
     그래서 이름이 채워지는 순간에도 다시 매긴다. 실제로 달라졌을 때만 올려 렌더가 겉돌지 않게 한다. */
  useEffect(() => {
    const next = renumberDetailImages(blocks, productName);
    const changed = blocks.some((b, i) => {
      if (b.type !== "image") return false;
      const after = next[i];
      return after.type === "image" && after.alt !== b.alt;
    });
    if (changed) onChange(next);
  }, [blocks, productName, onChange]);

  /** 사진 여러 장을 받아 종류에 맞게 처리한다 — 세로로 긴 것은 조각내고, 아니면 그대로 한 칸 */
  const ingest = useCallback(
    async (files: File[]) => {
      const images = files.filter(isImageFile);
      const rejected = files.filter((f) => !isImageFile(f));
      const failures: string[] = rejected.map(
        (f) => `'${f.name}' 은 사진 파일이 아니라 건너뛰었습니다.`
      );

      const added: DetailBlock[] = [];
      for (const file of images) {
        try {
          const meta = await readImageMeta(file);
          if (guessRole(meta) === "detail") {
            setProgress({ fileName: file.name, done: 0, total: 1, stage: "slicing" });
            const { slices } = await uploadDetailImage(file, {
              prefix: uploadPrefix,
              onProgress: (done, total, stage) =>
                setProgress({ fileName: file.name, done, total, stage }),
            });
            for (const s of slices) {
              added.push({
                id: `${s.url}-${added.length}`,
                type: "image",
                url: s.url,
                alt: "",
                width: s.width,
                height: s.height,
              });
            }
          } else {
            setProgress({ fileName: file.name, done: 0, total: 1, stage: "uploading" });
            const asset = await uploadGalleryImage(file, { prefix: uploadPrefix });
            added.push({
              id: asset.url,
              type: "image",
              url: asset.url,
              alt: "",
              width: asset.width,
              height: asset.height,
            });
          }
        } catch (e) {
          failures.push(
            `'${file.name}' 을 올리지 못했습니다 — ${
              e instanceof Error ? e.message : "알 수 없는 이유"
            }`
          );
        }
      }

      setProgress(null);
      setErrors(failures);
      if (added.length > 0) commit([...blocks, ...added]);
    },
    [blocks, commit, uploadPrefix]
  );

  /* 상품 사진 탭에서 "상세페이지로 보내기" 로 넘어온 파일을 받아 처리한다.
     같은 파일을 두 번 보낼 수도 있으므로 파일 목록이 아니라 일련번호로 새 반입인지 가린다. */
  const handledIntake = useRef<number | null>(null);
  useEffect(() => {
    if (!intake || handledIntake.current === intake.id) return;
    handledIntake.current = intake.id;
    void ingest(intake.files).finally(() => onIntakeDone?.());
  }, [intake, ingest, onIntakeDone]);

  function addBlock(type: DetailBlockType) {
    commit([...blocks, emptyBlock(type)]);
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

  return (
    <div>
      {/* 안내 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <p className="text-sm leading-relaxed text-ink-600">
            상세페이지는 <strong className="font-medium text-ink-900">칸을 쌓아</strong> 만듭니다.
            사진을 끌어다 놓으면 순서대로 들어갑니다.
          </p>
          <Help>
            길쭉한 상세페이지 이미지는 올릴 때 알아서 나눠 담습니다. 크기가 커도 그대로 올리세요.
            다만 고객 화면에서는 글과 사진이 <strong className="font-medium">서로 다른 자리</strong>에
            나뉘어 실립니다 — 「고객 화면으로 보기」로 확인해 주세요.
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

      {preview ? (
        /* 고객 화면은 글과 사진을 같은 자리에 나란히 싣지 않는다 — 글만 모아 가격 위
           구매 영역에 7줄로 접고, 사진은 전부 페이지 아래 「상품 상세」에 편다.
           미리보기가 이 둘을 섞어 한 덩어리로 보여 주면 미리보기 자체가 거짓말이 된다.
           그래서 고객 화면과 같은 컴포넌트를, 같은 옵션으로, 자리를 나눠 부른다. */
        <div aria-label="고객 화면 미리보기" className="mt-5 space-y-3">
          <section className="border border-ink-200 bg-cream-50 p-5">
            <p className="label-caps text-ink-400">가격 위 구매 영역</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-400">
              여기에는 글만 실립니다. 앞 7줄까지만 보이고 나머지는 「자세히 보기」로 접힙니다.
            </p>
            {hasText ? (
              <Expandable lines={7} className="mt-4 max-w-sm">
                <DescriptionBlock text={previewText} only="text" />
              </Expandable>
            ) : (
              <p className="py-8 text-center text-sm text-ink-400">
                여기 실릴 글이 아직 없습니다.
              </p>
            )}
          </section>

          <section className="border border-ink-200 bg-cream-50 p-5">
            <p className="label-caps text-ink-400">페이지 아래 「상품 상세」</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-400">
              여기에는 사진만 실립니다. 글과 사진을 번갈아 넣어도 사진끼리 모여 이어집니다.
            </p>
            {imageCount > 0 ? (
              <div className="mt-4">
                <DescriptionBlock text={previewText} only="images" />
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-ink-400">
                여기 실릴 사진이 아직 없습니다.
              </p>
            )}
          </section>
        </div>
      ) : (
        <>
          {/* 사진 받는 곳 */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDropping(true);
            }}
            onDragLeave={() => setDropping(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDropping(false);
              void ingest(Array.from(e.dataTransfer.files));
            }}
            className={`mt-5 border border-dashed p-5 text-center transition-colors ${
              dropping ? "border-forest-700 bg-forest-50" : "border-ink-300 bg-cream-50"
            }`}
          >
            {progress ? (
              <div>
                <p className="text-sm text-ink-700">
                  {progress.stage === "slicing" ? "사진을 나누는 중" : "사진을 저장하는 중"} —{" "}
                  <span className="krw">
                    {progress.done}/{progress.total}
                  </span>
                </p>
                <p className="mt-1 truncate text-xs text-ink-400">{progress.fileName}</p>
                <div className="mx-auto mt-3 h-1 w-56 bg-ink-100">
                  <div
                    className="h-full bg-forest-700 transition-all duration-300"
                    style={{
                      width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex w-full flex-col items-center gap-2 text-ink-400 transition-colors hover:text-forest-700"
              >
                <UploadCloud size={26} strokeWidth={1.5} />
                <span className="text-sm">상세페이지 사진을 여기에 끌어다 놓으세요</span>
                <span className="text-xs">또는 눌러서 고르기 · 여러 장 한 번에 가능</span>
              </button>
            )}
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              void ingest(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />

          {errors.length > 0 && (
            <ul className="mt-3 space-y-1">
              {errors.map((msg, i) => (
                <li key={i} className="text-xs leading-relaxed text-signal-red">
                  {msg}
                </li>
              ))}
            </ul>
          )}

          {/* 칸 목록 */}
          {blocks.length === 0 ? (
            <div className="mt-5 border border-dashed border-ink-200 py-14 text-center">
              <p className="headline-serif text-ink-500">상세페이지가 비어 있습니다.</p>
              <p className="mt-1.5 text-xs text-ink-400">
                사진을 끌어다 놓거나, 아래에서 칸을 추가해 시작하세요.
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

          {/* 칸 추가 */}
          <div className="mt-4 flex flex-wrap gap-2">
            {ADD_BUTTONS.map(({ type, icon: Icon, hint }) => (
              <button
                key={type}
                type="button"
                onClick={() => addBlock(type)}
                title={hint}
                className="inline-flex items-center gap-1.5 border border-dashed border-ink-300 px-3.5 py-2 text-sm text-ink-600 transition-colors hover:border-forest-600 hover:text-forest-700"
              >
                <Icon size={15} strokeWidth={1.5} />
                {BLOCK_LABELS[type]} 추가
              </button>
            ))}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 border border-dashed border-ink-300 px-3.5 py-2 text-sm text-ink-600 transition-colors hover:border-forest-600 hover:text-forest-700"
            >
              <ImagePlus size={15} strokeWidth={1.5} />
              이미지 추가
            </button>
          </div>

          <p className="mt-4 text-xs text-ink-400">
            칸 <span className="krw">{blocks.length}</span>개 · 이미지{" "}
            <span className="krw">{imageCount}</span>장
          </p>
        </>
      )}
    </div>
  );
}
