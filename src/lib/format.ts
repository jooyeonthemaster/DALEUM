/** 12,900원 형식 (숫자만) */
export function krw(amount: number): string {
  return new Intl.NumberFormat("ko-KR").format(amount);
}

/** 2026.07.03 */
export function formatDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

/** 2026.07.03 14:22 */
export function formatDateTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${formatDate(d)} ${hh}:${mm}`;
}

/** 010-1234-5678 */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3");
  if (digits.length === 10) return digits.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
  return phone;
}

/** 할인율 계산 (정가 대비) */
export function discountRate(original: number, sale: number): number {
  if (original <= 0 || sale >= original) return 0;
  return Math.round(((original - sale) / original) * 100);
}

/** ASCII 성분이 하나도 안 남을 때 쓰는 대체 slug 의 접두사 */
const SLUG_FALLBACK_PREFIX = "item";

/** 결합 문자(NFKD 로 분리된 악센트 등) */
const COMBINING_MARKS = /\p{M}/gu;

/**
 * 결정론적 32비트 해시 (FNV-1a + murmur3 마무리 확산).
 * 관리자 폼(브라우저)·API 라우트(Node)·프록시(Edge) 어디서나 같은 값이 나와야 하므로
 * node:crypto 나 비동기 SubtleCrypto 대신 외부 의존성 없는 순수 JS 로 계산한다.
 */
function hash32(input: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    // 한글은 코드유닛 상위 바이트에 정보가 몰려 있으므로 하위·상위 바이트를 따로 섞는다
    h = Math.imul(h ^ (code & 0xff), 0x01000193) >>> 0;
    h = Math.imul(h ^ (code >>> 8), 0x01000193) >>> 0;
  }
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** 서로 다른 시드로 뽑은 32비트 해시 두 개(=64비트)를 base36 ASCII 14자로 인코딩 */
function hashToken(input: string): string {
  const hi = hash32(input, 0x811c9dc5);
  const lo = hash32(input, 0x9e3779b1);
  return hi.toString(36).padStart(7, "0") + lo.toString(36).padStart(7, "0");
}

/** ASCII 밖 문자(한글·이모지 등)가 남아 있는지 */
function hasNonAscii(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    if (value.charCodeAt(i) > 0x7f) return true;
  }
  return false;
}

/* ------------------------------------------------------------
   한글 → 로마자 음차.

   왜 필요한가: 한글 상품명은 slug 로 쓸 수 없다(라우팅에서 퍼센트 인코딩된 채 조회돼
   상세페이지가 404 가 된다). 그래서 예전에는 한글이 섞이면 통째로 버리고 입력 해시로
   `item-0kaheyu1o2vt66` 같은 값을 만들었다. 문제는 그게 **고객이 보는 상품 주소가 된다**는 것이다.
   관리자 화면은 그 정체불명 문자열을 그대로 보여 줬고, 오류 문구에도 그대로 실렸다.
   (감사에서 이 함수 하나가 상품 폼·카테고리·일괄 등록에 걸쳐 11건의 결함을 낳은 것으로 확인됐다)

   이제 한글을 음차해 `matissneun-yeoju-balhyo-gonyakbap` 처럼 읽을 수 있는 주소를 만든다.
   국립국어원 로마자 표기법의 음운 변화(자음동화 등)까지 따르지는 않는다 — 주소는 발음 표기가
   아니라 식별자이고, 음절 단위 음차만으로도 사람이 무슨 상품인지 알아볼 수 있으면 충분하다.
   ------------------------------------------------------------ */
const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;
// prettier-ignore
const CHOSEONG = ["g","kk","n","d","tt","r","m","b","pp","s","ss","","j","jj","ch","k","t","p","h"];
// prettier-ignore
const JUNGSEONG = ["a","ae","ya","yae","eo","e","yeo","ye","o","wa","wae","oe","yo","u","wo","we","wi","yu","eu","ui","i"];
// prettier-ignore
const JONGSEONG = ["","k","k","ks","n","nj","nh","t","l","lk","lm","lp","ls","lt","lp","lh","m","p","ps","t","t","ng","t","t","k","t","p","t"];

/** 한글 음절을 로마자로 편다. 한글이 아닌 문자는 그대로 통과시킨다. */
function romanizeHangul(input: string): string {
  let out = "";
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < HANGUL_BASE || code > HANGUL_LAST) {
      out += ch;
      continue;
    }
    const index = code - HANGUL_BASE;
    out += CHOSEONG[Math.floor(index / 588)];
    out += JUNGSEONG[Math.floor((index % 588) / 28)];
    out += JONGSEONG[index % 28];
  }
  return out;
}

/**
 * slug 생성 — URL-safe ASCII(소문자 영숫자·하이픈)만 반환한다.
 *
 * 한글은 로마자로 음차한다(위 주석 참고). 음차해도 남는 글자가 없을 때(이모지만 있는 이름 등)만
 * 예전처럼 입력 해시로 대체 주소를 만든다. 같은 입력이면 항상 같은 값이라 재실행해도 주소가 바뀌지 않는다.
 *
 * 음차 결과가 겹칠 수 있다(다른 이름인데 같은 주소). 그건 저장할 때 중복 검사에서 걸러지고
 * 관리자가 주소를 직접 고칠 수 있으므로, 읽을 수 없는 해시를 기본값으로 두는 것보다 낫다.
 */
export function slugify(input: string): string {
  // ASCII 로 전부 표현되는 입력은 예전 경로를 그대로 탄다 (무회귀).
  // 판정 기준은 정규화 결과가 아니라 **원본**이다 — NFKD 는 전각→반각 같은 호환분해까지 하므로
  // 정규화 후를 보면 "ＫＯＮＪＡＣ" 가 ASCII 로 보여 "KONJAC" 과 같은 slug 로 접힌다.
  const asciiOnly = !hasNonAscii(input);
  const source = asciiOnly ? input : romanizeHangul(input);

  // 유니코드 정규화 + 결합 문자 제거로 "Café" 는 "cafe" 로 살린다 (ASCII 입력은 이 단계에서 변하지 않는다)
  const folded = source.normalize("NFKD").toLowerCase().replace(COMBINING_MARKS, "");
  // 구분자(공백·문장부호·제로폭 공백·소프트하이픈 등) 런을 공백 하나로 접는다.
  const canonical = folded.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const base = canonical.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  if (asciiOnly) return base;
  if (base) return base;
  // 음차해도 남는 글자가 없는 경우에만 해시 — 해시는 원본 기준으로 계산해야
  // "여주 곤약밥" 과 "여주  곤약밥" 처럼 눈에 안 보이는 공백 차이가 서로 다른 주소를 만들지 않는다.
  const canonicalOriginal = input
    .normalize("NFKD")
    .toLowerCase()
    .replace(COMBINING_MARKS, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return `${SLUG_FALLBACK_PREFIX}-${hashToken(canonicalOriginal)}`;
}
