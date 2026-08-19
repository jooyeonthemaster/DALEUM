/* ============================================================
   배너·팝업이 "어디로 보낼지" 를 코드 대신 이름으로 다루기 위한 사전.

   예전에는 이동 주소가 자유 입력 텍스트칸이었다(placeholder 가 `/products`).
   비개발자에게 `/products` 는 그냥 코드다. 게다가 `/product` 처럼 한 글자만
   틀려도 저장은 성공하고, 고객만 없는 페이지를 만난다 — 홈 대문 배너의 클릭이
   통째로 죽는데 관리자 화면 어디에도 그 사실이 드러나지 않았다.

   그래서 (1) 고를 수 있는 곳은 목록에서 고르게 하고,
   (2) 직접 입력은 남기되 실제로 존재하는 첫 구간인지 검사한다.
   여기 적힌 경로는 전부 src/app/(shop) 아래에 실재하는 페이지다.
   ============================================================ */

/** 고객 화면에 실재하는 고정 페이지 — 배너·팝업이 보낼 만한 곳만 추린다 */
export const FIXED_PAGES: { path: string; label: string }[] = [
  { path: "/products", label: "전체 상품" },
  { path: "/support", label: "고객센터" },
  { path: "/about", label: "브랜드 이야기" },
  { path: "/b2b", label: "업소용·OEM 문의" },
  { path: "/vip", label: "VIP 라운지" },
  // 홈은 배너 자신이 놓이는 자리지만, 팝업에서 홈으로 보내는 쓰임이 실제로 있다.
  // 무엇보다 '/' 는 실재하는 페이지라 죽은 링크 검사에서 통과시켜야 한다.
  { path: "/", label: "홈 화면" },
];

/**
 * 직접 입력을 허용할 첫 구간. src/app/(shop) 의 실제 폴더와 1:1 이다.
 * 여기 없는 첫 구간이면 고객이 404 를 만나므로 저장 전에 막는다.
 */
const KNOWN_SEGMENTS = new Set([
  "products",
  "support",
  "about",
  "b2b",
  "vip",
  "search",
  "cart",
  "terms",
  "privacy",
]);

export interface LinkTargetsData {
  products: { slug: string; name: string }[];
  categories: { slug: string; name: string }[];
}

export const EMPTY_TARGETS: LinkTargetsData = { products: [], categories: [] };

export type LinkMode = "none" | "product" | "category" | "page" | "custom";

/** 저장된 주소를 다시 "무엇을 고른 것" 으로 되돌린다 (수정 화면을 열 때 쓴다) */
export function parseLink(value: string): { mode: LinkMode; slug: string } {
  const v = (value ?? "").trim();
  if (!v) return { mode: "none", slug: "" };
  if (FIXED_PAGES.some((p) => p.path === v)) return { mode: "page", slug: v };
  const product = /^\/products\/([^/?#]+)$/.exec(v);
  if (product) return { mode: "product", slug: decodeURIComponent(product[1]) };
  const category = /^\/products\?category=([^&#]+)$/.exec(v);
  if (category) return { mode: "category", slug: decodeURIComponent(category[1]) };
  return { mode: "custom", slug: v };
}

/** 고른 것을 실제 주소로 — 관리자가 주소를 손으로 조립할 일이 없어야 한다 */
export function buildLink(mode: LinkMode, slug: string): string {
  if (mode === "none" || !slug) return "";
  if (mode === "product") return `/products/${encodeURIComponent(slug)}`;
  if (mode === "category") return `/products?category=${encodeURIComponent(slug)}`;
  return slug;
}

/**
 * 목록에 찍을 한국어 요약 — 원시 경로를 화면에 그대로 내보내지 않기 위한 것이다.
 * 이름을 못 찾으면 종류만이라도 한국어로 말한다(주소를 노출하는 것보다 낫다).
 */
export function describeLink(value: string, targets: LinkTargetsData): string | null {
  const { mode, slug } = parseLink(value);
  if (mode === "none") return null;
  if (mode === "page") {
    return FIXED_PAGES.find((p) => p.path === slug)?.label ?? "고객 화면";
  }
  if (mode === "product") {
    const hit = targets.products.find((p) => p.slug === slug);
    return hit ? `${hit.name} 상품 페이지` : "상품 페이지";
  }
  if (mode === "category") {
    const hit = targets.categories.find((c) => c.slug === slug);
    return hit ? `${hit.name} 카테고리` : "카테고리 목록";
  }
  if (/^https?:\/\//i.test(slug)) return "외부 사이트";
  return "직접 넣은 주소";
}

/** 직접 입력 검사 — 통과하면 null, 막아야 하면 사람 말로 된 이유 */
export function validateCustomLink(raw: string): string | null {
  const v = raw.trim();
  if (!v) return "이동할 주소를 입력해 주세요.";
  // 빗금 하나는 홈 화면이다. 아래 첫 구간 검사에 넣으면 구간이 빈 문자열이라
  // "없는 페이지" 로 잘못 걸린다 — 실제로 직접 입력 칸의 기본값이 이것이었다.
  if (v === "/") return null;
  if (/^https?:\/\//i.test(v)) {
    try {
      new URL(v);
      return null;
    } catch {
      return "주소 형식이 올바르지 않습니다. 브라우저 주소창의 주소를 그대로 붙여 넣어 주세요.";
    }
  }
  if (!v.startsWith("/")) {
    return "우리 사이트 안쪽으로 보내려면 빗금(/)으로 시작해야 하고, 다른 사이트라면 https:// 로 시작해야 합니다.";
  }
  const segment = v.slice(1).split(/[/?#]/)[0];
  if (!KNOWN_SEGMENTS.has(segment)) {
    return "우리 사이트에 없는 페이지입니다. 고객이 눌러도 빈 화면을 만나게 되니 위 목록에서 골라 주세요.";
  }
  return null;
}

/**
 * 저장 직전 최종 검사 — 비어 있으면 "이동 안 함" 이므로 통과.
 * 화면에서 이미 막지만, API 를 직접 두드리는 경로로도 죽은 링크가 들어오면 안 된다.
 */
export function validateStoredLink(value: unknown): string | null {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) return null;
  return validateCustomLink(v);
}
