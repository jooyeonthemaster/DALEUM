/* ============================================================
   사진 자르기 — 사각형 수학 (순수 함수, DOM 없음)

   왜 화면 코드와 갈라놓는가:
   자르기가 어긋나는 사고는 거의 전부 "지금 이 숫자가 어느 좌표계의 값인가" 를 헷갈리는
   데서 난다. 그 계산이 포인터 핸들러 안에 섞여 있으면 눈으로 검증할 수도, 테스트할 수도
   없다. (같은 이유로 폭 드래그 수학은 resize-math.ts 에 따로 있다.)

   이 파일의 단위는 **언제나 원본 픽셀** 이다. 화면에 보이는 그림은 모달 크기에 맞춰
   축소돼 있고 창을 줄이면 그 배율이 또 바뀐다 — 화면 픽셀을 여기까지 들여보내면 창 크기에
   따라 잘리는 자리가 달라진다. 배율 환산은 부르는 쪽(CropModal)이 끝내고 온다.

   이 파일은 **아무것도 import 하지 않는다.** 그래야 node 로 그대로 돌려 검증할 수 있다.
   ============================================================ */

/** 선택 사각형. 단위는 원본 픽셀 (머리말 참고) */
export type Rect = { x: number; y: number; w: number; h: number };

/** 어디를 붙잡았는가 — 안쪽(move) / 변 4개 / 모서리 4개 */
export type Handle = "move" | "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

/** 자른 결과에 씌울 상한 (원본 픽셀). 폭과 높이를 따로 두는 이유는 cropOutputSize 참고 */
export interface OutputCaps {
  width: number;
  height: number;
}

/** 비율 프리셋 — [보이는 이름, 가로/세로] */
export const RATIOS: [string, number | null][] = [
  ["자유", null],
  ["1:1", 1],
  ["4:3", 4 / 3],
  ["3:4", 3 / 4],
  ["16:9", 16 / 9],
];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 사각형이 이보다 작아지면 무엇을 고른 건지 알아볼 수 없다 */
const minSide = (w: number, h: number) => Math.max(16, Math.round(Math.min(w, h) * 0.05));

/**
 * 손잡이를 끌었을 때의 새 사각형.
 *
 * 붙잡은 변만 움직이고 반대편은 못 박아 둔다 — 그래야 "왼쪽을 끌면 왼쪽만 들어온다" 는
 * 사람의 예상과 맞는다. 비율이 걸려 있으면 기준 축을 하나로 정하고(위/아래 변은 높이,
 * 나머지는 폭) 나머지를 끌어 맞춘다. 두 축을 동시에 자유롭게 두면 비율이 흔들린다.
 */
export function resolveRect(
  from: Rect,
  handle: Handle,
  dx: number,
  dy: number,
  natW: number,
  natH: number,
  ratio: number | null
): Rect {
  if (handle === "move") {
    const x = clamp(from.x + dx, 0, natW - from.w);
    const y = clamp(from.y + dy, 0, natH - from.h);
    return { x, y, w: from.w, h: from.h };
  }

  const west = handle.includes("w");
  const east = handle.includes("e");
  const north = handle.includes("n");
  const south = handle.includes("s");
  const min = minSide(natW, natH);

  const left = west ? clamp(from.x + dx, 0, from.x + from.w - min) : from.x;
  const right = east ? clamp(from.x + from.w + dx, from.x + min, natW) : from.x + from.w;
  const top = north ? clamp(from.y + dy, 0, from.y + from.h - min) : from.y;
  const bottom = south ? clamp(from.y + from.h + dy, from.y + min, natH) : from.y + from.h;

  let w = right - left;
  let h = bottom - top;
  if (ratio == null) return { x: left, y: top, w, h };

  if (handle === "n" || handle === "s") w = h * ratio;
  else h = w / ratio;

  /* 못 박힌 쪽을 기준으로 남은 여유를 재고, 두 축을 **같은 배율로** 한 번에 맞춘다.
     축을 하나씩 잘라 넣으면 비율이 어긋나 상자가 튄다. */
  const cx = from.x + from.w / 2;
  const cy = from.y + from.h / 2;
  const roomW = west ? right : east ? natW - left : 2 * Math.min(cx, natW - cx);
  const roomH = north ? bottom : south ? natH - top : 2 * Math.min(cy, natH - cy);
  const fit = Math.min(1, roomW / w, roomH / h);
  w *= fit;
  h *= fit;
  const grow = Math.min(Math.max(1, min / w, min / h), roomW / w, roomH / h);
  w *= grow;
  h *= grow;

  const x = west ? right - w : east ? left : cx - w / 2;
  const y = north ? bottom - h : south ? top : cy - h / 2;
  return { x: clamp(x, 0, natW - w), y: clamp(y, 0, natH - h), w, h };
}

