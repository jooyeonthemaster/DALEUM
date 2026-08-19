/** 숨김 상품 하나에 '블로그형' v2 문서를 넣어 고객 렌더를 눈으로 확인한다. 되돌리기: --revert */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = {};
for (const l of readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { db: { schema: 'daleum' }, auth: { persistSession: false } });

const { docFromLegacyMarkdown } = await import('../src/lib/detail-doc-v2.ts');
const SLUG = process.argv[3] || 'martinjo-12kcal-rice';

const { data: p } = await db.from('products').select('slug,name,description,status').eq('slug', SLUG).maybeSingle();
if (!p) { const { data: all } = await db.from('products').select('slug,name,status').eq('status','hidden').limit(10);
  console.log('못 찾음. hidden 상품들:'); for (const r of all) console.log(' ', r.slug, '|', r.name); process.exit(1); }

if (process.argv[2] === '--revert') {
  await db.from('products').update({ description_doc: null }).eq('slug', SLUG);
  console.log('되돌림:', SLUG); process.exit(0);
}

const base = docFromLegacyMarkdown(p.description);
const imgs = base.blocks.filter(b => b.type === 'image');
const texts = base.blocks.filter(b => b.type !== 'image');

// 블로그형: 리드 한 칸만 구매박스에 남기고, 나머지 글을 사진 사이사이에 흘린다
const blocks = [];
if (texts[0]) blocks.push({ ...texts[0], lead: true });
blocks.push({ id: 'h-1', type: 'heading', level: 2, align: 'center', text: [{ text: '이렇게 만들었습니다' }] });
if (imgs[0]) blocks.push(imgs[0]);
blocks.push({ id: 'p-1', type: 'paragraph', align: 'left', size: 'base',
  text: [{ text: '발효 공정을 거치면 곤약 특유의 냄새가 줄고 ' }, { text: '식감이 탱글해집니다', bold: true }, { text: '.' }] });
if (texts[1]) blocks.push({ ...texts[1], lead: false });
blocks.push({ id: 'd-1', type: 'divider' });
blocks.push({ id: 'h-2', type: 'heading', level: 3, align: 'left', text: [{ text: '작게 넣은 사진 (폭 50%, 오른쪽)' }] });
if (imgs[1]) blocks.push({ ...imgs[1], widthPct: 50, align: 'right' });
blocks.push({ id: 'q-1', type: 'quote', text: [{ text: '낮은 칼로리지만 포만감은 꽉!' }] });
blocks.push({ id: 's-1', type: 'spacer', size: 'lg' });
for (const im of imgs.slice(2)) blocks.push(im);

const doc = { version: 2, blocks };
await db.from('products').update({ description_doc: doc }).eq('slug', SLUG);
console.log(`적용: ${p.name} (${SLUG}) — 블록 ${blocks.length}개, 사진 ${imgs.length}장`);
console.log(`확인: http://localhost:3210/products/${SLUG}`);
console.log('되돌리기: node --experimental-strip-types --import ./scripts/alias-hook.mjs scripts/_demo_v2_doc.mjs --revert ' + SLUG);
