import { cleanStr } from "@/lib/orders";

/* ============================================================
   관리자 카테고리 API 공용 — 입력 정제
   ============================================================ */

const SLUG_RE = /^[a-z0-9가-힣]+(?:-[a-z0-9가-힣]+)*$/;

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
      return { error: "URL 슬러그는 영문 소문자·숫자·한글·하이픈만 사용할 수 있습니다." };
    }
    out.slug = slug;
  }
  if (has("description")) out.description = cleanStr(p.description, 500);
  if (has("image_url")) {
    const url = cleanStr(p.image_url, 1000);
    out.image_url = url && /^https?:\/\//.test(url) ? url : null;
  }
  if (has("is_active")) out.is_active = Boolean(p.is_active);
  if (has("sort_order")) {
    const n = Number(p.sort_order);
    if (!Number.isInteger(n)) return { error: "정렬 순서 값이 올바르지 않습니다." };
    out.sort_order = n;
  }
  return { fields: out };
}
