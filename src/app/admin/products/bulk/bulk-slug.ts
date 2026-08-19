/* ============================================================
   상품 주소 제안 — 한글 상품명을 읽을 수 있는 영문 주소로

   왜 필요한가:
   lib/format.ts 의 slugify 는 ASCII 가 하나도 남지 않는 한글 이름에 대해
   입력 해시를 돌려준다 — "바로먹는 곤약면" → item-0zh902d13retid.
   라우팅은 되지만 사람이 읽을 수 없는 주소다. 개발자가 손으로 만든 기존 27개는
   yeoju-konjac-rice 처럼 읽히는 주소인데, 일괄 등록으로 올린 것만 해시가 되면
   인스타·카톡에 뿌릴 링크가 죽고 검색 노출도 잃는다.

   그래서 여기서 국어의 로마자 표기법(모아쓰기 그대로 옮기는 단순형)으로
   **제안값**을 만든다. 어디까지나 제안이고, 관리자가 화면에서 고칠 수 있다.
   자음동화·구개음화 같은 음운 변동은 일부러 적용하지 않는다 —
   규칙이 늘수록 결과를 예측하기 어려워지고, 어차피 사람이 최종 확인하기 때문이다.

   만들어 내지 못하면 **빈 값**을 돌려준다. 해시로 채우지 않는 이유는,
   해시가 채워져 있으면 관리자가 그것을 정상값으로 믿고 그대로 등록하기 때문이다.
   빈 값이면 검증이 "상품 주소를 정해 주세요" 라고 붙잡아 준다.
   ============================================================ */

// 국어의 로마자 표기법 기준. 초성 ㅇ 은 표기하지 않는다.
const INITIALS = [
  "g", "kk", "n", "d", "tt", "r", "m", "b", "pp",
  "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h",
];

const MEDIALS = [
  "a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae",
  "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i",
];

// 받침은 대표음으로 적는다 (ㅅ·ㅈ·ㅊ·ㅌ 받침은 모두 t).
const FINALS = [
  "", "k", "k", "ks", "n", "nj", "nh", "t", "l", "lg", "lm", "lb", "ls",
  "lt", "lp", "lh", "m", "p", "ps", "t", "t", "ng", "t", "t", "k", "t", "p", "t",
];

const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;

/** 한글 음절 한 글자를 로마자로 */
function romanizeSyllable(code: number): string {
  const offset = code - HANGUL_BASE;
  const initial = Math.floor(offset / 588);
  const medial = Math.floor((offset % 588) / 28);
  const final = offset % 28;
  return INITIALS[initial] + MEDIALS[medial] + FINALS[final];
}

/**
 * 상품명 → 주소 후보.
 * 공백·구분자는 하이픈 하나로 접고, 한글은 로마자로, 영문·숫자는 그대로 둔다.
 * 읽을 수 있는 글자가 하나도 없으면 빈 문자열.
 */
export function proposeSlug(name: string): string {
  const source = name.normalize("NFC").trim();
  if (!source) return "";

  let out = "";
  for (const char of source) {
    const code = char.codePointAt(0) ?? 0;

    if (code >= HANGUL_BASE && code <= HANGUL_LAST) {
      out += romanizeSyllable(code);
      continue;
    }
    if (/[a-zA-Z0-9]/.test(char)) {
      out += char.toLowerCase();
      continue;
    }
    // 그 밖의 모든 글자(공백·문장부호·한자·이모지)는 낱말 경계로 본다
    out += "-";
  }

  const cleaned = out
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  // 주소가 지나치게 길면 서버 cleanStr(200) 이 자르기 전에 여기서 낱말 경계로 줄인다
  if (cleaned.length <= 80) return cleaned;
  const trimmed = cleaned.slice(0, 80);
  const lastDash = trimmed.lastIndexOf("-");
  return (lastDash > 20 ? trimmed.slice(0, lastDash) : trimmed).replace(/-$/, "");
}

/** 서버 shared.ts 의 SLUG_RE 와 같은 규칙 — 거절당할 값을 미리 걸러 낸다 */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

/**
 * 여러 상품의 주소가 서로 겹치지 않게 뒤에 번호를 붙인다.
 * "우동인데 곤약 4입" 과 "우동인데 곤약 8입" 처럼 이름이 비슷하면 같은 주소가 나올 수 있는데,
 * 그때마다 사람에게 물으면 27개를 붙잡고 있어야 하므로 제안 단계에서 미리 갈라 둔다.
 */
export function dedupeSlug(candidate: string, taken: Set<string>): string {
  if (!candidate) return "";
  if (!taken.has(candidate)) return candidate;
  for (let n = 2; n < 100; n += 1) {
    const next = `${candidate}-${n}`;
    if (!taken.has(next)) return next;
  }
  return "";
}
