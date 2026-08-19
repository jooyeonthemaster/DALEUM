/* ============================================================
   사진의 픽셀 치수를 **디코딩하지 않고** 알아낸다

   왜 필요한가:
   폴더를 통째로 받으면 한 번에 193장이 들어온다. 그런데 어느 사진이 상품 사진이고
   어느 사진이 상세페이지 조각인지는 **가로세로를 봐야** 갈린다(세로비 2.5 규칙).
   예전에는 그 판정을 업로드 직전으로 미뤘고, 확인 화면은 파일명만 보고 숫자를 적었다.
   그래서 화면이 "상품 사진 32장" 이라 약속해 놓고 실제로는 11장이 상세로 갔다.

   그렇다고 확인 화면에서 193장을 전부 createImageBitmap 으로 디코딩하면
   (readImageMeta 가 그렇게 한다) 수 GB 를 풀었다 접었다 하며 화면이 한참 멈춘다.
   치수는 파일 **머리글 몇 바이트**에 그대로 적혀 있으므로, 앞부분만 잘라 읽는다.
   실측: 32장 폴더 전수 판독이 한 자릿수 ms 대에서 끝난다.

   머리글을 못 읽는 형식(AVIF 등)만 실제 디코딩으로 물러난다 — 드물어서 값을 치를 만하다.
   ============================================================ */

export interface PixelSize {
  width: number;
  height: number;
}

/** 머리글로 잘라 읽을 크기. JPEG 는 EXIF 썸네일이 앞에 붙어 SOF 가 뒤로 밀릴 수 있다 */
const HEAD_BYTES = 256 * 1024;

function ascii(view: DataView, offset: number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(view.getUint8(offset + i));
  return out;
}

/** PNG — IHDR 이 항상 8바이트 시그니처 바로 뒤에 온다 */
function readPng(view: DataView): PixelSize | null {
  if (view.byteLength < 24) return null;
  if (view.getUint32(0) !== 0x89504e47 || view.getUint32(4) !== 0x0d0a1a0a) return null;
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/**
 * JPEG — 마커를 훑어 SOF(프레임 시작)를 찾는다.
 * SOF0/1/2/3/5/6/7/9/10/11/13/14/15 가 전부 같은 자리에 세로·가로를 담는다.
 * 주의: 세로가 먼저다(높이, 폭 순서). 이걸 뒤집으면 세로비 판정이 통째로 뒤집힌다.
 */
function readJpeg(view: DataView): PixelSize | null {
  if (view.byteLength < 4) return null;
  if (view.getUint8(0) !== 0xff || view.getUint8(1) !== 0xd8) return null;

  const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let i = 2;
  while (i + 9 < view.byteLength) {
    if (view.getUint8(i) !== 0xff) {
      i += 1;
      continue;
    }
    const marker = view.getUint8(i + 1);
    // 채움 바이트·독립 마커는 길이 칸이 없다
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // 이미지 데이터 시작 — SOF 는 이미 지났어야 한다
    const length = view.getUint16(i + 2);
    if (SOF.has(marker)) {
      return { height: view.getUint16(i + 5), width: view.getUint16(i + 7) };
    }
    if (length < 2) return null;
    i += 2 + length;
  }
  return null;
}

/** GIF — 논리 화면 크기가 6번째 바이트부터 리틀엔디언으로 있다 */
function readGif(view: DataView): PixelSize | null {
  if (view.byteLength < 10) return null;
  if (ascii(view, 0, 3) !== "GIF") return null;
  return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
}

/** WebP — 손실(VP8)·무손실(VP8L)·확장(VP8X) 세 벌이 각각 다른 자리에 적는다 */
function readWebp(view: DataView): PixelSize | null {
  if (view.byteLength < 30) return null;
  if (ascii(view, 0, 4) !== "RIFF" || ascii(view, 8, 4) !== "WEBP") return null;
  const chunk = ascii(view, 12, 4);
  if (chunk === "VP8 ") {
    return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  }
  if (chunk === "VP8L") {
    const bits = view.getUint32(21, true);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") {
    const w = view.getUint8(24) | (view.getUint8(25) << 8) | (view.getUint8(26) << 16);
    const h = view.getUint8(27) | (view.getUint8(28) << 8) | (view.getUint8(29) << 16);
    return { width: w + 1, height: h + 1 };
  }
  return null;
}

function parseHeader(view: DataView): PixelSize | null {
  const size = readPng(view) ?? readJpeg(view) ?? readGif(view) ?? readWebp(view);
  if (!size || size.width <= 0 || size.height <= 0) return null;
  return size;
}

/** 치수를 읽는다. 어떤 방법으로도 못 읽으면 null — 부르는 쪽이 "모름" 으로 다뤄야 한다 */
export async function readPixelSize(file: File): Promise<PixelSize | null> {
  try {
    const buffer = await file.slice(0, HEAD_BYTES).arrayBuffer();
    const parsed = parseHeader(new DataView(buffer));
    if (parsed) return parsed;
  } catch {
    // 머리글을 못 읽었을 뿐이다 — 아래 디코딩으로 한 번 더 시도한다
  }
  try {
    if (typeof createImageBitmap !== "function") return null;
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}
