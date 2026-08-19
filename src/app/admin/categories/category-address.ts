/* ============================================================
   카테고리 "주소" 만들기 — 사람이 읽을 수 있는 값만 만든다.

   왜 이 파일이 따로 있는가:
   공용 slugify(lib/format.ts)는 한글이 들어오면 ASCII 성분이 하나도 안 남을 때
   입력 해시로 `item-1vuyo3h1r32sbi` 같은 14자 난수를 돌려준다. 상품에서는
   "충돌하지 않는 고유값" 이 더 중요해 그 선택이 맞지만, 카테고리에서는 아니다 —
   카테고리 주소는 홈 타일·전체 상품 탭·인스타 링크에 그대로 박히는 데다,
   대표가 '곤약젤리' 를 만들면 고객이 보는 주소가 난수가 되어 되돌릴 수도 없다.
   (실측: '곤약면'→item-1vuyo3h1r32sbi, '신제품'→item-0voffi00x14lxo)

   그래서 카테고리 경로에서는 해시 대체값을 **절대 쓰지 않는다.**
   1) 자주 쓰는 낱말은 사전으로 바꾸고(곤약→konjac, 젤리→jelly)
   2) 남은 한글은 로마자로 음차하고(국립국어원 로마자 표기 간이판)
   3) 그래도 한 글자도 안 남으면 `category-8` 처럼 순번으로 만든다.

   완벽한 음차가 목표가 아니다. 대표가 눈으로 읽고 "아, 그 카테고리" 라고
   알아볼 수 있으면 충분하다. 마음에 안 들면 화면에서 직접 고칠 수 있다.
   ============================================================ */

/** 주소로 허용하는 형태 — 영문 소문자·숫자·붙임표(-). 서버 검사와 같은 규칙이다. */
export const ADDRESS_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** 규칙을 어겼을 때 화면에 띄우는 말 — "슬러그" 같은 개발 용어를 쓰지 않는다 */
export const ADDRESS_RULE_MESSAGE =
  "주소는 영문 소문자와 숫자, 붙임표(-)만 쓸 수 있습니다. 한글·공백·기호는 넣을 수 없습니다.";

/* ---------- 1) 낱말 사전 ----------
   음차보다 사전이 먼저다. '곤약쌀' 을 gonyakssal 로 적는 것보다
   konjac-rice 가 이미 쓰고 있는 기존 주소와 결이 맞는다.
   긴 낱말부터 맞춰 봐야 '곤약면' 이 '곤약'+'면' 으로 쪼개지기 전에 잡힌다. */
const WORD_MAP: Record<string, string> = {
  소스포함: "sauce",
  대용량: "bulk",
  업소용: "business",
  도시락: "lunchbox",
  즉석밥: "rice",
  곤약쌀: "konjac-rice",
  곤약밥: "konjac-rice",
  곤약면: "konjac-noodle",
  곤약: "konjac",
  저당: "low-sugar",
  무설탕: "sugar-free",
  다이어트: "diet",
  신제품: "new",
  기획전: "special",
  선물세트: "gift-set",
  선물: "gift",
  세트: "set",
  묶음: "pack",
  용기형: "cup",
  단품: "single",
  라면: "ramen",
  국수: "noodle",
  소바: "soba",
  파스타: "pasta",
  젤리: "jelly",
  음료: "drink",
  간식: "snack",
  과자: "snack",
  디저트: "dessert",
  샐러드: "salad",
  소스: "sauce",
  스프: "soup",
  곡물: "grain",
  현미: "brown-rice",
  귀리: "oat",
  두부: "tofu",
  야채: "vegetable",
  채소: "vegetable",
  한정: "limited",
  베스트: "best",
  신상: "new",
  면: "noodle",
  밥: "rice",
  쌀: "rice",
  떡: "tteok",
  빵: "bread",
};

/** 사전은 긴 낱말부터 훑는다 — 짧은 낱말이 먼저 걸리면 '곤약면'이 konjac-myeon 이 된다 */
const WORD_KEYS = Object.keys(WORD_MAP).sort((a, b) => b.length - a.length);

/* ---------- 2) 한글 음차 ---------- */
const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;
const CHOSEONG = [
  "g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s",
  "ss", "", "j", "jj", "ch", "k", "t", "p", "h",
];
const JUNGSEONG = [
  "a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa",
  "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i",
];
const JONGSEONG = [
  "", "k", "k", "k", "n", "n", "n", "t", "l", "k",
  "m", "p", "t", "t", "p", "l", "m", "p", "p", "t",
  "t", "ng", "t", "t", "k", "t", "p", "t",
];

/** 한글 음절 하나를 초·중·종성으로 풀어 로마자로 적는다 */
function romanizeSyllable(code: number): string {
  const index = code - HANGUL_BASE;
  const cho = Math.floor(index / 588);
  const jung = Math.floor((index % 588) / 28);
  const jong = index % 28;
  return CHOSEONG[cho] + JUNGSEONG[jung] + JONGSEONG[jong];
}

/** 사전에 없는 한글을 로마자로 — 음절 사이에 붙임표를 넣지 않아야 읽기 쉽다 */
function romanize(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    out += code >= HANGUL_BASE && code <= HANGUL_LAST ? romanizeSyllable(code) : ch;
  }
  return out;
}

/** 무엇이 들어오든 주소 형태로 다듬는다 — 허용 문자 외에는 전부 붙임표로 */
export function toAddressForm(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    // 결합 문자(악센트) 제거 — "Café" 를 "cafe" 로 살린다
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * 이름에서 주소를 지어낸다.
 *
 * @param name    관리자가 입력한 카테고리 이름
 * @param taken   이미 쓰이고 있는 주소 목록 (중복이면 뒤에 숫자를 붙인다)
 * @param ordinal 마지막 대비책으로 쓸 순번 — 보통 "현재 카테고리 수 + 1"
 */
export function suggestAddress(name: string, taken: string[], ordinal: number): string {
  let work = name.trim();
  for (const key of WORD_KEYS) {
    if (work.includes(key)) work = work.split(key).join(` ${WORD_MAP[key]} `);
  }
  const base = toAddressForm(romanize(work));
  // 한 글자도 안 남으면 해시가 아니라 순번을 쓴다. 읽히지 않는 주소는 만들지 않는다.
  const seed = base || `category-${Math.max(1, ordinal)}`;

  if (!taken.includes(seed)) return seed;
  // 같은 이름이 이미 있으면 -2, -3 … 으로 비켜 간다 (사람이 읽을 수 있는 채로)
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${seed}-${n}`;
    if (!taken.includes(candidate)) return candidate;
  }
  return `${seed}-${Date.now().toString(36).slice(-4)}`;
}

/** 고객 화면에서 이 카테고리가 열리는 경로 — 새 탭으로 띄울 때만 쓴다 */
export function storePath(slug: string): string {
  return `/products?category=${encodeURIComponent(slug)}`;
}
