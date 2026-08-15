/**
 * 수다락 상품 판매 개시 + 카탈로그 구조 정리 (멱등 — 여러 번 실행해도 안전)
 *
 * 하는 일
 *  1) 용기형 곤약면 카테고리 확보 → 우동·모밀·냉면 재배치 (문안은 0005 확정본)
 *  2) 밥애쏙 상세이미지 복원 — 원본 gyb_01~14 중 02·09·14 가 누락돼 있었다.
 *     특히 gyb_14 는 법정 표시사항 표 전체라 반드시 들어가야 한다.
 *  3) 갤러리 정리 — 판매하지 않는 입수 구성 이미지 제거, 대표이미지 교체, 보강컷 추가
 *  4) brand / supplier 채우기 (컬럼이 있을 때만 — 0003 마이그레이션 선행 필요)
 *  5) 상태 전환: 수다락 7종·자체 13종 → active / B2B 벌크 7종 → draft(0원 결제 차단)
 *
 * 자산 소스: scratchpad/upload (prep_upload.py 산출물)
 * 실행: node scripts/sudarak_launch.mjs [--dry]
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');
const UPLOAD_DIR =
  'C:/Users/jooye/AppData/Local/Temp/claude/d--Desktop-2026project-DALEUM/42d64b74-60a0-4b3b-b606-292346313bf2/scratchpad/upload';

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

/* ============================================================
   설정
   ============================================================ */
const SUDARAK = [
  'yeoju-konjac-rice',
  'matissneun-yeoju-konjac-rice',
  'babssok-protein-konjac-rice',
  'paro-brown-rice',
  'udon-inde-konjac',
  'momil-inde-konjac',
  'naengmyeon-inde-konjac',
];
const OWN_B2C = [
  'ramen-spicy', 'ramen-kimchi', 'jjajang', 'bibim', 'soba', 'janchi',
  'semyeon', 'guksi', 'bunmoja',
  'ssalgonyak', 'rice-12kcal', 'baroban-oat', 'baroban-brownrice',
];
const B2B_BULK = [
  'bulk-konjac-rice-shape', 'bulk-fermented-rice-konjac', 'bulk-alpha-konjac-rice',
  'bulk-konjac-noodle', 'bulk-buckwheat-konjac-noodle', 'bulk-fermented-konjac-noodle-ksb',
  'konjac-paste',
];

/** 패키지에 인쇄된 소비자 브랜드 */
const BRAND = {
  'yeoju-konjac-rice': '당앤샵',
  'matissneun-yeoju-konjac-rice': '바비지요',
  'paro-brown-rice': '바비지요',
  'babssok-protein-konjac-rice': '밥애쏙',
  'udon-inde-konjac': '칼로리시즌',
  'momil-inde-konjac': '칼로리시즌',
  'naengmyeon-inde-konjac': '칼로리시즌',
};
for (const s of OWN_B2C) BRAND[s] = '마틴조';
for (const s of B2B_BULK) BRAND[s] = '다름';

const SUPPLIER = {};
for (const s of SUDARAK) SUPPLIER[s] = '수다락';
for (const s of [...OWN_B2C, ...B2B_BULK]) SUPPLIER[s] = '자체';

/** 밥애쏙 상세 14장 — 원본 gyb_01~14 순서·치수 */
const BABSSOK_DETAIL = [
  [1, 780, 2573], [2, 780, 1197], [3, 780, 2061], [4, 780, 2628], [5, 780, 2158],
  [6, 780, 2000], [7, 780, 2323], [8, 780, 2115], [9, 780, 1385], [10, 780, 2620],
  [11, 780, 2596], [12, 780, 2676], [13, 780, 2476], [14, 780, 1191],
];

/**
 * 갤러리 최종 구성 — [스토리지 파일명, alt]. 배열 첫 항목이 대표이미지.
 * 목록에 없는 기존 이미지 행은 삭제된다.
 */
