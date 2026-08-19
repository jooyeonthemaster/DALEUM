/* ============================================================
   상품 건전성 판정.

   여태 이 판정은 `node scripts/verify_catalog.mjs` 를 돌려야만 알 수 있었다.
   개발자가 터미널을 열어 주지 않으면 대표·마케터는 대표이미지가 빠졌는지,
   상세페이지가 비었는지, 판매가가 0원인지 영원히 모른 채 "관리자 화면은 멀쩡하다"고
   믿는다. 그래서 같은 규칙을 목록 API 로 옮겨 상품마다 배지로 내보낸다.

   판정 규칙은 scripts/verify_catalog.mjs 를 그대로 따랐다 —
   두 곳의 기준이 갈리면 화면과 검증 스크립트가 서로 다른 말을 하게 되기 때문이다.
   (스크립트만 할 수 있는 검사 — 이미지 URL 응답 확인, 갤러리 세로비 측정 — 는
    매 요청마다 원본을 내려받아야 해서 여기서는 하지 않는다. LEDGER 의 미해결 항목.)
   ============================================================ */

/** 목록에 배지로 표시하는 문제 종류 */
export const HEALTH_CODES = [
  "no_price",
  "no_gallery",
  "no_primary",
  "image_order",
  "no_detail",
  "detail_order",
] as const;

export type HealthCode = (typeof HEALTH_CODES)[number];

/** 배지 문구 — 화면에 그대로 보이므로 영문·코드값을 쓰지 않는다 */
export const HEALTH_LABELS: Record<HealthCode, string> = {
  no_price: "판매가 없음",
  no_gallery: "상품 사진 없음",
  no_primary: "대표 사진 없음",
  image_order: "사진 순서 어긋남",
  no_detail: "상세페이지 비어 있음",
  detail_order: "상세 사진 번호 어긋남",
};

/** 배지를 눌렀을 때 이유를 설명하는 긴 문구 (title 속성) */
export const HEALTH_HINTS: Record<HealthCode, string> = {
  no_price: "판매가가 0원입니다. 판매중으로 바꿀 수 없습니다.",
  no_gallery: "상품 사진이 한 장도 없습니다. 고객 목록에 빈 칸으로 보입니다.",
  no_primary: "대표 사진이 정해져 있지 않거나 두 장 이상입니다.",
  image_order: "사진 순서가 어긋나 고객 화면에서 다른 순서로 보일 수 있습니다.",
  no_detail: "상세페이지 내용이 비어 있습니다.",
  detail_order: "상세 사진 번호가 1번부터 이어지지 않습니다.",
};

/** 붉게 표시할 것 — 그대로 두면 판매가 안 되거나 고객 화면이 비는 문제 */
export const HEALTH_SEVERE: HealthCode[] = ["no_price", "no_gallery", "no_detail"];

/** DescriptionBlock / detail-doc / verify_catalog 가 쓰는 것과 같은 이미지 줄 표기 */
const DETAIL_IMAGE_RE = /^!\[([^\]]*?)(?:\|(\d+)x(\d+))?\]\((https?:\/\/.+)\)$/;

/**
 * 상세 사진 한 줄에서 "몇 번째 사진인지"를 읽는다.
 *
 * verify_catalog.mjs 는 주소 끝의 `/3.webp` 만 본다. 씨앗 스크립트가 올린 사진은 그
 * 규칙을 따르지만(운영 중인 상품 20개 전부 이 방식으로 통과하는 것을 확인했다),
 * 관리자 화면에서 올린 사진은 파일명이 무작위라 주소에 번호가 없다 —
 * 저장 경로가 `daleum/<폴더>/<임의값>.webp` 이기 때문이다.
 * 주소만 보고 판정하면 앞으로 화면으로 올리는 상품이 전부 "번호 어긋남" 으로 뜬다.
 * 비개발자에게는 원인도 해결책도 없는 거짓 경고이고, 경고가 늘 켜져 있으면
 * 진짜 문제가 생겼을 때도 아무도 배지를 보지 않게 된다.
 *
 * 그래서 주소에 번호가 있으면 그것을 쓰고(옛 자산과 판정이 갈리지 않는다),
 * 없으면 설명글의 "상세 이미지 N" 을 읽는다 — 저장할 때 detail-doc.ts 의
 * renumberDetailImages() 가 1..N 으로 다시 매겨 주는 값이다.
 */
function detailImageNumber(alt: string, url: string): number | null {
  const fromUrl = url.match(/\/(\d+)\.webp$/)?.[1];
  if (fromUrl) return Number(fromUrl);
  const fromAlt = alt.match(/상세\s*이미지\s*(\d+)\s*$/)?.[1];
  return fromAlt ? Number(fromAlt) : null;
}

export interface HealthInput {
  price: number;
  description: string | null;
  images: { id: string; sort_order: number; is_primary: boolean }[];
}

/** 문제 코드 목록 — 문제가 없으면 빈 배열 */
export function computeHealth(p: HealthInput): HealthCode[] {
  const out: HealthCode[] = [];

  if (!(p.price > 0)) out.push("no_price");

  const imgs = [...p.images].sort((a, b) => a.sort_order - b.sort_order);
  const primaries = imgs.filter((i) => i.is_primary);

  if (imgs.length === 0) {
    out.push("no_gallery");
  } else {
    if (primaries.length !== 1) out.push("no_primary");
    // 대표가 첫 장이 아니거나 sort_order 가 0..n-1 연속이 아니면 진열 순서를 신뢰할 수 없다
    const primaryNotFirst = primaries[0] !== undefined && imgs[0]?.id !== primaries[0].id;
    const gapInOrder = imgs.some((img, idx) => img.sort_order !== idx);
    if (primaryNotFirst || gapInOrder) out.push("image_order");
  }

  const body = (p.description ?? "").trim();
  if (body === "") {
    out.push("no_detail");
  } else {
    const nums = body
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.trim().match(DETAIL_IMAGE_RE))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => detailImageNumber(m[1] ?? "", m[4]));
    // 한 장이라도 번호를 못 읽으면 이어지는지 아닌지 말할 수 없다 — 모르는 것을 문제라 하지 않는다
    const readable = nums.every((n): n is number => n !== null);
    if (nums.length > 0 && readable && !nums.every((n, i) => n === i + 1)) {
      out.push("detail_order");
    }
  }

  return out;
}
