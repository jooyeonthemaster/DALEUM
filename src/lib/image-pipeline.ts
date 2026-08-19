/* ============================================================
   브라우저 이미지 파이프라인 — 업로드 전 전처리 (클라이언트 전용)

   왜 브라우저에서 처리하는가:
   수다락에서 받는 상세페이지 원본은 970×17,558px / 11.3MB, 2083×18,830px / 17.9MB
   같은 통이미지다. 이걸 그대로 서버로 보내는 길은 애초에 없다 —
   Vercel 서버리스 함수의 요청 본문 상한이 4.5MB 이고, /api/admin/upload 도 5MB 에서 막는다.
   그래서 "관리자가 원본을 그대로 올리면 알아서 되게" 하려면 전처리가 브라우저에 있어야 한다.

   createImageBitmap(file, sx, sy, sw, sh, {resizeWidth, resizeHeight}) 은
   원본 전체를 캔버스에 올리지 않고 필요한 구간만 잘라 디코딩하므로
   캔버스 최대 치수(대부분 브라우저 16,384px) 제한에 걸리지 않는다.
   세로 2만 px 짜리를 다루는 유일한 방법이다.

   실측 (Chromium, 이 저장소의 실제 자산):
     970×17,558 / 11.3MB PNG → 5조각 WebP 총 1.51MB / 1.8초
     2083×18,830 / 17.9MB JPG → 3조각 WebP 총 0.98MB / 1.7초
     5200×5208 / 28.7MB PNG  → 1조각 264KB / 0.5초
   ============================================================ */

/** 상세 조각의 목표 가로폭(px). DescriptionBlock 의 공칭 폭과 같다. */
export const DETAIL_TARGET_WIDTH = 1080;

/** 상세 조각 하나의 최대 세로(px). 이보다 길면 다음 조각으로 넘어간다. */
export const DETAIL_SLICE_HEIGHT = 4000;

/** 갤러리(상품컷) 이미지의 긴 변 상한(px). */
export const GALLERY_MAX_EDGE = 2000;

/**
 * 갤러리 이미지로 허용하는 세로/가로 비율 상한.
 * scripts/verify_catalog.mjs 의 MAX_GALLERY_RATIO 와 같은 값이어야 한다 —
 * 이 값을 넘는 이미지가 갤러리에 들어가면 썸네일 스트립이 세로 2만 px 짜리를 물게 된다
 * (실제로 마틴조 13종에서 났던 사고. scripts/fix_tall_gallery_images.mjs 참고).
 */
export const GALLERY_MAX_RATIO = 2.5;

/**
 * 업로드 한 건의 상한(byte) — **이 프로젝트의 유일한 업로드 상한이다.**
 *
 * 서버(api/admin/upload)도, 화면의 안내 문구도 전부 이 값을 가져다 써야 한다.
 * 전에는 같은 상한이 세 군데에 서로 다른 값으로 흩어져 있었다
 * (여기 8MB / upload 라우트 5MB / 일괄 등록 화면 5MB) — 어느 것이 진짜인지 아무도 몰랐고,
 * 화면은 "5MB 이하" 라고 안내하는데 서버는 다른 값으로 거절하는 상태였다.
 *
 * 4MB 인 이유: Vercel 서버리스 함수의 요청 본문 상한이 4.5MB 라, 그보다 큰 파일은
 * 우리가 허용해도 플랫폼이 먼저 끊는다. 전처리를 거친 결과물은 조각당 200~500KB 라
 * 이 상한에 닿을 일이 없다 — 닿는다면 전처리를 건너뛴 경로가 있다는 뜻이다.
 */
export const UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

export interface ImageMeta {
  width: number;
  height: number;
  /** 세로/가로 */
  ratio: number;
  bytes: number;
  type: string;
}

export interface ProcessedImage {
  blob: Blob;
  width: number;
  height: number;
}

export interface DetailSlice extends ProcessedImage {
  /** 1부터 시작하는 조각 번호 */
  index: number;
}

