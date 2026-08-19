/* ============================================================
   이미지 폭 드래그 — 좌표 수학 (순수 함수, DOM 없음)

   이 파일에 DOM 이 없는 것은 의도다. 드래그가 "깨지는" 사고는 거의 전부
   좌표 변환 실수에서 나오는데, 그 계산이 이벤트 핸들러 안에 섞여 있으면
   눈으로 검증할 수도, 테스트할 수도 없다. 그래서 수학만 여기 모은다.

   ── 좌표계가 셋이다. 섞으면 반드시 깨진다 ──
     1) 화면 공간 (screen)   : PointerEvent.clientX. 스테이지가 축소돼 있으면 실제와 다르다.
     2) 문서 공간 (document) : 캔버스를 축소하지 않았을 때의 CSS px. 고객이 보는 그 픽셀.
     3) 비율 공간 (percent)  : 콘텐츠 칼럼 대비 %. **저장되는 것은 이것뿐이다.**

   규칙: 포인터 좌표는 받는 즉시 문서 공간으로 바꾸고, 계산이 끝나면 비율로 저장한다.
   화면 공간 값은 절대 저장하지 않는다 — 스테이지 축소율이나 창 크기가 바뀌면 무의미해지기 때문이다.

   ── 왜 %인가 ──
   같은 문서가 PC 768px 과 모바일 340px 두 폭으로 렌더된다. 절대 px 을 저장하면
   모바일에서 칼럼을 넘어간다. %는 폭에 무관하게 같은 의미를 갖는다.

   ── 왜 높이를 저장하지 않는가 ──
   높이는 언제나 원본 종횡비에서 파생한다. 폭·높이를 따로 두는 순간 자유 변형이
   가능해지고, 제품 사진이 찌그러진다. 종횡비 고정이 "안 깨짐" 의 유일한 보장이다.
   ============================================================ */

/* 이 파일은 **아무것도 import 하지 않는다.** 순수 함수만 있어야
   node 로 그대로 돌려 좌표 수학을 검증할 수 있다 (scripts/_test_resize_math.ts).
   드래그가 깨지는 사고는 대부분 이 계산에서 나는데, 테스트할 수 없는 코드는
   "잘 되는 것 같다" 이상으로 확인할 방법이 없다. */

/** 이미지 폭 스냅 지점(%) — 드래그가 이 근처에 오면 자석처럼 붙는다 */
export const WIDTH_SNAPS = [25, 33.34, 50, 66.67, 75, 100] as const;

/** 스냅이 걸리는 허용 오차(%) */
export const SNAP_TOLERANCE = 2.5;

/** 이미지 폭 하한(%) — 이보다 작으면 무엇인지 알아볼 수 없다 */
export const MIN_WIDTH_PCT = 5;

/** 어느 손잡이를 잡았는가 */
export type ResizeHandle = "left" | "right";

export interface ResizeSession {
  /** 드래그를 시작한 지점 (문서 공간 x) */
  startDocX: number;
  /** 드래그를 시작할 때의 폭(%) */
  startPct: number;
  /** 콘텐츠 칼럼의 폭 (문서 공간 px) */
  contentWidth: number;
  /** 스테이지 축소율. 1이면 축소 없음 */
  scale: number;
  /** 스테이지의 화면 좌표 좌측 끝 */
  stageLeft: number;
  handle: ResizeHandle;
  /** 가운데 정렬이면 양쪽이 동시에 자라므로 증분이 2배가 된다 */
  centered: boolean;
}

/**
 * 화면 좌표 → 문서 좌표.
 * 스테이지에 transform: scale(k) 이 걸려 있으면 clientX 는 k 배 압축돼 들어온다.
 * 나누어 되돌리지 않으면 축소된 화면에서 드래그가 실제보다 느리게 따라온다.
 */
export function toDocumentX(clientX: number, stageLeft: number, scale: number): number {
  const k = scale > 0 ? scale : 1;
  return (clientX - stageLeft) / k;
}

/** 값을 [min,max] 안으로 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 스냅 — 사람이 노리는 폭(절반·3분의1·전체)에 자석처럼 붙는다.
 * 허용 오차 밖이면 손대지 않는다. 붙는 느낌이 없으면 정확한 폭을 맞추기가 매우 어렵다.
 */
export function snapPct(pct: number, tolerance: number = SNAP_TOLERANCE): number {
  let best = pct;
  let bestDist = tolerance;
  for (const target of WIDTH_SNAPS) {
    const dist = Math.abs(pct - target);
    if (dist < bestDist) {
      bestDist = dist;
      best = target;
    }
  }
  return best;
}

/**
 * 드래그 중 새 폭(%)을 구한다.
 *
 * 오른쪽 손잡이를 오른쪽으로 끌면 커지고, 왼쪽 손잡이를 왼쪽으로 끌면 커진다 —
 * 그래서 왼쪽 손잡이는 부호를 뒤집는다. 이 부호 하나를 빠뜨리면 드래그가 거꾸로 간다.
 */
export function resolveWidthPct(
  session: ResizeSession,
  clientX: number,
  { snap = true }: { snap?: boolean } = {}
): number {
  const docX = toDocumentX(clientX, session.stageLeft, session.scale);
  const direction = session.handle === "right" ? 1 : -1;
  const deltaPx = (docX - session.startDocX) * direction;

  const width = session.contentWidth > 0 ? session.contentWidth : 1;
  // 가운데 정렬은 양쪽이 같이 벌어지므로 포인터가 움직인 만큼의 2배로 자란다
  const growth = session.centered ? 2 : 1;
  const deltaPct = (deltaPx / width) * 100 * growth;

  const raw = clamp(session.startPct + deltaPct, MIN_WIDTH_PCT, 100);
  return snap ? clamp(snapPct(raw), MIN_WIDTH_PCT, 100) : raw;
}

/** 저장 직전 정리 — 소수점이 길게 남으면 저장본이 지저분해진다 */
export function normalizePct(pct: number): number {
  return Math.round(clamp(pct, MIN_WIDTH_PCT, 100) * 100) / 100;
}

/**
 * 폭(%)과 원본 치수로 렌더 높이를 구한다 — 자리를 미리 잡아 이미지 로드 시 튐을 막는다.
 * (편집 캔버스와 고객 화면이 같은 식을 쓰므로 두 화면의 높이가 어긋날 수 없다.)
 */
export function renderedHeight(
  contentWidth: number,
  widthPct: number,
  naturalWidth: number,
  naturalHeight: number
): number {
  if (naturalWidth <= 0) return 0;
  const w = (contentWidth * widthPct) / 100;
  return (w * naturalHeight) / naturalWidth;
}

/**
 * 스테이지 축소율 — 가용 폭이 캔버스 폭보다 좁을 때만 줄인다.
 * **확대는 절대 하지 않는다**(최대 1). 확대하면 관리자가 보는 것이 고객이 보는 것보다
 * 커져서, 지금 고치려는 바로 그 문제가 되돌아온다.
 */
export function stageScale(availableWidth: number, canvasWidth: number): number {
  if (canvasWidth <= 0 || availableWidth <= 0) return 1;
  return Math.min(1, availableWidth / canvasWidth);
}
