/** 문서 모델 왕복 검증 — 레거시 마크다운 ↔ DetailDoc ↔ TipTap JSON */
import {
  docFromLegacyMarkdown, docToLegacyMarkdown, parseDetailDocJson,
  leadNodes, flowNodes, docIsEmpty,
} from "../src/lib/detail-doc-v2.ts";
import { docToTiptap, tiptapToDoc } from "../src/components/admin/detail-editor/tiptap-bridge.ts";

let pass = 0, fail = 0;
function ok(label: string, cond: boolean, extra = "") {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label} ${extra}`); }
}

// 운영 데이터와 같은 모양: 리드 문장 + 하이픈 목록 + 치수 표기 이미지들
const LEGACY = [
  "국산 여주분말을 넣은 특허 발효곤약에 백미·현미를 배합한 즉석 곤약밥입니다.",
  "- 1팩 150 g에 170 kcal, 식이섬유 9 g",
  "- **특허 제10-2547189호** 발효 곤약 페이스트 제조방법",
  "![맛있는 여주발효곤약밥 상세 이미지 1|1001x4000](https://ex.co/a.webp)",
  "![맛있는 여주발효곤약밥 상세 이미지 2|1001x3038](https://ex.co/b.webp)",
].join("\n");

console.log("— 레거시 → 문서 —");
const doc = docFromLegacyMarkdown(LEGACY);
ok("블록 4개(문단1+목록1+이미지2)", doc.blocks.length === 4, `got ${doc.blocks.length}`);
ok("모든 텍스트가 lead", doc.blocks.filter(b => b.type !== "image").every(b => (b as {lead?:boolean}).lead === true));
ok("이미지는 lead 아님", doc.blocks.filter(b => b.type === "image").every(b => !("lead" in b && (b as {lead?:boolean}).lead)));
ok("이미지 치수 보존", doc.blocks.filter(b=>b.type==="image").every(b=>(b as {width:number}).width===1001));
ok("이미지 widthPct 기본 100", doc.blocks.filter(b=>b.type==="image").every(b=>(b as {widthPct:number}).widthPct===100));
ok("굵게 파싱", JSON.stringify(doc).includes('"bold":true'));

console.log("— 무회귀: 하단 섹션은 이미지만 —");
ok("flowNodes 전부 이미지", flowNodes(doc).every(n => n.type === "image"), JSON.stringify(flowNodes(doc).map(n=>n.type)));
ok("leadNodes 전부 텍스트", leadNodes(doc).every(n => n.type !== "image"));
ok("flow 2장", flowNodes(doc).length === 2);

console.log("— 문서 → 레거시 미러 (왕복) —");
const mirror = docToLegacyMarkdown(doc);
ok("이미지 줄 그대로", mirror.includes("![맛있는 여주발효곤약밥 상세 이미지 1|1001x4000](https://ex.co/a.webp)"), mirror.slice(0,200));
ok("목록 하이픈 유지", mirror.includes("- 1팩 150 g에 170 kcal"));
ok("굵게 별표 복원", mirror.includes("**특허 제10-2547189호**"));
const doc2 = docFromLegacyMarkdown(mirror);
ok("재파싱 블록 수 동일", doc2.blocks.length === doc.blocks.length, `${doc2.blocks.length} vs ${doc.blocks.length}`);

console.log("— 문서 ↔ TipTap 왕복 —");
const pm = docToTiptap(doc);
const back = tiptapToDoc(pm);
ok("블록 수 보존", back.blocks.length === doc.blocks.length, `${back.blocks.length} vs ${doc.blocks.length}`);
ok("타입 순서 보존", JSON.stringify(back.blocks.map(b=>b.type)) === JSON.stringify(doc.blocks.map(b=>b.type)));
ok("lead 보존", JSON.stringify(back.blocks.map(b=>(b as {lead?:boolean}).lead===true)) === JSON.stringify(doc.blocks.map(b=>(b as {lead?:boolean}).lead===true)));
ok("이미지 src 보존", JSON.stringify(back.blocks.filter(b=>b.type==="image").map(b=>(b as {src:string}).src)) === JSON.stringify(["https://ex.co/a.webp","https://ex.co/b.webp"]));
ok("굵게 보존", JSON.stringify(back).includes('"bold":true'));
ok("blockId 보존", back.blocks.every((b,i)=>b.id===doc.blocks[i].id));
const mirror2 = docToLegacyMarkdown(back);
ok("TipTap 왕복 후 미러 동일", mirror2 === mirror, `\n--A--\n${mirror}\n--B--\n${mirror2}`);

console.log("— 줄바꿈 보존 (hardBreak) —");
const multi = docFromLegacyMarkdown("첫 줄\n둘째 줄");
ok("한 문단 안 두 줄", multi.blocks.length===1 && (multi.blocks[0] as {text:{text:string}[]}).text[0].text.includes("\n"));
const multiBack = tiptapToDoc(docToTiptap(multi));
ok("TipTap 왕복 후 줄바꿈 유지", JSON.stringify(multiBack.blocks) === JSON.stringify(multi.blocks), JSON.stringify(multiBack.blocks));

console.log("— jsonb 방어 —");
ok("null 거부", parseDetailDocJson(null) === null);
ok("version 틀리면 거부", parseDetailDocJson({version:1,blocks:[]}) === null);
ok("정상 통과", parseDetailDocJson(JSON.parse(JSON.stringify(doc)))?.blocks.length === 4);
ok("http 아닌 이미지 제거", parseDetailDocJson({version:2,blocks:[{type:"image",src:"javascript:alert(1)"}]})?.blocks.length === 0);
ok("빈 문서 판정", docIsEmpty({version:2,blocks:[]}) === true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