const GALLERY = {
  'yeoju-konjac-rice': [
    ['3.webp', '여주발효곤약밥 패키지'],
    ['2.webp', '여주발효곤약밥 라벨 표시사항'],
    ['4.webp', '여주발효곤약밥 원재료 — 곤약쌀·건여주·여주'],
    ['5.webp', '여주발효곤약밥 원재료 — 곤약쌀과 건여주'],
    ['6.webp', '발효 곤약쌀'],
  ],
  'matissneun-yeoju-konjac-rice': [
    ['1.webp', '맛있는 여주발효곤약밥'],
    ['2.webp', '맛있는 여주발효곤약밥 패키지'],
    ['3.webp', '맛있는 여주발효곤약밥 연출컷'],
    ['4.webp', '맛있는 여주발효곤약밥 조리 예'],
    ['5.webp', '맛있는 여주발효곤약밥 한 술'],
    ['6.webp', '맛있는 여주발효곤약밥 개봉컷'],
    ['7.webp', '맛있는 여주발효곤약밥 상차림'],
  ],
  // 2.webp 는 1.webp 와 사실상 동일한 중복컷 — 제외
  'babssok-protein-konjac-rice': [
    ['1.webp', '밥애쏙 프로틴현미곤약밥'],
    ['3.webp', '밥애쏙 프로틴현미곤약밥 연출컷'],
    ['4.webp', '밥애쏙 프로틴현미곤약밥 조리 예'],
    ['5.webp', '밥애쏙 프로틴현미곤약밥 밥알 클로즈업'],
    ['6.webp', '밥애쏙 프로틴현미곤약밥 패키지와 조리 예'],
    ['7.webp', '밥애쏙 프로틴현미곤약밥 한 술'],
    ['8.webp', '밥애쏙 프로틴현미곤약밥 상차림'],
  ],
  // 7.webp 는 8.webp 와 같은 8입 구성인데 확대컷이 겹쳐 9개로 오독될 소지가 있어 제외.
  // 2.webp(면 클로즈업)는 면 색이 조리예와 달라 보이지만 제조사가 준 공식 '메인이미지_2' 라
  //   임의로 빼지 않고 순서만 뒤로 둔다 — 실물 대조는 판매자 확인 필요(리포트 참조).
  'udon-inde-konjac': [
    ['1.webp', '우동인데 곤약'],
    ['3.webp', '우동인데 곤약 조리 예'],
    ['2.webp', '우동인데 곤약 면 클로즈업'],
    ['4.webp', '우동인데 곤약 패키지'],
    ['6.webp', '우동인데 곤약 패키지'],
    ['5.webp', '우동인데 곤약 4입 구성'],
    ['8.webp', '우동인데 곤약 8입 구성'],
  ],
  // 3.webp(10입) · 4.webp(20입) 은 판매하지 않는 구성 — 제외. 대표는 제품 식별이 되는 단품컷으로.
  'momil-inde-konjac': [
    ['6.webp', '모밀인데 곤약'],
    ['1.webp', '모밀인데 곤약 면 클로즈업'],
    ['2.webp', '모밀인데 곤약 조리 예'],
    ['5.webp', '모밀인데 곤약 4입 구성'],
    ['7.webp', '모밀인데 곤약 8입 구성'],
  ],
  'naengmyeon-inde-konjac': [
    ['1.webp', '냉면인데 곤약'],
    ['2.webp', '냉면인데 곤약 조리 예'],
    ['3.webp', '냉면인데 곤약 한 그릇'],
    ['4.webp', '냉면인데 곤약 클로즈업'],
    ['5.webp', '냉면인데 곤약 라벨 표시사항'],
  ],
  'paro-brown-rice': [
    ['1.webp', '맛있는 저당 파로현미밥'],
    ['3.webp', '맛있는 저당 파로현미밥 구성'],
    ['4.webp', '맛있는 저당 파로현미밥 원재료'],
    ['2.webp', '맛있는 저당 파로현미밥 원재료 플랫레이'],
    ['5.webp', '맛있는 저당 파로현미밥 상차림'],
  ],
};

/** 업로드할 신규 자산 (로컬 상대경로 = 스토리지 daleum/ 하위 경로) */
const UPLOADS = [
  ...BABSSOK_DETAIL.map(([n]) => `babssok-protein-konjac-rice/detail/${n}.webp`),
  'yeoju-konjac-rice/gallery/3.webp',
  'yeoju-konjac-rice/gallery/4.webp',
  'yeoju-konjac-rice/gallery/5.webp',
  'yeoju-konjac-rice/gallery/6.webp',
  ...[2, 3, 4, 5, 6, 7].map((n) => `matissneun-yeoju-konjac-rice/gallery/${n}.webp`),
];

