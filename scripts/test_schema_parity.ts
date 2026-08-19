/** 편집 캔버스 스키마가 고객 렌더러와 같은 클래스를 내는지 검사 (DOM 없이 toDOM 만 본다) */
import { getSchema } from "@tiptap/core";
import { buildExtensions } from "../src/components/admin/detail-editor/extensions.ts";
import { docToTiptap } from "../src/components/admin/detail-editor/tiptap-bridge.ts";
import { FLOW, BOLD_CLASS, ALIGN_CLASS, SPACER_HEIGHT, flowSizeClass } from "../src/components/catalog/detail-prose.ts";
import type { DetailDoc } from "../src/lib/detail-doc-v2.ts";

let pass = 0, fail = 0;
function ok(label: string, cond: boolean, extra = "") {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label} ${extra}`); }
}

const schema = getSchema(buildExtensions());

console.log("— 스키마 좁히기 —");
ok('blockquote content === "paragraph"', schema.nodes.blockquote.spec.content === "paragraph", String(schema.nodes.blockquote.spec.content));
ok('listItem content === "paragraph"', schema.nodes.listItem.spec.content === "paragraph", String(schema.nodes.listItem.spec.content));
// 문단 두 개를 인용에 넣으려 하면 스키마가 막아야 한다
const p = (t: string) => schema.nodes.paragraph.create(null, t ? schema.text(t) : undefined);
let twoParas = false;
try { schema.nodes.blockquote.createChecked(null, [p("a"), p("b")]); twoParas = true; } catch { twoParas = false; }
ok("인용 안 문단 2개는 거부", !twoParas);
let nestedList = false;
try {
  schema.nodes.listItem.createChecked(null, [p("a"), schema.nodes.bulletList.create(null, schema.nodes.listItem.create(null, p("b")))]);
  nestedList = true;
} catch { nestedList = false; }
ok("목록칸 안 중첩 목록은 거부", !nestedList);

console.log("— 클래스 주입 —");
const doc: DetailDoc = {
  version: 2,
  blocks: [
    { id: "h2", type: "heading", level: 2, align: "center", text: [{ text: "큰제목" }] },
    { id: "h3", type: "heading", level: 3, align: "left", text: [{ text: "작은제목" }] },
    { id: "p1", type: "paragraph", align: "right", size: "lg", text: [{ text: "본문", bold: true }] },
    { id: "p2", type: "paragraph", align: "left", size: "base", text: [{ text: "기본본문" }] },
    { id: "ul", type: "list", ordered: false, items: [[{ text: "가" }]] },
    { id: "ol", type: "list", ordered: true, items: [[{ text: "나" }]] },
    { id: "q", type: "quote", text: [{ text: "인용" }] },
    { id: "hr", type: "divider" },
    { id: "sp", type: "spacer", size: "lg" },
  ],
};
const pmDoc = schema.nodeFromJSON(docToTiptap(doc));

type DomSpec = [string, Record<string, string>, ...unknown[]];
function domOf(index: number): DomSpec {
  const node = pmDoc.child(index);
  const toDOM = node.type.spec.toDOM;
  if (!toDOM) throw new Error(`toDOM 없음: ${node.type.name}`);
  return toDOM(node) as unknown as DomSpec;
}
function classOf(index: number): string {
  return domOf(index)[1]?.class ?? "";
}

ok("h2 = FLOW.heading2 + 정렬", classOf(0).includes(FLOW.heading2) && classOf(0).includes(ALIGN_CLASS.center), classOf(0));
ok("h3 = FLOW.heading3", classOf(1).includes(FLOW.heading3) && classOf(1).includes(ALIGN_CLASS.left), classOf(1));
ok("문단 = FLOW.paragraph + 크기 + 정렬", classOf(2).includes(FLOW.paragraph) && classOf(2).includes(flowSizeClass("lg")) && classOf(2).includes(ALIGN_CLASS.right), classOf(2));
ok("기본 문단에도 크기/정렬 클래스가 붙는다", classOf(3).includes(flowSizeClass("base")) && classOf(3).includes(ALIGN_CLASS.left), classOf(3));
/* 마커는 항목이 아니라 **목록**에 붙는다 — TipTap 에서 listItem 클래스는 스키마에
   하나로 고정돼 부모가 ul 인지 ol 인지 구분할 수 없기 때문이다(detail-prose.ts 참고).
   고객 렌더러도 같은 상수를 같은 자리에 붙이므로 두 화면이 갈라질 수 없다. */
ok(
  "bulletList = FLOW.list + 불릿 마커",
  classOf(4).includes(FLOW.list) && classOf(4).includes(FLOW.bulletList),
  classOf(4)
);
ok(
  "orderedList = FLOW.list + 번호 마커(카운터)",
  classOf(5).includes(FLOW.list) && classOf(5).includes(FLOW.orderedList),
  classOf(5)
);
ok(
  "번호 목록에 list-decimal 을 쓰지 않는다(마커가 칼럼 밖으로 나간다)",
  !classOf(5).includes("list-decimal"),
  classOf(5)
);
ok("blockquote = FLOW.quote", classOf(6) === FLOW.quote, classOf(6));
ok("divider = FLOW.divider(+border-0)", classOf(7).includes(FLOW.divider) && classOf(7).includes("border-0"), classOf(7));
// 높이는 캔버스(EditorStage 의 SPACER_RULES)가 칠한다. 노드는 그 선택자가 물 표식만 낸다.
ok("spacer 는 data-spacer + data-size 를 낸다", domOf(8)[1]?.["data-spacer"] === "" && domOf(8)[1]?.["data-size"] === "lg", JSON.stringify(domOf(8)[1]));
ok("캔버스 규칙이 그 크기를 안다", SPACER_HEIGHT.lg > 0);

const li = pmDoc.child(4).child(0);
const liDom = li.type.spec.toDOM!(li) as unknown as DomSpec;
ok(
  "listItem = FLOW.listItem (마커는 목록이 붙인다)",
  (liDom[1]?.class ?? "").includes(FLOW.listItem),
  liDom[1]?.class
);

const boldMark = schema.marks.bold.create();
const boldDom = schema.marks.bold.spec.toDOM!(boldMark, true) as unknown as DomSpec;
ok("bold = BOLD_CLASS", (boldDom[1]?.class ?? "") === BOLD_CLASS, JSON.stringify(boldDom[1]));

console.log("— 이미지 출처 문지기 —");
type FakeEl = { getAttribute: (name: string) => string | null };
const imgRule = (schema.nodes.detailImage.spec.parseDOM ?? [])[0] as { getAttrs?: (el: FakeEl) => unknown };
function tryImg(src: string): boolean {
  const el: FakeEl = { getAttribute: (name) => (name === "src" ? src : null) };
  return imgRule.getAttrs!(el) !== false;
}
ok("supabase 공개 버킷 통과", tryImg("https://ezmmutjazqsikopltmnj.supabase.co/storage/v1/object/public/products/a.webp"));
ok("www.daleum.net 통과", tryImg("https://www.daleum.net/img/a.png"));
ok("supabase 비공개 경로 차단", !tryImg("https://ezmmutjazqsikopltmnj.supabase.co/storage/v1/object/sign/x.webp"));
ok("외부 https 차단", !tryImg("https://evil.example.com/a.png"));
ok("data: 차단", !tryImg("data:image/png;base64,AAAA"));
ok("blob: 차단", !tryImg("blob:http://localhost:3210/abc"));
ok("상대경로 차단", !tryImg("/local.png"));
ok("http(비암호화) 차단", !tryImg("http://www.daleum.net/a.png"));

console.log("— 붙여넣기 id 중복 —");
const pRule = (schema.nodes.paragraph.spec.parseDOM ?? [])[0] as { getAttrs?: (el: FakeEl) => unknown };
const pasted = pRule.getAttrs!({ getAttribute: (n) => (n === "data-block-id" ? "blk_dup" : null) }) as Record<string, unknown>;
ok("복사한 문단은 blockId 를 물고 오지 않는다", pasted.blockId === undefined || pasted.blockId === null, JSON.stringify(pasted));

console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
