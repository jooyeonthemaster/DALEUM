"use client";

/* ============================================================
   상품 한 개의 사진 칸 — 대표(상품 사진) 또는 상세페이지

   옛 업로더에 없어서 매번 지웠다 다시 올려야 했던 것들을 넣었다:
   - 순서 바꾸기(브라우저가 넘겨주는 파일 순서는 보장되지 않는다. 상세 조각이
     3-1-5-2 로 올라가면 고객이 보는 상세페이지가 그대로 뒤죽박죽이 된다)
   - 대표 지정(예전에는 무조건 첫 장 고정이라, 대표를 바꾸려면 전부 지워야 했다)
   - 세로로 긴 사진임을 알리는 배지(썸네일이 정사각형이라 육안 구분이 불가능했다)
   ============================================================ */

import { useRef, useState } from "react";
import Image from "next/image";
import { ArrowLeft, ArrowRight, ImagePlus, Star, UploadCloud, X } from "lucide-react";
import { Help } from "@/components/admin/Field";
import { describeAsset } from "@/lib/admin-upload";
import { collectFromDrop } from "./bulk-folder";
import type { ImageLane } from "./bulk-folder";
import { ingestFiles, isTall, progressText, type IngestProgress } from "./bulk-ingest";
import type { DraftImage } from "./bulk-types";

/**
 * 상품 사진의 상한.
 *
 * 서버(api/admin/products/shared.ts parseImages)는 21장째부터 **말없이 버린다** —
 * 오류도 경고도 없이 사라지므로, 21장을 올린 사람은 등록이 끝난 뒤 상품 상세를 열어 보기
 * 전까지 사진이 없어진 줄도 모른다. 그 절단을 없애는 것은 서버 소관(감독 보고)이고,
 * 화면은 애초에 상한을 넘겨 담지 못하게 막고 그 사실을 미리 알린다.
 */
export const MAX_GALLERY_IMAGES = 20;

export interface DraftImageLaneProps {
  lane: ImageLane;
  label: string;
  helper: string;
  value: DraftImage[];
  onChange: (next: DraftImage[]) => void;
  /** 다른 칸으로 옮겨야 할 사진이 나왔을 때 (세로로 긴 사진이 대표 칸에 들어온 경우) */
  onSpill: (images: DraftImage[]) => void;
  uploadPrefix: string;
  disabled?: boolean;
}

