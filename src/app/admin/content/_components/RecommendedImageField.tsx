"use client";

/* ============================================================
   배너·팝업 이미지 칸 — "어떤 크기로 준비해야 하는지" 를 화면이 말해 준다.

   지금까지 이 자리에는 권장 규격이 한 글자도 없었다. 그런데 실제 렌더는
   홈 대문이 화면 전체를 덮는 가로형(object-cover)이고, 팝업은 4:3 으로
   강제로 잘라 낸다(components/home/PopupDisplay.tsx). 그래서 흔한 세로형
   홍보 이미지를 팝업에 올리면 문구가 통째로 잘려 나가는데, 관리자는 저장
   버튼을 누르기 전까지 그 사실을 알 수 없었다.

   그래서 (1) 권장 크기를 적고 (2) 올린 사진의 실제 픽셀을 읽어 권장 비율과
   크게 어긋나면 경고하고 (3) 고객 화면과 같은 프레임으로 잘린 모습을 함께 보여 준다.
   용량 상한은 두지 않는다 — 원본 그대로 올리면 lib/admin-upload 가 줄여서 보낸다.
   ============================================================ */

import { useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, Crop, Trash2 } from "lucide-react";
import ImageCropper from "@/components/admin/ImageCropper";
import { Help } from "@/components/admin/Field";
import { describeAsset, isImageFile, uploadGalleryImage } from "@/lib/admin-upload";
import { readImageMeta } from "@/lib/image-pipeline";

export interface RecommendedImageFieldProps {
  value: string;
  onChange: (url: string) => void;
  /** 저장 경로 접두어 — banners / popups */
  prefix: string;
  /** 고객 화면이 실제로 쓰는 프레임의 가로/세로 비율 */
  frameRatio: number;
  /** 권장 크기 한 줄 — 예: "가로 2000 × 세로 1125 (16:9 가로형)" */
  recommendText: string;
  /** 이 사진이 고객 화면 어디에 어떻게 깔리는지 */
  frameNote: string;
}

/** 비율이 이만큼 어긋나면 눈에 띄게 잘린다 */
const RATIO_TOLERANCE = 0.3;

interface Measured {
  width: number;
  height: number;
  bytes?: number;
}

/** 브라우저가 던지는 영문 예외를 그대로 보여 주지 않는다 */
function humanReason(e: unknown): string {
  const raw = e instanceof Error ? e.message : "";
  if (/[가-힣]/.test(raw)) return raw;
  return "이 사진을 열지 못했습니다. 다른 사진으로 다시 시도해 주세요.";
}

