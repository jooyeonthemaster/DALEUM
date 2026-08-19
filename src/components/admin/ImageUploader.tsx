"use client";

/* ============================================================
   상품 사진 업로더 — "원본을 그대로 올리면 알아서 되게" 한다.

   예전 업로더는 장당 5MB 를 넘으면 거절했다. 그런데 제조사에서 받는 실제 상품컷은
   10~30MB 다(수다락 납품 원본에 26MB·30MB 짜리가 섞여 있다). 즉 회사가 가진 사진 중
   상당수는 이 화면으로 단 한 장도 올릴 수 없었고, 결국 스크립트로 처리해 왔다.
   이제는 거절하지 않고 브라우저에서 긴 변 2,000px·WebP 로 줄여서 올린다(lib/admin-upload).

   또 하나 고친 것: 예전에는 6장 중 1장만 걸려도 6장 전부가 취소됐고,
   어느 파일이 걸렸는지도 알려 주지 않았다. 이제 성공한 장은 그대로 올라가고
   실패한 장만 파일명·이유와 함께 남는다.

   세로로 아주 긴 사진(세로비 2.5 초과)은 막지 않고 경고한다 —
   과거에 상세페이지 통이미지가 갤러리 두 번째 칸에 들어가 목록 썸네일이
   세로 2만 px 이 된 사고가 있었다(scripts/fix_tall_gallery_images.mjs).
   ============================================================ */

import { useCallback, useRef, useState } from "react";
import { ImagePlus, Undo2 } from "lucide-react";
import ImageCropper from "@/components/admin/ImageCropper";
import GalleryTile from "@/components/admin/uploader/GalleryTile";
import TallImageNotice from "@/components/admin/uploader/TallImageNotice";
import UploadStatus from "@/components/admin/uploader/UploadStatus";
import { useGalleryUpload } from "@/components/admin/uploader/useGalleryUpload";
import { describeAsset, type UploadBucket, type UploadedAsset } from "@/lib/admin-upload";

/**
 * 목록 한 칸.
 *
 * alt(사진 설명)를 여기 함께 들고 다니는 이유: 이 업로더는 넘겨받은 항목을 그대로 되돌려 주는
 * 계약인데, 타입이 `{url}` 뿐이면 그 계약이 타입 검사에 잡히지 않는다. 실제로 자르기 경로가
 * 항목을 통째로 새로 만들어 alt 를 떨어뜨렸고(아래 applyCrop), 호출부는 `as` 캐스팅으로
 * 그 사실을 덮고 있었다. 서버는 alt 가 없으면 상품명으로 채우므로, 사람이 적어 둔 설명이
 * 자르기 한 번에 조용히 상품명으로 바뀌었다 — 화면에 설명을 다시 넣을 칸조차 없어 복구도 불가능했다.
 */
export interface UploadedImage {
  url: string;
  alt?: string | null;
}

export interface ImageUploaderProps {
  value: UploadedImage[];
  onChange: (next: UploadedImage[]) => void;
  /** Supabase storage 버킷 (기본 products) */
  bucket?: UploadBucket;
  /** 저장 경로 접두어 — 예: 상품 id */
  prefix?: string;
  /** false면 1장만 (기존 이미지 교체) */
  multiple?: boolean;
  className?: string;
  /**
   * 등록 가능한 최대 장수. 서버(api/admin/products/shared.ts parseImages)가
   * 21번째부터 조용히 버리기 때문에 화면에서 먼저 막아야 한다 —
   * 25장을 올리고 저장하면 5장이 아무 말 없이 사라지던 자리다.
   */
  maxCount?: number;
  /**
   * 미리보기 타일의 가로/세로 비율. 고객 화면과 다른 비율로 보여 주면
   * 관리자가 확인한 그림과 실제로 나가는 그림이 어긋난다(고객 갤러리는 4:5 다).
   */
  previewAspect?: number;
  /**
   * 세로로 긴 사진을 상세페이지 쪽으로 넘길 통로. 넘겨 주면 경고창에
   * "상세페이지 탭으로 보내기" 버튼이 생긴다. 없으면 안내 문구만 보여 준다.
   */
  onSendToDetail?: (files: File[]) => void;
}

