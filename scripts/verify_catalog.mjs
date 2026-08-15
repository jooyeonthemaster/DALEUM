/**
 * 카탈로그 전수 검증 — 갤러리/상세 이미지 정합성 점검 (읽기 전용).
 *
 *  · 대표이미지 1장 · sort_order 0 인지
 *  · 갤러리에 상세 통이미지가 섞이지 않았는지 (세로비 임계 초과)
 *  · 상세 이미지 번호가 1..N 으로 연속인지
 *  · 모든 이미지 URL 이 실제로 응답하는지
 *
 * 실행: node scripts/verify_catalog.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = {};
for (const l of readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: 'daleum' },
  auth: { persistSession: false },
});

const IMG_RE = /^!\[([^\]]*?)(?:\|(\d+)x(\d+))?\]\((https?:\/\/.+)\)$/;
/** 갤러리 이미지 세로비 상한 — 이보다 길면 상세 통이미지가 섞인 것으로 본다 */
const MAX_GALLERY_RATIO = 2.5;

/** webp/jpeg/png 헤더만 읽어 치수를 얻는다 */
async function dims(url) {
  const res = await fetch(url, { headers: { Range: 'bytes=0-65535' } });
  if (!res.ok && res.status !== 206) return { status: res.status };
  const b = Buffer.from(await res.arrayBuffer());
  if (b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a')
    return { status: 200, w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') {
    const fmt = b.subarray(12, 16).toString();
    if (fmt === 'VP8X')
      return { status: 200, w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    if (fmt === 'VP8 ')
      return { status: 200, w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    if (fmt === 'VP8L') {
      const n = b.readUInt32LE(21);
      return { status: 200, w: (n & 0x3fff) + 1, h: ((n >> 14) & 0x3fff) + 1 };
    }
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length - 9) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      const len = b.readUInt16BE(i + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(m))
        return { status: 200, h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  }
  return { status: 200 };
}

const { data: products, error } = await db
  .from('products')
  .select('id, slug, name, status, supplier, description, product_images(*), product_variants(*)')
  .order('slug');
if (error) throw new Error(error.message);

let problems = 0;
const checks = [];

for (const p of products) {
  const imgs = [...(p.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const primaries = imgs.filter((i) => i.is_primary);
  const issues = [];

  if (imgs.length === 0) issues.push('갤러리 이미지 없음');
  if (imgs.length > 0 && primaries.length !== 1)
    issues.push(`대표이미지 ${primaries.length}개 (1개여야 함)`);
  if (primaries[0] && imgs[0]?.id !== primaries[0].id) issues.push('대표이미지가 첫 순서가 아님');
  if (imgs.some((i, idx) => i.sort_order !== idx)) issues.push('sort_order 가 0..n-1 이 아님');

  const detail = (p.description ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim().match(IMG_RE))
    .filter(Boolean);
  const nums = detail.map((m) => Number(m[4].match(/\/(\d+)\.webp$/)?.[1]));
  if (detail.length > 0 && !nums.every((n, i) => n === i + 1))
    issues.push(`상세 이미지 번호 불연속: ${nums.join(',')}`);

  checks.push({ p, imgs, detail, issues });
}

// ---------- URL + 치수 ----------
const all = [];
for (const c of checks) {
  for (const i of c.imgs) all.push({ slug: c.p.slug, kind: 'gallery', url: i.url, file: i.url.split('/').slice(-2).join('/') });
  for (const m of c.detail) all.push({ slug: c.p.slug, kind: 'detail', url: m[4], file: m[4].split('/').slice(-2).join('/') });
}
console.log(`상품 ${products.length}개 / 이미지 ${all.length}개 검사 중…\n`);

const measured = [];
for (let i = 0; i < all.length; i += 12) {
  const batch = all.slice(i, i + 12);
  measured.push(...(await Promise.all(batch.map(async (r) => ({ ...r, ...(await dims(r.url).catch((e) => ({ status: `ERR ${e.message}` }))) })))));
}

const dead = measured.filter((r) => r.status !== 200);
const tall = measured.filter((r) => r.kind === 'gallery' && r.w && r.h && r.h / r.w > MAX_GALLERY_RATIO);

console.log('='.repeat(88));
for (const c of checks) {
  const t = tall.filter((r) => r.slug === c.p.slug);
  const d = dead.filter((r) => r.slug === c.p.slug);
  const all2 = [...c.issues, ...t.map((r) => `갤러리에 세로 통이미지: ${r.file} ${r.w}x${r.h}`), ...d.map((r) => `이미지 응답 실패(${r.status}): ${r.file}`)];
  if (all2.length) {
    problems += all2.length;
    console.log(`\n✗ ${c.p.slug} [${c.p.status}]`);
    for (const m of all2) console.log(`    - ${m}`);
  }
}

console.log('\n' + '='.repeat(88));
console.log('요약');
console.log('='.repeat(88));
const bySupplier = {};
for (const c of checks) {
  const k = c.p.supplier ?? '(미지정)';
  bySupplier[k] ??= { n: 0, gallery: 0, detail: 0 };
  bySupplier[k].n++;
  bySupplier[k].gallery += c.imgs.length;
  bySupplier[k].detail += c.detail.length;
}
for (const [k, v] of Object.entries(bySupplier))
  console.log(`  ${k.padEnd(10)} 상품 ${String(v.n).padStart(2)}개 · 갤러리 ${String(v.gallery).padStart(3)}장 · 상세 ${String(v.detail).padStart(3)}장`);

const thin = checks.filter((c) => c.imgs.length === 1).map((c) => c.p.slug);
if (thin.length) console.log(`\n  참고 — 갤러리가 1장뿐인 상품 ${thin.length}개: ${thin.join(', ')}`);

console.log(`\n  이미지 응답 실패 ${dead.length}건 / 갤러리 세로 통이미지 ${tall.length}건`);
console.log(problems === 0 ? '\n✓ 문제 없음' : `\n✗ 문제 ${problems}건`);
