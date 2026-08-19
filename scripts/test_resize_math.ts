import {
  resolveWidthPct, toDocumentX, snapPct, clamp, renderedHeight, stageScale, normalizePct,
  type ResizeSession,
} from "../src/components/admin/detail-editor/resize-math.ts";

let pass = 0, fail = 0;
function eq(label: string, got: number, want: number, tol = 0.01) {
  const ok = Math.abs(got - want) <= tol;
  if (ok) { pass++; console.log(`  ok   ${label}  (${got})`); }
  else { fail++; console.log(`  FAIL ${label}  got=${got} want=${want}`); }
}

const base = (over: Partial<ResizeSession> = {}): ResizeSession => ({
  startDocX: 0, startPct: 50, contentWidth: 768, scale: 1,
  stageLeft: 0, handle: "right", centered: false, ...over,
});

console.log("— 좌표 변환 —");
eq("scale 1: clientX 그대로", toDocumentX(500, 0, 1), 500);
eq("stageLeft 100 빼기", toDocumentX(500, 100, 1), 400);
eq("scale 0.5: 두 배로 되돌림", toDocumentX(500, 100, 0.5), 800);

console.log("— 방향 —");
// 오른쪽 손잡이를 오른쪽으로 76.8px = 콘텐츠 폭의 10%
eq("오른손잡이 → 오른쪽 = 커짐", resolveWidthPct(base(), 76.8, { snap: false }), 60);
eq("오른손잡이 → 왼쪽 = 작아짐", resolveWidthPct(base(), -76.8, { snap: false }), 40);
eq("왼손잡이 → 왼쪽 = 커짐", resolveWidthPct(base({ handle: "left" }), -76.8, { snap: false }), 60);
eq("왼손잡이 → 오른쪽 = 작아짐", resolveWidthPct(base({ handle: "left" }), 76.8, { snap: false }), 40);

console.log("— 가운데 정렬은 2배 —");
eq("centered", resolveWidthPct(base({ centered: true }), 76.8, { snap: false }), 70);

console.log("— 축소된 스테이지 보정 —");
// scale 0.5 이면 화면상 38.4px 이 문서상 76.8px
eq("scale 0.5 보정", resolveWidthPct(base({ scale: 0.5 }), 38.4, { snap: false }), 60);

console.log("— 한계 —");
eq("100% 초과 불가", resolveWidthPct(base({ startPct: 95 }), 768, { snap: false }), 100);
eq("5% 미만 불가", resolveWidthPct(base({ startPct: 10 }), -768, { snap: false }), 5);

console.log("— 스냅 —");
eq("49 → 50", snapPct(49), 50);
eq("51.5 → 50", snapPct(51.5), 50);
eq("56 은 그대로", snapPct(56), 56);
eq("99 → 100", snapPct(99), 100);
eq("34 → 33.34", snapPct(34), 33.34);

console.log("— 높이 파생 (종횡비 고정) —");
eq("768폭 100% / 1080x4000", renderedHeight(768, 100, 1080, 4000), 2844.44, 0.5);
eq("50%면 절반", renderedHeight(768, 50, 1080, 4000), 1422.22, 0.5);
eq("모바일 340폭", renderedHeight(340, 100, 1080, 4000), 1259.26, 0.5);

console.log("— 스테이지 축소율 —");
eq("여유 있으면 1", stageScale(1100, 768), 1);
eq("딱 맞으면 1", stageScale(768, 768), 1);
eq("좁으면 비례", stageScale(384, 768), 0.5);
eq("확대 금지", stageScale(2000, 768), 1);

console.log("— 정규화 —");
eq("소수 2자리", normalizePct(33.333333), 33.33);
eq("clamp", clamp(120, 5, 100), 100);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
