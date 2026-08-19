/**
 * Supabase Management API 로 마이그레이션 SQL 실행.
 *   사용: node scripts/apply_migration.mjs supabase/migrations/0007_xxx.sql
 *
 * 토큰은 .env.local 의 SUPABASE_ACCESS_TOKEN 에서 읽는다.
 * 예전에는 셸 환경변수만 봤는데, 그 변수는 세션이 바뀌면 사라져서
 * "토큰이 자꾸 만료된다" 로 체감됐다 — 실제로는 매번 다시 넣어야 했던 것이다.
 * (셸 환경변수가 있으면 그쪽을 우선한다 — 임시로 다른 토큰을 쓰고 싶을 때를 위해.)
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fromEnvLocal(key) {
  try {
    for (const line of readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && m[1] === key) return m[2].replace(/^["']|["']$/g, '').trim();
    }
  } catch {}
  return null;
}

const REF = process.env.SUPABASE_PROJECT_REF || fromEnvLocal('SUPABASE_PROJECT_REF') || 'ezmmutjazqsikopltmnj';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || fromEnvLocal('SUPABASE_ACCESS_TOKEN');

if (!TOKEN) {
  console.error(
    'SUPABASE_ACCESS_TOKEN 이 없습니다.\n' +
    '  https://supabase.com/dashboard/account/tokens 에서 발급한 뒤\n' +
    '  .env.local 에 SUPABASE_ACCESS_TOKEN=sbp_... 로 넣어 두세요 (한 번만 하면 됩니다).'
  );
  process.exit(1);
}

const file = process.argv[2];
if (!file) { console.error('사용: node scripts/apply_migration.mjs <file.sql>'); process.exit(1); }
const sql = readFileSync(path.isAbsolute(file) ? file : path.join(ROOT, file), 'utf8');

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
const text = await res.text();
console.log('status:', res.status);
console.log(text.slice(0, 3000));
if (res.status === 401) {
  console.error('\n토큰이 거부됐습니다(401). .env.local 의 SUPABASE_ACCESS_TOKEN 을 새로 발급해 교체하세요.');
}
if (!res.ok) process.exitCode = 1;
