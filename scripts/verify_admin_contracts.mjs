/**
 * 관리자 화면이 의존하는 계약을 전수 점검한다 (읽기 전용).
 *
 * verify_catalog.mjs 가 "이미지가 제자리에 있는가" 를 본다면, 이 스크립트는
 * **관리자 화면이 만들어 내는 값이 고객 화면이 읽을 수 있는 형태인가** 를 본다.
 * 상세페이지를 블록 편집기로 바꾸면서 저장 형식(description 마크다운)은 그대로 두었기 때문에,
 * 그 형식이 어긋나면 고객 상세페이지가 조용히 망가진다 — 그걸 배포 전에 잡기 위한 계기다.
 *
 * 점검 항목
 *   1) 상세 이미지 줄에 |가로x세로 치수가 붙어 있는가
 *      (없으면 next/image 가 공칭값 1080x4000 으로 자리를 잡았다가 로드 후 튄다)
 *   2) 상세 이미지 alt 번호가 1..N 으로 연속인가
 *   3) description 을 블록으로 읽었다가 되쓰면 렌더 결과가 같은가 (왕복 무손실)
 *   4) 영양·스펙 값이 API 한도(키 60자 / 값 2,000자 / 항목 60개) 안에 있는가
 *      — 옛 코드는 200자에서 말없이 잘랐고, 실제로 9개 값이 잘릴 상태였다
 *   5) 판매중인데 판매가가 0원인 상품이 없는가
 *   6) 주소(slug)가 ASCII 인가 — 한글 주소는 라우트에서 404 가 된다
 *
 * 실행: node scripts/verify_admin_contracts.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = {};
for (const line of readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: 'daleum' },
  auth: { persistSession: false },
});

/* ── 고객 화면(components/catalog/DescriptionBlock.tsx)과 같은 규칙 ── */
const IMAGE_RE = /^!\[([^\]]*?)(?:\|(\d+)x(\d+))?\]\((https?:\/\/.+)\)$/;
const HEADING_RE = /^#{1,3}\s+(.+)$/;
const LIST_RE = /^[-•*]\s+(.+)$/;

/** 고객 화면이 실제로 그리게 될 모양 — 비교 기준 */
function renderModel(text) {
  const nodes = [];
  let buffer = [];
  const flush = () => {
    if (buffer.some((l) => l.trim() !== '')) nodes.push(...parseStory(buffer.join('\n')));
    buffer = [];
  };
  for (const raw of (text ?? '').replace(/\r\n/g, '\n').split('\n')) {
    const m = raw.trim().match(IMAGE_RE);
    if (m) {
      flush();
      const pic = { alt: m[1], url: m[4], w: Number(m[2]) || 1080, h: Number(m[3]) || 4000 };
      const last = nodes[nodes.length - 1];
      if (last && last.type === 'images') last.images.push(pic);
      else nodes.push({ type: 'images', images: [pic] });
    } else buffer.push(raw);
  }
  flush();
  return nodes;
}

function parseStory(story) {
  const blocks = [];
  let para = [];
  let list = [];
  const fp = () => { if (para.length) { blocks.push({ type: 'paragraph', lines: para }); para = []; } };
  const fl = () => { if (list.length) { blocks.push({ type: 'list', items: list }); list = []; } };
  for (const raw of story.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) { fp(); fl(); continue; }
    const h = line.match(HEADING_RE);
    if (h) { fp(); fl(); blocks.push({ type: 'heading', text: h[1] }); continue; }
    const it = line.match(LIST_RE);
    if (it) { fp(); list.push(it[1]); continue; }
    fl(); para.push(line);
  }
  fp(); fl();
  return blocks;
}

/** lib/detail-doc.ts 와 같은 규칙 — 스크립트에서 .ts 를 import 하지 않으려고 여기 옮겨 둔다 */
function parseBlocks(raw) {
  const blocks = [];
  let para = [], list = [];
  const fp = () => { if (para.length) { blocks.push({ type: 'paragraph', text: para.join('\n') }); para = []; } };
  const fl = () => { if (list.length) { blocks.push({ type: 'list', items: list }); list = []; } };
  for (const rawLine of (raw ?? '').replace(/\r\n/g, '\n').split('\n')) {
    const line = rawLine.trim();
    const img = line.match(IMAGE_RE);
    if (img) {
      fp(); fl();
      blocks.push({ type: 'image', alt: img[1] ?? '', url: img[4], width: Number(img[2]) || 1080, height: Number(img[3]) || 4000 });
      continue;
    }
    if (!line) { fp(); fl(); continue; }
    const h = line.match(HEADING_RE);
    if (h) { fp(); fl(); blocks.push({ type: 'heading', text: h[1] }); continue; }
    const it = line.match(LIST_RE);
    if (it) { fp(); list.push(it[1]); continue; }
    fl(); para.push(line);
  }
  fp(); fl();
  return blocks;
}

