/* ============================================================
   관리자 이미지 업로드 — 전처리 + 전송을 한 곳에 모은다 (클라이언트 전용)

   지금까지 업로더가 두 벌 있었다(components/admin/ImageUploader 와
   products/bulk 의 DriveImageUploader). 둘은 상한도, 오류 문구도, 진행 표시도 달랐다.
   전처리(압축/분할)가 들어오면 그 차이가 곧 버그가 되므로 여기로 합친다.

   전처리를 반드시 거치는 이유는 lib/image-pipeline.ts 머리말 참고 —
   원본은 10~30MB 라 서버가 받아 줄 수 없다.
   ============================================================ */

import {
  compressGalleryImage,
  humanBytes,
  readImageMeta,
  sliceTallImage,
  type DetailSlice,
  type ImageMeta,
} from "./image-pipeline";

export type UploadBucket = "products" | "banners" | "reviews";

export interface UploadedAsset {
  url: string;
  width: number;
  height: number;
  /** 사용자가 고른 원본 파일명 — 나중에 "무슨 사진이었지" 를 알 수 있게 남긴다 */
  sourceName: string;
}

/** 브라우저가 열 수 있는 이미지인지 — 확장자가 아니라 MIME 으로 본다 */
export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

async function postBlob(
  blob: Blob,
  filename: string,
  bucket: UploadBucket,
  prefix: string
): Promise<string> {
  const form = new FormData();
  form.append("file", new File([blob], filename, { type: blob.type }));
  form.append("bucket", bucket);
  if (prefix) form.append("prefix", prefix);

  const res = await fetch("/api/admin/upload", { method: "POST", body: form });
  const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!res.ok || !data?.url) {
    throw new Error(data?.error ?? "사진을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
  return data.url;
}

/**
 * 상품컷 한 장 업로드 — 긴 변 2,000px 로 줄이고 WebP 로 바꿔 보낸다.
 * 원본이 30MB 여도 여기서 수백 KB 가 된다.
 */
export async function uploadGalleryImage(
  file: File,
  { bucket = "products", prefix = "" }: { bucket?: UploadBucket; prefix?: string } = {}
): Promise<UploadedAsset> {
  if (!isImageFile(file)) {
    throw new Error(`'${file.name}' 은 사진 파일이 아닙니다. JPG·PNG·WebP 사진을 올려 주세요.`);
  }
  const processed = await compressGalleryImage(file);
  const url = await postBlob(processed.blob, "photo.webp", bucket, prefix);
  return {
    url,
    width: processed.width,
    height: processed.height,
    sourceName: file.name,
  };
}

export interface SliceUploadResult {
  slices: UploadedAsset[];
  meta: ImageMeta;
}

/**
 * 상세페이지 통이미지 한 장 업로드 — 폭 1,080 으로 맞추고 조각으로 잘라 전부 올린다.
 *
 * 경로는 조각마다 새로 발급된다(서버가 UUID 를 붙인다). 결정적 경로에 덮어쓰지 않는 이유:
 * next/image 옵티마이저 캐시에는 무효화 수단이 없어서(next.config.ts 주석 참고)
 * 같은 경로에 새 그림을 올리면 최대 하루 동안 옛 그림이 고객에게 나간다.
 */
export async function uploadDetailImage(
  file: File,
  {
    bucket = "products",
    prefix = "",
    onProgress,
  }: {
    bucket?: UploadBucket;
    prefix?: string;
    /** (완료 조각 수, 전체 조각 수, 단계) */
    onProgress?: (done: number, total: number, stage: "slicing" | "uploading") => void;
  } = {}
): Promise<SliceUploadResult> {
  if (!isImageFile(file)) {
    throw new Error(`'${file.name}' 은 사진 파일이 아닙니다. JPG·PNG·WebP 사진을 올려 주세요.`);
  }

  const meta = await readImageMeta(file);
  const pieces: DetailSlice[] = await sliceTallImage(file, {
    onProgress: (done, total) => onProgress?.(done, total, "slicing"),
  });

  const slices: UploadedAsset[] = [];
  for (const piece of pieces) {
    const url = await postBlob(piece.blob, `detail-${piece.index}.webp`, bucket, prefix);
    slices.push({
      url,
      width: piece.width,
      height: piece.height,
      sourceName: file.name,
    });
    onProgress?.(slices.length, pieces.length, "uploading");
  }

  return { slices, meta };
}

/**
 * 여러 장을 한 번에 — 한 장이 실패해도 나머지는 계속 올린다.
 * 전부 실패시키는 것보다 "9장 올라갔고 1장 실패" 를 보여 주는 편이 복구하기 쉽다.
 */
export interface BatchUploadOutcome {
  uploaded: UploadedAsset[];
  failures: { name: string; reason: string }[];
}

export async function uploadGalleryImages(
  files: File[],
  {
    bucket = "products",
    prefix = "",
    onProgress,
  }: {
    bucket?: UploadBucket;
    prefix?: string;
    onProgress?: (done: number, total: number, currentName: string) => void;
  } = {}
): Promise<BatchUploadOutcome> {
  const uploaded: UploadedAsset[] = [];
  const failures: { name: string; reason: string }[] = [];

  for (const [index, file] of files.entries()) {
    onProgress?.(index, files.length, file.name);
    try {
      uploaded.push(await uploadGalleryImage(file, { bucket, prefix }));
    } catch (e) {
      failures.push({
        name: file.name,
        reason: e instanceof Error ? e.message : "알 수 없는 이유로 실패했습니다.",
      });
    }
  }
  onProgress?.(files.length, files.length, "");
  return { uploaded, failures };
}

/** 사람이 읽는 사진 설명 — "1,080 × 4,000 · 420KB" */
export function describeAsset(width: number, height: number, bytes?: number): string {
  const dims = `${width.toLocaleString("ko-KR")} × ${height.toLocaleString("ko-KR")}`;
  return bytes ? `${dims} · ${humanBytes(bytes)}` : dims;
}
