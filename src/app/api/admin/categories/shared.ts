import { cleanStr } from "@/lib/orders";

/* ============================================================
   관리자 카테고리 API 공용 — 입력 정제
   ============================================================ */

// 한글 slug 는 라우트에서 퍼센트 인코딩된 채 조회돼 상세페이지가 404 가 된다 — ASCII 만 허용한다.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
      return { error: "URL 슬러그는 영문 소문자·숫자·하이픈만 사용할 수 있습니다 (한글 불가)." };
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
    if (!Number.isInteger(n)) return { error: "정렬 순서 값이 올바르지 않습니다." };
    out.sort_order = n;
  }
  return { fields: out };
}
