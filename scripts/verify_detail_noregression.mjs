/**
 * 상세페이지 무회귀 지문 — 고객 화면의 「상품 상세」/구매 영역 렌더 결과를 지문으로 남긴다.
 *
 * 왜 필요한가: v2 문서 모델을 넣으면서 "손대지 않은 상품은 화면이 그대로여야 한다"가
 * 가장 중요한 약속이 됐다. 그 약속을 눈으로 확인하는 것은 불가능하므로(상품 27개 × 두 자리)
 * 렌더된 HTML에서 상세 이미지 URL·순서와 텍스트를 뽑아 해시로 굳혀 둔다.
 *
 * 사용:
 *   node scripts/verify_detail_noregression.mjs snapshot out.json   # 지문 저장
 *   node scripts/verify_detail_noregression.mjs compare out.json    # 지문 비교
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = {};
for (const l of readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const BASE = process.env.BASE_URL || 'http://localhost:3210';
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: 'daleum' }, auth: { persistSession: false },
});

const mode = process.argv[2] || 'snapshot';
const file = process.argv[3] || path.join(ROOT, 'detail-fingerprint.json');

const { data: products, error } = await db
  .from('products').select('slug,name,status').in('status', ['active', 'sold_out', 'hidden']).order('slug');
if (error) { console.error(error); process.exit(1); }

/**
 * 내가 바꾼 것만 정확히 본다.
 *
 * 처음에는 페이지 안의 모든 상품 이미지를 담았는데, 그러면 하단 「함께 보면 좋은 상품」이
 * view_count 순으로 정렬돼 있어서 **내가 페이지를 열어 본 것만으로 순서가 바뀌었다**.
 * 지문이 매번 달라지니 무회귀 판정이 불가능했다 — 계기가 거짓 경보를 낸 것이다.
 * 그래서 범위를 실제 변경 지점 두 곳으로 좁힌다:
 *   1) 상세 이미지 — alt 가 '상세 이미지' 인 img (DescriptionBlock/DetailDocRenderer 가 그린 것)
 *   2) 구매 박스 요약 — 가격 옆에 실리는 설명 텍스트
 */
function fingerprint(html) {
  const detail = [];
  const re = /<img[^>]*>/g;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const alt = (tag.match(/alt="([^"]*)"/) || [])[1] || '';
    if (!/상세 이미지/.test(alt)) continue;
    let src = ((tag.match(/src="([^"]+)"/) || [])[1] || '').replace(/&amp;/g, '&');
    const inner = src.match(/[?&]url=([^&]+)/);
    if (inner) src = decodeURIComponent(inner[1]);
    const w = (tag.match(/width="(\d+)"/) || [])[1] || '';
    const h = (tag.match(/height="(\d+)"/) || [])[1] || '';
    detail.push(`${src}|${w}x${h}|${alt}`);
  }

  // 구매 박스 요약 — Expandable 안의 설명. 제목(h1) 이후 ~ 장바구니 버튼 이전 구간에서 뽑는다.
  const box = html.match(/<h1[\s\S]*?(?=장바구니|바로 구매|품절)/);
  const boxText = (box ? box[0] : '')
    .replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();

  return {
    detailImages: detail,
    detailCount: detail.length,
    buyBoxHash: crypto.createHash('sha1').update(boxText).digest('hex').slice(0, 16),
    buyBoxLen: boxText.length,
  };
}

const out = {};
for (const p of products) {
  const res = await fetch(`${BASE}/products/${encodeURIComponent(p.slug)}`, { headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) { out[p.slug] = { error: res.status }; continue; }
  out[p.slug] = fingerprint(await res.text());
}

if (mode === 'snapshot') {
  writeFileSync(file, JSON.stringify(out, null, 2));
  const total = Object.values(out).reduce((a, v) => a + (v.detailCount || 0), 0);
  console.log(`지문 저장: ${file}`);
  console.log(`상품 ${Object.keys(out).length}개 / 상세 이미지 합계 ${total}장`);
  const errs = Object.entries(out).filter(([, v]) => v.error);
  if (errs.length) console.log('응답 실패:', errs.map(([k, v]) => `${k}(${v.error})`).join(', '));
} else {
  const prev = JSON.parse(readFileSync(file, 'utf8'));
  let diffs = 0;
  for (const slug of new Set([...Object.keys(prev), ...Object.keys(out)])) {
    const a = JSON.stringify(prev[slug]); const b = JSON.stringify(out[slug]);
    if (a !== b) { diffs++; console.log(`\n[변경] ${slug}\n  전: ${a}\n  후: ${b}`); }
  }
  console.log(diffs === 0 ? `\n무회귀 OK — 상품 ${Object.keys(out).length}개 전부 동일` : `\n${diffs}개 상품이 달라졌다`);
  if (diffs > 0) process.exitCode = 1;
}