/* ============================================================
   실행
   ============================================================ */
async function main() {
  log(`=== 수다락 판매 개시 ${DRY ? '(DRY RUN)' : ''} ===\n`);

  // ---------- 0) brand/supplier 컬럼 존재 확인 ----------
  const probe = await db.from('products').select('id, brand, supplier').limit(1);
  const hasBrand = !probe.error;
  if (!hasBrand) {
    warn('brand/supplier 컬럼 없음 — supabase/migrations/0003 을 먼저 적용하세요. 이번 실행은 건너뜁니다.');
    warn(`   (${probe.error.message})`);
  }

  // ---------- 1) 카테고리 ----------
  const { data: catRow, error: catErr } = await db
    .from('categories')
    .upsert(
      {
        // 이름·설명은 0005 확정 문안. '데우기만 하면 되는'은 3종이 함께 안내하는
        // 실온·냉취식을 배제하고, 멤버 열거는 상품이 들고 날 때 거짓이 된다.
        slug: 'instant-noodles',
        name: '용기형 곤약면',
        description: '국물·소스까지 용기에 담긴 한 그릇 — 데워도, 차게도',
        sort_order: 3,
        is_active: true,
      },
      { onConflict: 'slug' }
    )
    .select('id, slug, name')
    .single();
  if (catErr) throw new Error(`카테고리 생성 실패: ${catErr.message}`);
  log(`[1] 카테고리 확보: ${catRow.name} (${catRow.slug})`);
  if (!DRY) {
    await db.from('categories').update({ sort_order: 4 }).eq('slug', 'rice');
    await db.from('categories').update({ sort_order: 5 }).eq('slug', 'bulk');
  }

  // ---------- 2) 스토리지 업로드 ----------
  log(`\n[2] 스토리지 업로드 (${UPLOADS.length}개)`);
  let uploaded = 0;
  for (const rel of UPLOADS) {
    const local = path.join(UPLOAD_DIR, rel);
    if (!existsSync(local)) {
      warn(`소스 없음, 건너뜀: ${rel}`);
      continue;
    }
    if (DRY) { uploaded++; continue; }
    const { error } = await storage.upload(`daleum/${rel}`, readFileSync(local), {
      contentType: 'image/webp',
      upsert: true,
    });
    if (error) warn(`업로드 실패 ${rel}: ${error.message}`);
    else uploaded++;
  }
  log(`    업로드 완료: ${uploaded}/${UPLOADS.length}`);

  // ---------- 3) 상품 로드 ----------
  const slugs = [...SUDARAK, ...OWN_B2C, ...B2B_BULK];
  const { data: products, error: pErr } = await db
    .from('products')
    .select('id, slug, name, description, status, category_id')
    .in('slug', slugs);
  if (pErr) throw new Error(`상품 조회 실패: ${pErr.message}`);
  const bySlug = Object.fromEntries(products.map((p) => [p.slug, p]));
  const missing = slugs.filter((s) => !bySlug[s]);
  if (missing.length) warn(`DB에 없는 slug: ${missing.join(', ')}`);

  // ---------- 4) 밥애쏙 상세 이미지 복원 ----------
  log('\n[3] 밥애쏙 상세이미지 복원 (11장 → 14장)');
  const bab = bySlug['babssok-protein-konjac-rice'];
  if (bab) {
    const IMG_LINE = /^!\[.*?\]\(https?:\/\/.*\/babssok-protein-konjac-rice\/detail\/.*\)$/;
    const lines = (bab.description ?? '').replace(/\r\n/g, '\n').split('\n');
    const firstImg = lines.findIndex((l) => IMG_LINE.test(l.trim()));
    const oldCount = lines.filter((l) => IMG_LINE.test(l.trim())).length;
    const kept = lines.filter((l) => !IMG_LINE.test(l.trim()));
    // 이미지 블록이 있던 자리(텍스트 끝)에 새 14장을 다시 깐다
    while (kept.length && kept[kept.length - 1].trim() === '') kept.pop();
    const block = BABSSOK_DETAIL.map(
      ([n, w, h]) =>
        `![밥애쏙 프로틴현미곤약밥 상세 이미지 ${n}|${w}x${h}](${pub(
          `babssok-protein-konjac-rice/detail/${n}.webp`
        )})`
    );
    const next = [...kept, '', ...block.flatMap((b, i) => (i === 0 ? [b] : ['', b]))].join('\n');
    log(`    기존 상세이미지 ${oldCount}장 → 새 ${BABSSOK_DETAIL.length}장 (본문 텍스트 뒤 index ${firstImg} 자리)`);
    if (!DRY) {
      const { error } = await db.from('products').update({ description: next }).eq('id', bab.id);
      if (error) warn(`밥애쏙 description 갱신 실패: ${error.message}`);
      else log('    description 갱신 완료 — gyb_02·09·14(법정 표시사항 표 포함) 복원');
    }
  }

  // ---------- 5) 갤러리 재구성 ----------
  log('\n[4] 갤러리 재구성');
  for (const [slug, wanted] of Object.entries(GALLERY)) {
    const p = bySlug[slug];
    if (!p) continue;
    const { data: rows } = await db
      .from('product_images')
      .select('id, url, sort_order, is_primary')
      .eq('product_id', p.id);
    const byFile = {};
    for (const r of rows ?? []) byFile[r.url.split('/').pop()] = r;

    const wantedFiles = new Set(wanted.map(([f]) => f));
    const removed = (rows ?? []).filter((r) => !wantedFiles.has(r.url.split('/').pop()));
    const added = wanted.filter(([f]) => !byFile[f]);

    if (!DRY) {
      if (removed.length)
        await db.from('product_images').delete().in('id', removed.map((r) => r.id));
      for (let i = 0; i < wanted.length; i++) {
        const [file, alt] = wanted[i];
        const row = byFile[file];
        const patch = { alt, sort_order: i, is_primary: i === 0 };
        if (row) await db.from('product_images').update(patch).eq('id', row.id);
        else
          await db.from('product_images').insert({
            product_id: p.id,
            url: pub(`${slug}/gallery/${file}`),
            ...patch,
          });
      }
    }
    log(
      `    ${slug}: ${rows?.length ?? 0}장 → ${wanted.length}장 ` +
        `(대표 ${wanted[0][0]}${removed.length ? ` / 제거 ${removed.map((r) => r.url.split('/').pop()).join(',')}` : ''}` +
        `${added.length ? ` / 추가 ${added.map((a) => a[0]).join(',')}` : ''})`
    );
  }

  // ---------- 6) 카테고리 재배치 + 상태/브랜드 ----------
  log('\n[5] 카테고리·상태·브랜드 반영');
  const updates = [];
  for (const slug of SUDARAK) {
    const patch = { status: 'active' };
    if (['udon-inde-konjac', 'momil-inde-konjac', 'naengmyeon-inde-konjac'].includes(slug))
      patch.category_id = catRow.id;
    updates.push([slug, patch]);
  }
  for (const slug of OWN_B2C) updates.push([slug, { status: 'active' }]);
  // B2B 벌크는 가격이 0원인 채로 active 라 0원 결제가 가능했다 → 시드 원래 의도대로 draft 로 되돌린다
  for (const slug of B2B_BULK) updates.push([slug, { status: 'draft' }]);

  for (const [slug, patch] of updates) {
    const p = bySlug[slug];
    if (!p) continue;
    if (hasBrand) {
      patch.brand = BRAND[slug] ?? null;
      patch.supplier = SUPPLIER[slug] ?? null;
    }
    if (!DRY) {
      const { error } = await db.from('products').update(patch).eq('id', p.id);
      if (error) warn(`${slug} 갱신 실패: ${error.message}`);
    }
  }
  log(`    수다락 ${SUDARAK.length}종 → active (우동·모밀·냉면은 용기형 곤약면으로 이동)`);
  log(`    자체 B2C ${OWN_B2C.length}종 → active`);
  log(`    B2B 벌크 ${B2B_BULK.length}종 → draft (0원 노출/결제 차단)`);
  if (hasBrand) log('    brand / supplier 채움');

  log(`\n=== 완료 ${DRY ? '(DRY RUN — 아무것도 쓰지 않음)' : ''} ===`);
}

main().catch((e) => {
  console.error('[FAIL]', e.message);
  process.exitCode = 1;
});