const DEFAULT_MAX_COUNT = 20;

export default function ImageUploader({
  value,
  onChange,
  bucket = "products",
  prefix = "",
  multiple = true,
  className = "",
  maxCount = DEFAULT_MAX_COUNT,
  previewAspect = 1,
  onSendToDetail,
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropping, setDropping] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [cropIndex, setCropIndex] = useState<number | null>(null);
  const [undone, setUndone] = useState<{ index: number; item: UploadedImage } | null>(null);

  const limit = multiple ? maxCount : 1;
  const atLimit = multiple && value.length >= limit;

  /** 올라온 사진을 목록에 반영 — 한 장짜리 자리에서는 덧붙이지 않고 갈아 끼운다 */
  const acceptUploaded = useCallback(
    (assets: UploadedAsset[]) => {
      const added = assets.map((asset) => ({ url: asset.url }));
      onChange(multiple ? [...value, ...added] : added);
    },
    [multiple, value, onChange]
  );

  const {
    info,
    progress,
    failures,
    notes,
    tall,
    ingest,
    replaceOne,
    dismissTall,
    uploadTallAnyway,
  } = useGalleryUpload({
    bucket,
    prefix,
    multiple,
    limit,
    count: value.length,
    onUploaded: acceptUploaded,
  });

  function pick(list: FileList | null) {
    // 새 사진을 올리는 순간 "방금 지운 것" 은 더 이상 방금이 아니다 —
    // 되돌리기 링크를 남겨 두면 한참 전에 지운 사진이 목록 중간에 끼어든다
    setUndone(null);
    void ingest(Array.from(list ?? []));
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function reorder(from: number, to: number) {
    if (from === to) return;
    const next = [...value];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  }

  /** 맨 뒤 사진을 대표로 올리려고 화살표를 여섯 번 누르지 않아도 되게 */
  function makePrimary(index: number) {
    reorder(index, 0);
  }

  /** 지우기는 되돌릴 수 있어야 한다 — 원본은 이름 없는 파일로만 남아 되찾기 어렵다 */
  function remove(index: number) {
    setUndone({ index, item: value[index] });
    onChange(value.filter((_, i) => i !== index));
  }

  function restore() {
    if (!undone) return;
    const next = [...value];
    next.splice(Math.min(undone.index, next.length), 0, undone.item);
    onChange(next);
    setUndone(null);
  }

  /** 잘라 낸 결과를 다시 올려 그 자리의 사진을 바꾼다 */
  async function applyCrop(result: { blob: Blob; width: number; height: number }) {
    const index = cropIndex;
    if (index == null) return;
    const before = value[index];
    const file = new File([result.blob], "잘라낸-사진.webp", { type: result.blob.type });
    const asset = await replaceOne(file, before.url);
    if (!asset) return;
    const next = [...value];
    // 잘라 내도 '무엇을 찍은 사진인가' 는 그대로다 — 주소만 갈아 끼우고 나머지(사진 설명)는 물려받는다.
    // 항목을 통째로 새로 만들면 alt 가 사라지고, 저장 시 서버가 상품명으로 덮어써 되돌릴 수 없었다.
    next[index] = { ...before, url: asset.url };
    onChange(next);
  }

  return (
    <div className={className}>
      {multiple && (
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-ink-500">
            사진 <span className="krw">{value.length}</span> / <span className="krw">{limit}</span>
            장{atLimit && " · 더 넣으려면 먼저 몇 장을 지워 주세요"}
          </p>
          {undone && (
            <button
              type="button"
              onClick={restore}
              className="inline-flex items-center gap-1 text-xs text-forest-700 underline-offset-2 hover:underline"
            >
              <Undo2 size={13} strokeWidth={1.5} />
              방금 지운 사진 되돌리기
            </button>
          )}
        </div>
      )}

      <div
        onDragOver={(e) => {
          // 타일을 끌어 순서를 바꾸는 중에는 파일 드롭존이 켜지면 안 된다
          if (dragIndex !== null) return;
          e.preventDefault();
          setDropping(true);
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(e) => {
          if (dragIndex !== null) return;
          e.preventDefault();
          setDropping(false);
          pick(e.dataTransfer.files);
        }}
        className={`border border-dashed p-2.5 transition-colors ${
          dropping ? "border-forest-700 bg-forest-50" : "border-transparent"
        }`}
      >
        {/* 화면 폭이 아니라 이 업로더가 놓인 칸의 폭에 맞춰 접는다 —
            같은 컴포넌트가 넓은 이미지 탭에도, 좁은 설정 모달 안에도 들어간다.
            화면 기준 5칸으로 고정하면 모달 안에서 타일이 46px 로 찌부러졌다. */}
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(7.25rem,1fr))] gap-3">
          {value.map((img, i) => (
            <GalleryTile
              key={`${img.url}-${i}`}
              url={img.url}
              index={i}
              total={value.length}
              isPrimary={multiple && i === 0}
              caption={
                info[img.url] ? describeAsset(info[img.url].width, info[img.url].height) : null
              }
              sourceName={info[img.url]?.name ?? null}
              previewAspect={previewAspect}
              showSafeArea={previewAspect !== 1}
              sortable={multiple}
              onMove={(dir) => move(i, dir)}
              onRemove={() => remove(i)}
              onCrop={() => setCropIndex(i)}
              onMakePrimary={() => makePrimary(i)}
              dragging={dragIndex === i}
              dropTarget={overIndex === i && dragIndex !== null && dragIndex !== i}
              dragHandlers={{
                onDragStart: () => setDragIndex(i),
                onDragOver: (e) => {
                  if (dragIndex === null) return;
                  e.preventDefault();
                  setOverIndex(i);
                },
                onDrop: (e) => {
                  if (dragIndex === null) return;
                  e.preventDefault();
                  e.stopPropagation();
                  reorder(dragIndex, i);
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

          {!progress && (
            <li>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={atLimit}
                title={atLimit ? `${limit}장을 다 채웠습니다` : undefined}
                style={{ aspectRatio: `${previewAspect}` }}
                className="flex w-full flex-col items-center justify-center gap-1.5 border border-dashed border-ink-300 px-2 text-center text-ink-400 transition-colors hover:border-forest-600 hover:text-forest-700 disabled:cursor-not-allowed disabled:border-ink-200 disabled:text-ink-300"
              >
                <ImagePlus size={18} strokeWidth={1.5} />
                <span className="text-xs leading-tight">
                  {atLimit
                    ? `${limit}장이 가득 찼습니다`
                    : !multiple && value.length > 0
                      ? "사진 바꾸기"
                      : "사진 추가"}
                </span>
                {!atLimit && (
                  <span className="text-[10px] leading-tight text-ink-300">
                    끌어다 놓아도 됩니다
                  </span>
                )}
              </button>
            </li>
          )}
        </ul>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />

      {tall.length > 0 && (
        <TallImageNotice
          labels={tall.map((t) => t.label)}
          onSendToDetail={
            onSendToDetail
              ? () => {
                  onSendToDetail(tall.map((t) => t.file));
                  dismissTall();
                }
              : undefined
          }
          onUploadAnyway={uploadTallAnyway}
          onDismiss={dismissTall}
        />
      )}

      <UploadStatus progress={progress} notes={notes} failures={failures} />

      <p className="mt-2.5 text-xs leading-relaxed text-ink-400">
        큰 사진도 그대로 올리세요 — 올리면서 알아서 줄입니다.
        {multiple
          ? " 끌어서 순서를 바꿀 수 있고, 첫 번째 사진이 대표로 쓰입니다."
          : " 새로 올리면 기존 사진을 바꿉니다."}
      </p>

      <ImageCropper
        open={cropIndex !== null}
        source={cropIndex !== null ? (value[cropIndex]?.url ?? null) : null}
        onApply={applyCrop}
        onClose={() => setCropIndex(null)}
      />
    </div>
  );
}
