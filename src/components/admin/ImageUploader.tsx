"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";

export interface UploadedImage {
  url: string;
}

export interface ImageUploaderProps {
  value: UploadedImage[];
  onChange: (next: UploadedImage[]) => void;
  /** Supabase storage 버킷 (기본 products) */
  bucket?: string;
  /** 저장 경로 접두어 — 예: 상품 id */
  prefix?: string;
  /** false면 1장만 (기존 이미지 교체) */
  multiple?: boolean;
  className?: string;
}

const MAX_SIZE_MB = 5;

/**
 * 다중 이미지 업로더 — /api/admin/upload로 업로드하고 public URL을 받는다.
 * 첫 번째 이미지가 대표 이미지. 좌/우 버튼으로 순서 변경.
 */
export default function ImageUploader({
  value,
  onChange,
  bucket = "products",
  prefix = "",
  multiple = true,
  className = "",
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function uploadOne(file: File): Promise<UploadedImage> {
    const form = new FormData();
    form.append("file", file);
    form.append("bucket", bucket);
    if (prefix) form.append("prefix", prefix);

    const res = await fetch("/api/admin/upload", { method: "POST", body: form });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? "업로드에 실패했습니다.");
    }
    const data = (await res.json()) as { url: string };
    return { url: data.url };
  }

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setError(null);

    let files = Array.from(list);
    if (!multiple) files = files.slice(0, 1);

    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        setError("이미지 파일만 업로드할 수 있습니다.");
        return;
      }
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        setError(`이미지 용량은 장당 ${MAX_SIZE_MB}MB 이하여야 합니다.`);
        return;
      }
    }

    setUploadingCount(files.length);
    try {
      const uploaded: UploadedImage[] = [];
      for (const file of files) {
        uploaded.push(await uploadOne(file));
      }
      onChange(multiple ? [...value, ...uploaded] : uploaded);
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드에 실패했습니다.");
    } finally {
      setUploadingCount(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  // multiple=false여도 타일은 항상 노출 — 업로드하면 기존 1장을 교체
  const showAddTile = uploadingCount === 0;

  return (
    <div className={className}>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        {value.map((img, i) => (
          <figure
            key={`${img.url}-${i}`}
            className="relative aspect-square overflow-hidden border border-ink-200 bg-cream-100"
          >
            <Image
              src={img.url}
              alt={`업로드 이미지 ${i + 1}`}
              fill
              sizes="(max-width: 640px) 33vw, 200px"
              className="object-cover"
            />
            {multiple && i === 0 && (
              <figcaption className="absolute left-0 top-0 bg-forest-900/85 px-2 py-0.5 text-[10px] font-medium text-cream-50">
                대표
              </figcaption>
            )}
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-ink-900/55 px-1 py-0.5">
              <div className="flex">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label="앞으로 이동"
                  className="p-1 text-cream-50/90 transition-colors hover:text-cream-50 disabled:opacity-30"
                >
                  <ChevronLeft size={14} strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === value.length - 1}
                  aria-label="뒤로 이동"
                  className="p-1 text-cream-50/90 transition-colors hover:text-cream-50 disabled:opacity-30"
                >
                  <ChevronRight size={14} strokeWidth={1.5} />
                </button>
              </div>
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label="이미지 삭제"
                className="p-1 text-cream-50/90 transition-colors hover:text-cream-50"
              >
                <X size={14} strokeWidth={1.5} />
              </button>
            </div>
          </figure>
        ))}

        {Array.from({ length: uploadingCount }).map((_, i) => (
          <div
            key={`uploading-${i}`}
            className="aspect-square animate-pulse border border-ink-200 bg-cream-100"
            aria-label="업로드 중"
          />
        ))}

        {showAddTile && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex aspect-square flex-col items-center justify-center gap-1.5 border border-dashed border-ink-300 text-ink-400 transition-colors hover:border-forest-600 hover:text-forest-700"
          >
            <Plus size={18} strokeWidth={1.5} />
            <span className="text-xs">
              {!multiple && value.length > 0 ? "이미지 교체" : "이미지 추가"}
            </span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {error && <p className="mt-2 text-xs text-signal-red">{error}</p>}
      <p className="mt-2 text-xs text-ink-400">
        JPG · PNG · WebP, 장당 최대 {MAX_SIZE_MB}MB
        {multiple ? " · 첫 번째 이미지가 대표 이미지로 사용됩니다." : ""}
      </p>
    </div>
  );
}
