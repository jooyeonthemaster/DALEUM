import { cleanStr } from "@/lib/orders";

/* ============================================================
   관리자 카테고리 API 공용 — 입력 정제

   화면에 나가는 거절 문구에서 "URL 슬러그" 라는 말을 뺐다.
   비개발자가 그 낱말을 보면 무엇을 고쳐야 하는지 알 수 없고,
   화면의 필드 이름도 "주소" 이므로 서로 다른 말을 쓰면 더 헷갈린다.
   ============================================================ */

// 한글 주소는 라우트에서 퍼센트 인코딩된 채 조회돼 상세페이지가 404 가 된다 — ASCII 만 허용한다.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** 이름 비교용 정규화 — 앞뒤·중간 공백과 대소문자 차이는 같은 이름으로 본다 */
function normalizeName(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * 같은 이름의 카테고리가 이미 있는지 — 있으면 그 이름을 돌려준다.
 * DB 에 name unique 제약이 없어서(0001 스키마는 slug 에만 걸었다) 서버가 직접 본다.
 */
export function findDuplicateName(
  rows: unknown,
  name: string,
  excludeId: string | null
): string | null {
  const target = normalizeName(name);
  for (const row of (rows ?? []) as { id: string; name: string }[]) {
    if (excludeId && row.id === excludeId) continue;
    if (normalizeName(row.name ?? "") === target) return row.name;
  }
  return null;
}

/** 카테고리 입력 정제 — partial이면 전달된 필드만 */
export function parseCategoryFields(
  raw: unknown,
  { partial }: { partial: boolean }
): { fields?: Record<string, unknown>; error?: string } {
  if (!raw || typeof raw !== "object") return { error: "카테고리 정보가 없습니다." };
  const p = raw as Record<string, unknown>;
  const has = (k: string) => Object.prototype.hasOwnProperty.call(p, k);
  const out: Record<string, unknown> = {};

  if (has("name") || !partial) {
    const name = cleanStr(p.name, 100);
    if (!name) return { error: "카테고리 이름을 입력해 주세요." };
    out.name = name;
  }
  if (has("slug") || !partial) {
    const slug = cleanStr(p.slug, 100)?.toLowerCase() ?? null;
    if (!slug || !SLUG_RE.test(slug)) {
      return {
        error: "주소는 영문 소문자와 숫자, 붙임표(-)만 쓸 수 있습니다. 한글은 넣을 수 없습니다.",
      };
    }
    out.slug = slug;
  }
  if (has("description")) out.description = cleanStr(p.description, 500);
  if (has("image_url")) {
    // 사이트 내부 경로("/editorial/...")도 허용한다. 예전엔 http(s)만 통과시켜서,
    // 마이그레이션이 넣어둔 내부 경로가 관리자 저장 한 번에 조용히 null 로 지워졌다.
    // "//" 로 시작하는 프로토콜 상대 URL 은 외부 출처라 계속 막는다.
    const url = cleanStr(p.image_url, 1000);
    const ok = !!url && (/^https?:\/\//.test(url) || /^\/(?!\/)/.test(url));
    out.image_url = ok ? url : null;
  }
  if (has("is_active")) out.is_active = Boolean(p.is_active);
  if (has("sort_order")) {
    const n = Number(p.sort_order);
    if (!Number.isInteger(n)) return { error: "노출 순서 값이 올바르지 않습니다." };
    out.sort_order = n;
  }
  return { fields: out };
}
