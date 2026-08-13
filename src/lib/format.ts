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

/**
 * slug 생성 — URL-safe ASCII(소문자 영숫자·하이픈)만 반환한다.
 * 한글 slug 는 라우팅 과정에서 퍼센트 인코딩된 채로 조회돼 상세페이지가 404 가 되므로 절대 넣지 않는다.
 * 한글이 빠지면서 남는 ASCII 가 없으면 빈 slug(=unique 충돌·라우팅 파손) 대신
 * 입력 해시로 만든 대체 slug 를 돌려준다.
 * 같은 입력이면 항상 같은 값, 다른 입력이면 사실상 다른 값이라 재실행해도 slug 가 바뀌지 않는다.
 */
export function slugify(input: string): string {
  // 유니코드 정규화 + 결합 문자 제거로 "Café" 는 "cafe" 로 살린다 (ASCII 입력은 이 단계에서 변하지 않는다)
  const folded = input.normalize("NFKD").toLowerCase().replace(COMBINING_MARKS, "");
  // 구분자(공백·문장부호·제로폭 공백·소프트하이픈 등) 런을 공백 하나로 접는다.
  // 해시도 이 정규형으로 계산해야 "여주 곤약밥" 과 "여주  곤약밥" 처럼 눈에 안 보이는
  // 공백 차이가 서로 다른 slug 를 만들어 중복 상품이 조용히 생기는 일을 막는다.
  const canonical = folded.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const base = canonical.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  // ASCII 로 전부 표현되는 입력은 기존 동작 그대로 유지한다 (무회귀).
  // 판정 기준은 folded 가 아니라 **원본**이다 — NFKD 는 전각→반각 같은 호환분해까지 하므로
  // folded 를 보면 "ＫＯＮＪＡＣ" 가 ASCII 로 보여 "KONJAC" 과 같은 slug 로 접힌다.
  if (!hasNonAscii(input)) return base;
  const token = hashToken(canonical);
  return base ? `${base}-${token}` : `${SLUG_FALLBACK_PREFIX}-${token}`;
}