export default function RecommendedImageField({
  value,
  onChange,
  prefix,
  frameRatio,
  recommendText,
  frameNote,
}: RecommendedImageFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [measured, setMeasured] = useState<Measured | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cropping, setCropping] = useState(false);

  async function ingest(file: File) {
    if (!isImageFile(file)) {
      setError("사진 파일이 아닙니다. 사진을 골라 주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const meta = await readImageMeta(file);
      const asset = await uploadGalleryImage(file, { bucket: "banners", prefix });
      setMeasured({ width: asset.width, height: asset.height, bytes: meta.bytes });
      onChange(asset.url);
    } catch (e) {
      setError(humanReason(e));
    } finally {
      setBusy(false);
    }
  }

  /** 잘라 낸 결과를 다시 올려 그 자리의 사진을 바꾼다 */
  async function applyCrop(result: { blob: Blob; width: number; height: number }) {
    setBusy(true);
    try {
      const file = new File([result.blob], "잘라낸-사진.webp", { type: result.blob.type });
      const asset = await uploadGalleryImage(file, { bucket: "banners", prefix });
      setMeasured({ width: asset.width, height: asset.height });
      onChange(asset.url);
      setError(null);
    } catch (e) {
      setError(humanReason(e));
    } finally {
      setBusy(false);
    }
  }

  const ratio = measured ? measured.width / measured.height : null;
  const off = ratio !== null ? Math.abs(ratio - frameRatio) / frameRatio : 0;
  const cropWarning =
    ratio === null || off <= RATIO_TOLERANCE
      ? null
      : ratio < frameRatio
        ? "권장보다 세로로 긴 사진입니다. 고객 화면에서는 위아래가 잘립니다."
        : "권장보다 가로로 긴 사진입니다. 고객 화면에서는 좌우가 잘립니다.";

  return (
    <div>
      {value ? (
        <div className="flex flex-wrap items-start gap-4">
          <figure className="w-44">
            <span className="relative block aspect-square w-full overflow-hidden border border-ink-200 bg-cream-100">
              <Image
                src={value}
                alt="올린 사진 전체"
                fill
                sizes="176px"
                className="object-contain"
                onLoad={(e) => {
                  // 예전에 올려 둔 사진은 치수를 모른다 — 그려질 때 실제 픽셀을 읽어 둔다
                  const img = e.currentTarget;
                  if (!measured && img.naturalWidth > 0) {
                    setMeasured({ width: img.naturalWidth, height: img.naturalHeight });
                  }
                }}
              />
            </span>
            <figcaption className="mt-1.5 text-[11px] leading-tight text-ink-400">
              올린 사진 전체
              {measured && (
                <span className="krw mt-0.5 block">
                  {describeAsset(measured.width, measured.height, measured.bytes)}
                </span>
              )}
            </figcaption>
          </figure>

          <figure className="w-56">
            <span
              className="relative block w-full overflow-hidden border border-forest-600 bg-cream-100"
              style={{ aspectRatio: `${frameRatio}` }}
            >
              <Image
                src={value}
                alt="고객 화면에서 보이는 부분"
                fill
                sizes="224px"
                className="object-cover"
              />
            </span>
            <figcaption className="mt-1.5 text-[11px] leading-tight text-forest-700">
              고객 화면에서 보이는 부분
            </figcaption>
          </figure>

          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="border border-ink-200 bg-cream-50 px-3 py-1.5 text-xs text-ink-700 transition-colors hover:bg-cream-100 disabled:opacity-50"
            >
              사진 바꾸기
            </button>
            <button
              type="button"
              onClick={() => setCropping(true)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 border border-ink-200 bg-cream-50 px-3 py-1.5 text-xs text-ink-700 transition-colors hover:bg-cream-100 disabled:opacity-50"
            >
              <Crop size={13} strokeWidth={1.5} />
              잘라내기
            </button>
            <button
              type="button"
              onClick={() => {
                onChange("");
                setMeasured(null);
              }}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-signal-red transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              <Trash2 size={13} strokeWidth={1.5} />
              사진 빼기
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          style={{ aspectRatio: `${frameRatio}` }}
          className="flex w-56 flex-col items-center justify-center gap-1.5 border border-dashed border-ink-300 px-3 text-center text-ink-400 transition-colors hover:border-forest-600 hover:text-forest-700 disabled:opacity-50"
        >
          <ImagePlus size={18} strokeWidth={1.5} />
          <span className="text-xs leading-tight">{busy ? "올리는 중입니다…" : "사진 올리기"}</span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void ingest(file);
        }}
      />

      {busy && <Help>사진을 올리고 있습니다. 잠시만 기다려 주세요.</Help>}
      {error && <Help tone="error">{error}</Help>}
      {cropWarning && (
        <Help tone="error">{cropWarning} 잘라내기로 원하는 부분을 직접 정할 수 있습니다.</Help>
      )}
      <Help>
        권장 크기 {recommendText}. {frameNote} 큰 사진도 그대로 올리세요 — 올리면서 알아서 줄입니다.
      </Help>

      <ImageCropper
        open={cropping}
        source={value || null}
        onApply={applyCrop}
        onClose={() => setCropping(false)}
      />
    </div>
  );
}
