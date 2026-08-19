/**
 * node 로 소스를 그대로 돌리기 위한 '@/' 별칭 + 확장자 해석기.
 *
 * tsconfig 의 paths({"@/*": ["./src/*"]})와 확장자 생략은 next/tsc 만 아는 규칙이라
 * 순수 node 실행에서는 모듈을 찾지 못한다. 테스트를 돌리자고 소스에서 별칭을 걷어내는 것은
 * 본말전도이므로, 해석 단계에서만 풀어 준다.
 *
 * 사용: node --experimental-strip-types --import ./scripts/alias-hook.mjs <file.ts>
 */
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { register } from 'node:module';

const SRC = pathToFileURL(path.resolve(import.meta.dirname, '..', 'src') + '/').href;
const CANDIDATES = ['.ts', '.tsx', '/index.ts', '/index.tsx', '.mjs', '.js'];

/** 확장자가 생략된 경로에 실제 파일이 있는지 훑어 본다 */
function withExtension(url) {
  let p;
  try { p = fileURLToPath(url); } catch { return url; }
  if (fs.existsSync(p) && fs.statSync(p).isFile()) return url;
  for (const ext of CANDIDATES) {
    if (fs.existsSync(p + ext)) return pathToFileURL(p + ext).href;
  }
  return url;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    return nextResolve(withExtension(new URL(specifier.slice(2), SRC).href), context);
  }
  // 상대 경로도 확장자가 없을 수 있다
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !path.extname(specifier)) {
    const base = context.parentURL ?? SRC;
    return nextResolve(withExtension(new URL(specifier, base).href), context);
  }
  return nextResolve(specifier, context);
}

register(import.meta.url, { parentURL: import.meta.url });
