/** 저장 계약 검증: 폼 payload → API 정제(parseProductFields) → 저장될 값 */
import { parseProductFields } from "../src/app/api/admin/products/shared.ts";
import { docFromLegacyMarkdown, docToLegacyMarkdown, parseDetailDocJson, type DetailDoc } from "../src/lib/detail-doc-v2.ts";
import { docToTiptap, tiptapToDoc } from "../src/components/admin/detail-editor/tiptap-bridge.ts";

let pass = 0, fail = 0;
const ok = (l: string, c: boolean, extra = "") => { if (c) { pass++; console.log("  ok   " + l); } else { fail++; console.log("  FAIL " + l + " " + extra); } };

const LEGACY = [
  "발효곤약 메밀면에 냉면풍 육수를 더한 즉석조리식품입니다.",
  "- 총 내용량 330 g 한 그릇 45 kcal",
  "- **식이섬유 9.3 g** — 1일 기준치의 37 %",
  "![냉면인데 곤약 상세 이미지 1|1000x4000](https://ezmmutjazqsikopltmnj.supabase.co/storage/v1/object/public/products/a.webp)",
].join("\n");

const doc = docFromLegacyMarkdown(LEGACY);

console.log("— 신규 저장(POST) —");
const out = parseProductFields({
  name: "냉면인데 곤약", slug: "naengmyeon-test", price: 4900,
  description_doc: JSON.parse(JSON.stringify(doc)),
  description: "클라이언트가 보낸 엉뚱한 본문",
}, { partial: false });

ok("description_doc 저장됨", out.description_doc != null);
ok("미러가 문서에서 생성됨(클라이언트 값 무시)", out.description !== "클라이언트가 보낸 엉뚱한 본문");
ok("미러에 이미지 줄 포함", String(out.description).includes("![냉면인데 곤약 상세 이미지 1|1000x4000]"));
ok("미러에 목록 하이픈 포함", String(out.description).includes("- 총 내용량 330 g"));
ok("미러에 굵게 별표 복원", String(out.description).includes("**식이섬유 9.3 g**"));

console.log("— 저장값 다시 읽기(고객 화면 경로) —");
const reread = parseDetailDocJson(out.description_doc);
ok("jsonb 재파싱 성공", reread !== null);
ok("블록 수 보존", reread!.blocks.length === doc.blocks.length, `${reread!.blocks.length} vs ${doc.blocks.length}`);
ok("이미지 URL 보존", JSON.stringify(reread!.blocks.filter(b=>b.type==="image")) === JSON.stringify(doc.blocks.filter(b=>b.type==="image")));
ok("lead 보존", JSON.stringify(reread!.blocks.map(b=>(b as {lead?:boolean}).lead===true)) === JSON.stringify(doc.blocks.map(b=>(b as {lead?:boolean}).lead===true)));

console.log("— 편집기 왕복까지 포함한 전체 경로 —");
// 불러오기 → TipTap → 편집(폭 50%) → 저장 → 다시 읽기
const pm = docToTiptap(reread!);
const edited = tiptapToDoc(pm);
const withWidth: DetailDoc = { version: 2, blocks: edited.blocks.map(b => b.type === "image" ? { ...b, widthPct: 50, align: "right" as const } : b) };
const out2 = parseProductFields({ description_doc: JSON.parse(JSON.stringify(withWidth)) }, { partial: true });
const reread2 = parseDetailDocJson(out2.description_doc);
const img = reread2!.blocks.find(b => b.type === "image") as { widthPct: number; align: string };
ok("폭 50% 가 저장·복원됨", img.widthPct === 50, String(img.widthPct));
ok("정렬 right 가 저장·복원됨", img.align === "right", img.align);
ok("미러는 폭/정렬을 버린다(레거시 문법에 자리 없음)", !String(out2.description).includes("50"));

console.log("— 방어 —");
let threw = false;
try { parseProductFields({ description_doc: { version: 2, blocks: "not-an-array" } }, { partial: true }); } catch { threw = true; }
ok("망가진 문서는 거절", threw);
const nulled = parseProductFields({ description_doc: null }, { partial: true });
ok("null 이면 컬럼도 null", nulled.description_doc === null);

let tooBig = false;
try {
  const huge = { version: 2, blocks: Array.from({ length: 20000 }, (_, i) => ({ id: "x" + i, type: "paragraph", align: "left", size: "base", text: [{ text: "가".repeat(60) }] })) };
  parseProductFields({ description_doc: huge }, { partial: true });
} catch { tooBig = true; }
ok("너무 큰 문서는 거절", tooBig);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