function serializeBlocks(blocks) {
  const chunks = [];
  for (const b of blocks) {
    if (b.type === 'heading') { const t = b.text.replace(/\s+/g, ' ').trim(); if (t) chunks.push(`## ${t}`); continue; }
    if (b.type === 'list') {
      const items = b.items.map((i) => i.replace(/\s+/g, ' ').trim()).filter(Boolean);
      if (items.length) chunks.push(items.map((i) => `- ${i}`).join('\n'));
      continue;
    }
    if (b.type === 'image') {
      if (!b.url) continue;
      const alt = b.alt.replace(/[[\]|]/g, ' ').replace(/\s+/g, ' ').trim();
      const dims = b.width > 0 && b.height > 0 ? `|${b.width}x${b.height}` : '';
      chunks.push(`![${alt}${dims}](${b.url})`);
      continue;
    }
    const text = b.text.replace(/\r\n/g, '\n').split('\n').map((l) => l.trim())
      .filter((l, i, arr) => l !== '' || (i > 0 && i < arr.length - 1)).join('\n').trim();
    if (text) chunks.push(text);
  }
  return chunks.join('\n\n');
}

/* ── API 한도 (api/admin/products/shared.ts 와 같아야 한다) ── */
const KV_KEY_MAX = 60;
const KV_VALUE_MAX = 2_000;
const KV_MAX_ITEMS = 60;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const { data: products, error } = await db
  .from('products')
  .select('id, slug, name, status, price, supplier, description, story, specs, nutrition')
  .order('slug');
if (error) throw new Error(error.message);

const problems = [];
const add = (slug, kind, msg) => problems.push({ slug, kind, msg });

for (const p of products) {
  // 1·2) 상세 이미지 치수·번호
  const lines = (p.description ?? '').replace(/\r\n/g, '\n').split('\n').map((l) => l.trim());
  const images = lines.map((l) => l.match(IMAGE_RE)).filter(Boolean);
  images.forEach((m, i) => {
    if (!m[2] || !m[3]) add(p.slug, '치수누락', `상세 이미지 ${i + 1}번에 |가로x세로 표기가 없다 — 고객 화면에서 이미지가 튄다`);
    const n = Number((m[1] ?? '').match(/(\d+)\s*$/)?.[1]);
    if (Number.isFinite(n) && n !== i + 1) add(p.slug, '번호불연속', `상세 이미지 ${i + 1}번째의 설명 번호가 ${n}`);
  });

  // 3) 왕복 무손실
  for (const [field, text] of [['상세페이지', p.description], ['브랜드 스토리', p.story]]) {
    if (!text) continue;
    const round = serializeBlocks(parseBlocks(text));
    if (JSON.stringify(renderModel(text)) !== JSON.stringify(renderModel(round))) {
      add(p.slug, '왕복손실', `${field}: 관리자에서 열었다 저장하면 고객 화면 결과가 달라진다`);
    }
  }

  // 4) 영양·스펙 한도
  for (const [field, rec] of [['스펙', p.specs], ['영양', p.nutrition]]) {
    const entries = Object.entries(rec ?? {});
    if (entries.length > KV_MAX_ITEMS) add(p.slug, '항목초과', `${field} 항목 ${entries.length}개 (상한 ${KV_MAX_ITEMS})`);
    for (const [k, v] of entries) {
      if (k.length > KV_KEY_MAX) add(p.slug, '키초과', `${field} 항목명 "${k.slice(0, 20)}…" ${k.length}자 (상한 ${KV_KEY_MAX})`);
      if (typeof v === 'string' && v.length > KV_VALUE_MAX) {
        add(p.slug, '값초과', `${field} "${k}" 값 ${v.length}자 (상한 ${KV_VALUE_MAX}) — 저장이 거절된다`);
      }
    }
  }

  // 5) 0원 판매
  if (p.status === 'active' && (p.price ?? 0) <= 0) add(p.slug, '0원판매', `판매중인데 판매가가 ${p.price}원`);

  // 6) 주소
  if (!SLUG_RE.test(p.slug)) add(p.slug, '주소형식', `주소에 영문 소문자·숫자·하이픈 외 문자가 있다 — 상세페이지가 404 가 된다`);
}

/* ── 보고 ── */
const byKind = {};
for (const p of problems) (byKind[p.kind] ??= []).push(p);

console.log('='.repeat(78));
console.log(`관리자 계약 점검 — 상품 ${products.length}개`);
console.log('='.repeat(78));
for (const [kind, list] of Object.entries(byKind).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n[${kind}] ${list.length}건`);
  for (const p of list.slice(0, 10)) console.log(`   · ${p.slug.padEnd(32)} ${p.msg}`);
  if (list.length > 10) console.log(`   … 외 ${list.length - 10}건`);
}

const bySupplier = {};
for (const p of products) {
  const k = p.supplier ?? '(미지정)';
  bySupplier[k] ??= { n: 0, detail: 0 };
  bySupplier[k].n++;
  bySupplier[k].detail += ((p.description ?? '').match(/^!\[/gm) ?? []).length;
}
console.log('\n' + '-'.repeat(78));
for (const [k, v] of Object.entries(bySupplier)) {
  console.log(`  ${k.padEnd(10)} 상품 ${String(v.n).padStart(2)}개 · 상세 이미지 ${String(v.detail).padStart(3)}장`);
}

console.log('\n' + '='.repeat(78));
console.log(problems.length === 0 ? '✓ 계약 위반 없음' : `✗ 계약 위반 ${problems.length}건`);
process.exitCode = problems.length === 0 ? 0 : 1;