/** 사진의 쓰임새 — 상품컷인지 상세 통이미지인지 */
export type ImageRole = "gallery" | "detail";

const isBrowser = typeof window !== "undefined" && typeof createImageBitmap === "function";

function assertBrowser() {
  if (!isBrowser) {
    throw new Error("이미지 처리는 브라우저에서만 동작합니다.");
  }
}

/**
 * OffscreenCanvas 가 없는 브라우저(사파리 구버전)를 위한 폴백.
 * 둘 다 convertToBlob/toBlob 으로 같은 결과를 낸다.
 */
async function bitmapToBlob(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  quality: number
): Promise<Blob> {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("이미지를 그릴 수 없습니다.");
    ctx.drawImage(bitmap, 0, 0);
    return canvas.convertToBlob({ type: "image/webp", quality });
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이미지를 그릴 수 없습니다.");
  ctx.drawImage(bitmap, 0, 0);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("이미지 변환에 실패했습니다."))),
      "image/webp",
      quality
    );
  });
}

/** 파일의 실제 픽셀 치수를 읽는다. 디코딩만 하고 캔버스는 쓰지 않는다. */
export async function readImageMeta(file: File | Blob): Promise<ImageMeta> {
  assertBrowser();
  const bitmap = await createImageBitmap(file);
  const meta: ImageMeta = {
    width: bitmap.width,
    height: bitmap.height,
    ratio: bitmap.height / bitmap.width,
    bytes: file.size,
    type: file.type,
  };
  bitmap.close();
  return meta;
}

/**
 * 이 사진이 상품컷인지 상세 통이미지인지 판정한다.
 * 판정 기준은 세로비 하나뿐이다 — 관리자에게 "이건 상세페이지 이미지 같은데요?" 라고
 * 물어보기 위한 것이지, 강제로 분류하기 위한 것이 아니다.
 */
export function guessRole(meta: Pick<ImageMeta, "ratio">): ImageRole {
  return meta.ratio > GALLERY_MAX_RATIO ? "detail" : "gallery";
}

/**
 * 상품컷 한 장을 업로드 규격으로 줄인다.
 * 긴 변이 GALLERY_MAX_EDGE 이하면 축소 없이 WebP 재인코딩만 한다.
 */
export async function compressGalleryImage(
  file: File | Blob,
  { maxEdge = GALLERY_MAX_EDGE, quality = 0.9 }: { maxEdge?: number; quality?: number } = {}
): Promise<ProcessedImage> {
  assertBrowser();
  const probe = await createImageBitmap(file);
  const { width: sw, height: sh } = probe;
  probe.close();

  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  const width = Math.max(1, Math.round(sw * scale));
  const height = Math.max(1, Math.round(sh * scale));

  const bitmap = await createImageBitmap(file, {
    resizeWidth: width,
    resizeHeight: height,
    resizeQuality: "high",
  });
  const blob = await bitmapToBlob(bitmap, width, height, quality);
  bitmap.close();
  return { blob, width, height };
}

export interface CropRect {
  /** 원본 픽셀 기준 좌표 */
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 지정한 사각형으로 잘라 낸다. 회전은 0/90/180/270 만 받는다.
 * 좌표는 원본 픽셀 기준이며, 범위를 벗어나면 원본 안쪽으로 잘라 맞춘다.
 */
export async function cropImage(
  file: File | Blob,
  rect: CropRect,
  {
    rotate = 0,
    maxEdge = GALLERY_MAX_EDGE,
    quality = 0.9,
  }: { rotate?: 0 | 90 | 180 | 270; maxEdge?: number; quality?: number } = {}
): Promise<ProcessedImage> {
  assertBrowser();
  const probe = await createImageBitmap(file);
  const { width: iw, height: ih } = probe;
  probe.close();

  const x = Math.max(0, Math.min(Math.round(rect.x), iw - 1));
  const y = Math.max(0, Math.min(Math.round(rect.y), ih - 1));
  const w = Math.max(1, Math.min(Math.round(rect.width), iw - x));
  const h = Math.max(1, Math.min(Math.round(rect.height), ih - y));

  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const outW = Math.max(1, Math.round(w * scale));
  const outH = Math.max(1, Math.round(h * scale));

  const bitmap = await createImageBitmap(file, x, y, w, h, {
    resizeWidth: outW,
    resizeHeight: outH,
    resizeQuality: "high",
  });

  if (rotate === 0) {
    const blob = await bitmapToBlob(bitmap, outW, outH, quality);
    bitmap.close();
    return { blob, width: outW, height: outH };
  }

  // 90/270 은 가로세로가 뒤바뀐다
  const swap = rotate === 90 || rotate === 270;
  const canvasW = swap ? outH : outW;
  const canvasH = swap ? outW : outH;

  const draw = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) => {
    ctx.translate(canvasW / 2, canvasH / 2);
    ctx.rotate((rotate * Math.PI) / 180);
    ctx.drawImage(bitmap, -outW / 2, -outH / 2);
  };

