/** Supabase Management API 로 마이그레이션 SQL 실행. 사용: node scripts/_apply_migration.mjs <file.sql> */
import { readFileSync } from 'node:fs';
const REF = 'ezmmutjazqsikopltmnj';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) throw new Error('SUPABASE_ACCESS_TOKEN 없음');
const sql = readFileSync(process.argv[2], 'utf8');
const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
const text = await res.text();
console.log('status:', res.status);
console.log(text.slice(0, 3000));
if (!res.ok) process.exitCode = 1;
