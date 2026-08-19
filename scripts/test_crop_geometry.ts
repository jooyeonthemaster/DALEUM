import {
  cropOutputSize, describeCrop, recenterToRatio, resolveRect,
  type OutputCaps, type Rect,
} from "../src/components/admin/detail-editor/crop-geometry.ts";

let pass = 0, fail = 0;
function eq(label: string, got: number, want: number, tol = 0.01) {
  const ok = Math.abs(got - want) <= tol;
  if (ok) { pass++; console.log(`  ok   ${label}  (${got})`); }
  else { fail++; console.log(`  FAIL ${label}  got=${got} want=${want}`); }
}
function is(label: string, got: string, want: string) {
  if (got === want) { pass++; console.log(`  ok   ${label}  (${got})`); }
  else { fail++; console.log(`  FAIL ${label}  got="${got}" want="${want}"`); }
}

/** image-pipeline.ts 의 cropImage 가 실제로 쓰는 축소식. 여기 그대로 옮겨 두고
    "우리가 넘긴 maxEdge 로 정말 그 치수가 나오는가" 를 끝까지 확인한다. */
const cropImageOut = (w: number, h: number, maxEdge: number) => {
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
};

const CAPS: OutputCaps = { width: 2000, height: 4000 }; // GALLERY_MAX_EDGE / DETAIL_SLICE_HEIGHT

console.log("— 상세 조각은 한 픽셀도 깎이지 않는다 (핵심 회귀) —");
{
  const out = cropOutputSize(1080, 4000, CAPS);
  eq("1080×4000 → 폭 유지", out.width, 1080);
  eq("1080×4000 → 높이 유지", out.height, 4000);
  const real = cropImageOut(1080, 4000, out.maxEdge);
  eq("cropImage 를 통과해도 폭 1080", real.w, 1080);
  eq("cropImage 를 통과해도 높이 4000", real.h, 4000);
  // 예전 배선(긴 변 2,000)이 무엇을 했는지 — 이 값이 되살아나면 화질 사고다
  eq("옛 배선은 폭이 반토막이었다", cropImageOut(1080, 4000, 2000).w, 540);
}

console.log("— 세로가 긴 중간 크기도 폭을 지킨다 —");
{
  const out = cropOutputSize(1080, 2400, CAPS);
  eq("1080×2400 → 폭 유지", out.width, 1080);
  eq("1080×2400 → 높이 유지", out.height, 2400);
  eq("옛 배선은 900 으로 깎였다", cropImageOut(1080, 2400, 2000).w, 900);
}

console.log("— 상한에 걸릴 때만 줄인다 —");
{
  const wide = cropOutputSize(5000, 3000, CAPS);
  eq("폭 상한 2000", wide.width, 2000);
  eq("비율 유지 → 1200", wide.height, 1200);
  const tall = cropOutputSize(970, 17558, CAPS); // 조각내기 전 원본이 섞여 들어온 경우
  eq("높이 상한 4000", tall.height, 4000);
  eq("그만큼 폭도 함께", tall.width, 221);
  eq("작은 그림은 확대하지 않는다", cropOutputSize(300, 200, CAPS).width, 300);
}

console.log("— 치수 문구는 저장본과 같은 계산을 쓴다 —");
is("안 줄면 그대로", describeCrop(1080, 4000, CAPS), "1,080 × 4,000");
is("줄면 숨기지 않는다", describeCrop(5000, 3000, CAPS), "5,000 × 3,000 → 저장은 2,000 × 1,200");

console.log("— 옮기기는 그림 밖으로 못 나간다 —");
{
  const from: Rect = { x: 100, y: 100, w: 200, h: 200 };
  const a = resolveRect(from, "move", -500, -500, 1000, 1000, null);
  eq("왼쪽 위 한계 x", a.x, 0);
  eq("왼쪽 위 한계 y", a.y, 0);
  const b = resolveRect(from, "move", 5000, 5000, 1000, 1000, null);
  eq("오른쪽 아래 한계 x", b.x, 800);
  eq("크기는 그대로", b.w, 200);
}

console.log("— 붙잡은 변만 움직인다 —");
{
  const from: Rect = { x: 100, y: 100, w: 200, h: 200 };
  const e = resolveRect(from, "e", 50, 0, 1000, 1000, null);
  eq("오른쪽 변만 밀림", e.w, 250);
  eq("왼쪽은 못 박힘", e.x, 100);
  const w = resolveRect(from, "w", -50, 0, 1000, 1000, null);
  eq("왼쪽으로 끌면 커진다", w.w, 250);
  eq("왼쪽 변이 이동", w.x, 50);
  const tiny = resolveRect(from, "e", -1000, 0, 1000, 1000, null);
  eq("최소 변(=50) 아래로 못 간다", tiny.w, 50);
}

console.log("— 비율이 걸리면 흔들리지 않는다 —");
{
  const from: Rect = { x: 100, y: 100, w: 200, h: 200 };
  const se = resolveRect(from, "se", 100, 0, 1000, 1000, 1);
  eq("1:1 유지", se.w / se.h, 1);
  const wide = resolveRect(from, "se", 100, 0, 1000, 1000, 16 / 9);
  eq("16:9 유지", wide.w / wide.h, 16 / 9);
  const capped = resolveRect(from, "se", 5000, 5000, 1000, 1000, 1);
  eq("그림 안에 갇힌다", capped.x + capped.w <= 1000 ? 1 : 0, 1);
  eq("갇혀도 1:1", capped.w / capped.h, 1);
}

console.log("— 프리셋은 한가운데를 지킨다 —");
{
  const r = recenterToRatio({ x: 100, y: 100, w: 400, h: 400 }, 16 / 9, 1000, 1000);
  eq("가운데 x 유지", r.x + r.w / 2, 300);
  eq("가운데 y 유지", r.y + r.h / 2, 300);
  eq("16:9", r.w / r.h, 16 / 9);
  const clamped = recenterToRatio({ x: 0, y: 0, w: 1000, h: 1000 }, 16 / 9, 1000, 300);
  eq("세로가 모자라면 줄여서 넣는다", clamped.h <= 300 ? 1 : 0, 1);
  eq("줄여도 16:9", clamped.w / clamped.h, 16 / 9);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