  let blob: Blob;
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(canvasW, canvasH);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("이미지를 그릴 수 없습니다.");
    draw(ctx);
    blob = await canvas.convertToBlob({ type: "image/webp", quality });
  } else {
    const canvas = document.createElement("canvas");
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("이미지를 그릴 수 없습니다.");
    draw(ctx);
    blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("이미지 변환에 실패했습니다."))),
        "image/webp",
        quality
      );
    });
  }
  bitmap.close();
  return { blob, width: canvasW, height: canvasH };
}

export interface SliceOptions {
  targetWidth?: number;
  sliceHeight?: number;
  quality?: number;
  /** 조각 하나가 끝날 때마다 호출 — 진행률 표시용 */
  onProgress?: (done: number, total: number) => void;
}

/**
 * 세로로 긴 상세 통이미지를 여러 조각으로 자른다.
 *
 * 조각을 내는 이유는 두 가지다.
 *  1) 세로 2만 px 짜리 한 장은 업로드 상한에도, 브라우저 캔버스 상한에도 걸린다.
 *  2) 고객 화면에서 한 장씩 순차 로드돼야 첫 화면이 빨리 뜬다.
 * 조각 사이가 벌어지면 그림이 끊겨 보이므로, 렌더 쪽(DescriptionBlock)이
 * 연속 이미지를 한 덩어리로 묶어 테두리를 한 번만 두른다.
 */
export async function sliceTallImage(
  file: File | Blob,
  {
    targetWidth = DETAIL_TARGET_WIDTH,
    sliceHeight = DETAIL_SLICE_HEIGHT,
    quality = 0.86,
    onProgress,
  }: SliceOptions = {}
): Promise<DetailSlice[]> {
  assertBrowser();
  const probe = await createImageBitmap(file);
  const srcW = probe.width;
  const srcH = probe.height;
  probe.close();

  // 원본이 목표 폭보다 좁으면 확대하지 않는다 — 늘리면 뭉갠다.
  const scale = Math.min(1, targetWidth / srcW);
  const outW = Math.max(1, Math.round(srcW * scale));
  // 출력 기준 sliceHeight 가 되도록 원본 기준 구간 높이를 역산한다.
  const srcSliceH = Math.max(1, Math.round(sliceHeight / scale));
  const total = Math.max(1, Math.ceil(srcH / srcSliceH));

  const slices: DetailSlice[] = [];
  for (let i = 0; i < total; i++) {
    const sy = i * srcSliceH;
    const sh = Math.min(srcSliceH, srcH - sy);
    if (sh <= 0) break;
    const outH = Math.max(1, Math.round(sh * scale));

    const bitmap = await createImageBitmap(file, 0, sy, srcW, sh, {
      resizeWidth: outW,
      resizeHeight: outH,
      resizeQuality: "high",
    });
    const blob = await bitmapToBlob(bitmap, outW, outH, quality);
    bitmap.close();

    slices.push({ blob, width: outW, height: outH, index: i + 1 });
    onProgress?.(i + 1, total);
  }
  return slices;
}

/** 파일 크기를 사람이 읽는 문자열로 (예: 11.3MB) */
export function humanBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
