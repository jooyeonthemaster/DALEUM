/**
 * 갤러리에 잘못 들어간 상세 통이미지를 상세 섹션으로 옮긴다 (멱등).
 *
 * 문제: daleum.net 크롤로 시딩한 마틴조 자체 상품 13종은 상세페이지 통이미지
 * (1600 × 18,700~24,800px)가 product_images 두 번째 칸에 그대로 들어가 있었다.
 * 갤러리는 정사각에 가까운 상품컷을 전제로 하므로, 썸네일 스트립과 확대 뷰에
 * 세로 2만 px 짜리가 걸려 상품 사진 구실을 못 했다. 상세 설명(description)에는
 * 정작 이미지가 한 장도 없었다.
 *
 * 조치: 통이미지를 폭 1,080 · 4,000px 단위로 잘라 detail/ 로 올리고
 * description 마크다운 이미지로 붙인 뒤, 갤러리 행은 제거한다.
 * (수다락 상품 상세와 동일한 규격 — 렌더 경로가 같다)
 *
 * 자산: scratchpad/upload_detail (slice_tall.py 산출물) + detail_plan.json
 * 실행: node scripts/fix_tall_gallery_images.mjs [--dry]
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');
const SCRATCH =
  'C:/Users/jooye/AppData/Local/Temp/claude/d--Desktop-2026project-DALEUM/42d64b74-60a0-4b3b-b606-292346313bf2/scratchpad';
const PLAN_FILE = path.join(SCRATCH, 'detail_plan.json');
const ASSET_DIR = path.join(SCRATCH, 'upload_detail');

const env = {};
for (const l of readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const db = createClient(SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: 'daleum' },
  auth: { persistSession: false },
});
const storage = createClient(SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
}).storage.from('products');

const pub = (rel) => `${SUPABASE_URL}/storage/v1/object/public/products/daleum/${rel}`;
const log = (...a) => console.log(...a);
const warn = (...a) => console.warn('  [!]', ...a);

const plan = JSON.parse(readFileSync(PLAN_FILE, 'utf8'));
const slugs = Object.keys(plan);

/** description 안의 해당 상품 detail 이미지 라인 (재실행 시 교체 대상) */
const detailLineRe = (slug) =>
  new RegExp(`^!\\[.*?\\]\\(https?://.*/${slug}/detail/.*\\)$`);

async function main() {
  log(`=== 상세 통이미지 갤러리 → 상세 이동 ${DRY ? '(DRY RUN)' : ''} ===`);
  log(`대상 ${slugs.length}개 상품 / 슬라이스 ${Object.values(plan).reduce((n, v) => n + v.slices.length, 0)}장\n`);

  const { data: products, error } = await db
    .from('products')
    .select('id, slug, name, description')
    .in('slug', slugs);
  if (error) throw new Error(`상품 조회 실패: ${error.message}`);
  const bySlug = Object.fromEntries(products.map((p) => [p.slug, p]));

  for (const slug of slugs) {
    const p = bySlug[slug];
    if (!p) {
      warn(`DB에 없는 slug: ${slug}`);
      continue;
    }
    const entry = plan[slug];

    // ---------- 1) 슬라이스 업로드 ----------
    let uploaded = 0;
    for (const s of entry.slices) {
      const rel = `${slug}/detail/${s.n}.webp`;
      const local = path.join(ASSET_DIR, slug, 'detail', `${s.n}.webp`);
      if (!existsSync(local)) {
        warn(`소스 없음: ${rel}`);
        continue;
      }
      if (DRY) {
        uploaded++;
        continue;
      }
      const { error: upErr } = await storage.upload(`daleum/${rel}`, readFileSync(local), {
        contentType: 'image/webp',
        upsert: true,
      });
      if (upErr) warn(`업로드 실패 ${rel}: ${upErr.message}`);
      else uploaded++;
    }

    // ---------- 2) description 에 상세 이미지 붙이기 ----------
    const re = detailLineRe(slug);
    const lines = (p.description ?? '').replace(/\r\n/g, '\n').split('\n');
    const kept = lines.filter((l) => !re.test(l.trim()));
    while (kept.length && kept[kept.length - 1].trim() === '') kept.pop();
    const block = entry.slices.map(
      (s) => `![${p.name} 상세 이미지 ${s.n}|${s.w}x${s.h}](${pub(`${slug}/detail/${s.n}.webp`)})`
    );
    const nextDescription = [...kept, '', ...block.flatMap((b, i) => (i === 0 ? [b] : ['', b]))].join('\n');

    // ---------- 3) 갤러리에서 통이미지 행 제거 + 재정렬 ----------
    const { data: imgs } = await db
      .from('product_images')
      .select('id, url, sort_order, is_primary')
      .eq('product_id', p.id);
    const remaining = (imgs ?? [])
      .filter((i) => i.id !== entry.gallery_image_id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
    const removed = (imgs ?? []).length - remaining.length;

    if (!DRY) {
      const { error: dErr } = await db
        .from('products')
        .update({ description: nextDescription })
        .eq('id', p.id);
      if (dErr) warn(`${slug} description 갱신 실패: ${dErr.message}`);

      if (removed > 0) {
        await db.from('product_images').delete().eq('id', entry.gallery_image_id);
      }
      for (let i = 0; i < remaining.length; i++) {
        await db
          .from('product_images')
          .update({ sort_order: i, is_primary: i === 0 })
          .eq('id', remaining[i].id);
      }
    }

    log(
      `  ${slug.padEnd(20)} 상세 ${entry.slices.length}장 업로드 ${uploaded}/${entry.slices.length} · ` +
        `갤러리 ${(imgs ?? []).length}→${remaining.length}장${removed ? ' (통이미지 제거)' : ' (이미 제거됨)'}`
    );
  }

  log(`\n=== 완료 ${DRY ? '(DRY RUN — 쓰기 없음)' : ''} ===`);
}

main().catch((e) => {
  console.error('[FAIL]', e.message);
  process.exitCode = 1;
});
