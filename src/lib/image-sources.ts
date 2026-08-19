/* ============================================================
   이미지 출처 허용 목록 — next/image 와 상세페이지 편집기의 **단일 진실**

   왜 한 곳에 두는가:
   next/image 는 next.config.ts 의 remotePatterns 밖에 있는 호스트를 만나면
   빌드가 아니라 **요청을 그리는 도중에** throw 한다. 즉 허용되지 않은 주소가
   상품 문서(description_doc)에 한 번 박히면 그 상품의 고객 페이지가 죽는다.

   그런데 편집기는 관리자가 다른 사이트·워드 문서에서 복사해 온 img 를
   그대로 문서에 담을 수 있는 구멍이다. 그래서 "next/image 가 그릴 수 있는 주소인가"를
   들여보내는 문(스키마의 parseHTML)에서 판단해야 한다.
   목록이 두 벌이면 어느 한쪽만 늘어나는 날이 오고, 그날 고객 페이지가 죽는다.
   그래서 목록은 여기 한 벌만 두고 next.config.ts 와 편집기가 같이 읽는다.

   순수 상수 + 순수 함수만 둔다(React·next 런타임 import 금지) —
   next.config.ts 는 Node 에서, 편집기는 브라우저에서 이 파일을 읽기 때문이다.
   ============================================================ */

/**
 * next/image 의 remotePatterns 항목과 같은 모양.
 * next 의 타입을 그대로 가져오지 않는 이유는, 이 파일이 브라우저 번들에도 실려서
 * next 서버 타입에 의존하지 않는 편이 안전하기 때문이다(구조가 같으므로 대입된다).
 */
export interface ImageSourcePattern {
  protocol: "https";
  hostname: string;
  /** 없으면 그 호스트의 모든 경로. `/**` 로 끝나면 그 아래 전부 (next 문법과 같다) */
  pathname?: string;
}

/**
 * 상품·상세 이미지가 올 수 있는 곳.
 * 늘릴 때는 여기만 고치면 next.config.ts 와 편집기가 같이 따라온다.
 */
export const IMAGE_SOURCE_PATTERNS: ImageSourcePattern[] = [
  // 관리자 업로드가 떨어지는 Supabase Storage 공개 버킷
  {
    protocol: "https",
    hostname: "ezmmutjazqsikopltmnj.supabase.co",
    pathname: "/storage/v1/object/public/**",
  },
  // 운영 도메인에 직접 올라간 이미지
  { protocol: "https", hostname: "www.daleum.net" },
];

/** next 의 `/**` 만 해석한다 — 우리가 쓰는 문법이 그것뿐이라 그 이상을 흉내내지 않는다 */
function pathnameAllowed(pattern: string | undefined, pathname: string): boolean {
  if (!pattern) return true;
  if (pattern.endsWith("/**")) return pathname.startsWith(pattern.slice(0, -2));
  return pathname === pattern;
}

/**
 * next/image 로 그릴 수 있는 주소인가.
 *
 * data:·blob: 는 프로토콜에서 걸린다 — 저장은 되지만 다시 열 때
 * parseDetailDocJson 이 `^https?://` 로 버려서 "저장했는데 사진이 없다"가 된다.
 * 상대경로는 new URL 이 던져서 걸린다.
 */
export function isAllowedImageSrc(src: string): boolean {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return false;
  }
  return IMAGE_SOURCE_PATTERNS.some(
    (p) =>
      url.protocol === `${p.protocol}:` &&
      url.hostname === p.hostname &&
      pathnameAllowed(p.pathname, url.pathname),
  );
}