export default function DraftImageLane({
  lane,
  label,
  helper,
  value,
  onChange,
  onSpill,
  uploadPrefix,
  disabled = false,
}: DraftImageLaneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<IngestProgress | null>(null);
  const [messages, setMessages] = useState<string[]>([]);

  async function receive(files: File[]) {
    if (disabled || files.length === 0) return;
    setMessages([]);

    // 상한을 넘는 몫은 **올리기 전에** 잘라 낸다. 올린 뒤에 버리면 저장 용량만 쓰고
    // 사람에게는 "올라갔는데 사라진" 것으로 보인다.
    let incoming = files;
    const notices: string[] = [];
    if (lane === "gallery") {
      const room = MAX_GALLERY_IMAGES - value.length;
      if (room <= 0) {
        setMessages([
          `상품 사진은 ${MAX_GALLERY_IMAGES}장까지 들어갑니다. 더 넣으려면 있는 사진을 먼저 지워 주세요.`,
        ]);
        return;
      }
      if (files.length > room) {
        incoming = files.slice(0, room);
        notices.push(
          `상품 사진은 ${MAX_GALLERY_IMAGES}장까지 들어갑니다. 앞의 ${room}장만 담고 나머지 ${
            files.length - room
          }장은 넣지 않았습니다. 상세페이지에 넣을 사진이라면 아래 칸에 올려 주세요.`
        );
      }
    }

    const outcome = await ingestFiles(incoming, lane, uploadPrefix, setProgress);

    const mine = lane === "gallery" ? outcome.gallery : outcome.detail;
    const spilled = lane === "gallery" ? outcome.detail : outcome.gallery;
    if (mine.length > 0) onChange([...value, ...mine]);
    if (spilled.length > 0) onSpill(spilled);
    setMessages([...notices, ...outcome.notes, ...outcome.failures]);
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function makePrimary(index: number) {
    if (index === 0) return;
    const next = [...value];
    const [picked] = next.splice(index, 1);
    onChange([picked, ...next]);
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  const isGallery = lane === "gallery";
  /** 상품 사진 칸이 꽉 찼는가 — 꽉 차면 고르기 자체를 막는다 */
  const full = isGallery && value.length >= MAX_GALLERY_IMAGES;

  return (
    <div>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink-900">
            {label}
            {value.length > 0 && (
              <span className="krw ml-1.5 text-xs font-normal text-ink-400">
                {isGallery ? `${value.length}/${MAX_GALLERY_IMAGES}장` : `${value.length}장`}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-ink-400">{helper}</p>
        </div>
        <button
          type="button"
          disabled={disabled || full}
          onClick={() => inputRef.current?.click()}
          className="inline-flex shrink-0 items-center gap-1.5 border border-ink-200 px-3 py-2 text-xs text-ink-700 transition-colors hover:bg-cream-100 disabled:opacity-50"
        >
          <ImagePlus size={15} strokeWidth={1.5} />
          사진 고르기
        </button>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (disabled || full) return;
          void collectFromDrop(e.dataTransfer).then((picked) =>
            receive(picked.map((item) => item.file))
          );
        }}
        className={`min-h-32 border border-dashed p-3 transition-colors ${
          dragging ? "border-forest-700 bg-forest-50" : "border-ink-300 bg-cream-50"
        }`}
      >
        {progress ? (
          <div className="py-8 text-center">
            <p className="text-sm text-ink-700">{progressText(progress)}</p>
            <p className="krw mt-1 text-xs text-ink-500">
              {progress.fileIndex}번째 / 전체 {progress.fileTotal}장
            </p>
            <p className="mt-1 truncate text-xs text-ink-400">{progress.fileName}</p>
            <div className="mx-auto mt-3 h-1 w-48 bg-ink-100">
              <div
                className="h-full bg-forest-700 transition-all duration-300"
                style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }}
              />
            </div>
          </div>
        ) : value.length === 0 ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="flex min-h-24 w-full flex-col items-center justify-center gap-2 text-ink-400 transition-colors hover:text-forest-700 disabled:opacity-50"
          >
            <UploadCloud size={22} strokeWidth={1.5} />
            <span className="text-sm">사진을 여기에 끌어다 놓으세요</span>
            <span className="text-xs">폴더째 끌어다 놓아도 됩니다 · 크기가 커도 그대로</span>
          </button>
        ) : (
          <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-5">
            {value.map((image, index) => (
              <li key={`${image.url}-${index}`} className="group relative">
                <div className="relative aspect-square overflow-hidden border border-ink-200 bg-cream-100">
                  <Image
                    src={image.url}
                    alt={image.name || label}
                    fill
                    sizes="140px"
                    className={isGallery ? "object-cover" : "object-contain"}
                  />
                  {isGallery && index === 0 && (
                    <span className="absolute left-0 top-0 bg-forest-900/85 px-1.5 py-0.5 text-[10px] text-cream-50">
                      대표
                    </span>
                  )}
                  {isTall(image) && (
                    <span className="absolute bottom-0 left-0 bg-signal-amber/90 px-1.5 py-0.5 text-[10px] text-ink-900">
                      세로로 긴 사진
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => remove(index)}
                    aria-label={`${index + 1}번째 사진 삭제`}
                    className="absolute right-1 top-1 bg-ink-900/60 p-1 text-cream-50 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <X size={13} strokeWidth={1.5} />
                  </button>
                </div>

                <div className="mt-1 flex items-center justify-center gap-0.5">
                  <button
                    type="button"
                    disabled={disabled || index === 0}
                    onClick={() => move(index, -1)}
                    aria-label={`${index + 1}번째 사진을 앞으로`}
                    className="p-1 text-ink-400 transition-colors hover:text-forest-700 disabled:opacity-30"
                  >
                    <ArrowLeft size={13} strokeWidth={1.5} />
                  </button>
                  {isGallery && (
                    <button
                      type="button"
                      disabled={disabled || index === 0}
                      onClick={() => makePrimary(index)}
                      aria-label={`${index + 1}번째 사진을 대표로 지정`}
                      title="대표로 지정"
                      className="p-1 text-ink-400 transition-colors hover:text-forest-700 disabled:opacity-30"
                    >
                      <Star size={13} strokeWidth={1.5} />
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={disabled || index === value.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label={`${index + 1}번째 사진을 뒤로`}
                    className="p-1 text-ink-400 transition-colors hover:text-forest-700 disabled:opacity-30"
                  >
                    <ArrowRight size={13} strokeWidth={1.5} />
                  </button>
                </div>
                <p className="truncate text-center text-[10px] text-ink-400" title={image.name}>
                  {describeAsset(image.width, image.height)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void receive(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />

      {messages.length > 0 && (
        <ul className="mt-2 space-y-1">
          {messages.map((message) => (
            <li key={message} className="text-xs leading-relaxed text-[#8a650e]">
              {message}
            </li>
          ))}
        </ul>
      )}
      {value.length === 0 && isGallery && <Help>상품 목록과 상세 위쪽에 나오는 사진입니다.</Help>}
      {full && <Help>상품 사진 {MAX_GALLERY_IMAGES}장을 모두 채웠습니다. 더 넣으려면 있는 사진을 지워 주세요.</Help>}
    </div>
  );
}