/** 프리셋을 누르면 지금 상자의 한가운데를 지키면서 그 비율로 다시 잡는다 */
export function recenterToRatio(r: Rect, ratio: number, natW: number, natH: number): Rect {
  const fit = Math.min(1, natW / r.w, (natH * ratio) / r.w);
  const w = r.w * fit;
  const h = w / ratio;
  const x = r.x + r.w / 2 - w / 2;
  const y = r.y + r.h / 2 - h / 2;
  return { x: clamp(x, 0, natW - w), y: clamp(y, 0, natH - h), w, h };
}

/**
 * 자른 결과의 치수와, 그 치수가 나오도록 cropImage 에 넘길 maxEdge.
 *
 * ── 왜 '긴 변' 상한을 그대로 쓰면 안 되는가 ──
 * cropImage 는 상한을 긴 변 하나로만 받는다(image-pipeline.ts). 그런데 이 편집기의 주력
 * 콘텐츠는 세로로 아주 긴 상세 조각(1,080×4,000)이라, 긴 변에 2,000 을 걸면 축소율이
 * 2000/4000 = 0.5 가 되어 **폭까지 540 으로 반토막** 난다. 고객 화면은 이 그림을 768px
 * 칼럼에 그리므로(SPEC §0) 540px 짜리 소스는 1.4배로 늘어나 눈에 띄게 흐려진다.
 * 즉 세로가 긴 그림에서는 긴 변 상한이 곧 폭을 깎는 장치가 된다.
 *
 * 그래서 폭·높이 상한을 따로 받아 축소율을 먼저 구하고, 그 축소율이 그대로 나오도록 긴 변
 * 값을 역산해 돌려준다. 폭·높이가 상한 안이면 축소율이 1 이라 **한 픽셀도 깎이지 않는다.**
 *
 * 예측 치수를 함께 돌려주는 것은 화면 문구(describeCrop)와 실제 저장본이 갈라지지 않게
 * 하기 위해서다 — 두 곳에서 따로 계산하면 반드시 어느 날 다른 값을 말한다.
 */
export function cropOutputSize(
  w: number,
  h: number,
  caps: OutputCaps
): { width: number; height: number; maxEdge: number } {
  // cropImage 가 rect 를 반올림해 쓰므로 여기서도 같은 정수로 맞춘다
  const cw = Math.max(1, Math.round(w));
  const ch = Math.max(1, Math.round(h));
  const scale = Math.min(1, caps.width / cw, caps.height / ch);
  return {
    width: Math.max(1, Math.round(cw * scale)),
    height: Math.max(1, Math.round(ch * scale)),
    maxEdge: Math.max(1, Math.round(Math.max(cw, ch) * scale)),
  };
}

/**
 * 관리자에게 보여 줄 치수 문구. 상한에 걸려 줄어들 예정이면 그 사실을 숨기지 않는다 —
 * "자를 때 본 크기" 와 "실제 저장된 크기" 가 말없이 달라지면 그게 곧 버그 신고다.
 */
export function describeCrop(w: number, h: number, caps: OutputCaps): string {
  const out = cropOutputSize(w, h, caps);
  const ko = (n: number) => n.toLocaleString("ko-KR");
  const base = `${ko(Math.max(1, Math.round(w)))} × ${ko(Math.max(1, Math.round(h)))}`;
  const shrinks = out.width !== Math.max(1, Math.round(w)) || out.height !== Math.max(1, Math.round(h));
  return shrinks ? `${base} → 저장은 ${ko(out.width)} × ${ko(out.height)}` : base;
}
