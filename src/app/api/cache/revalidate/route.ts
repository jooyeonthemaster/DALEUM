import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CACHE_TAGS } from "@/lib/cache";

/**
 * 고객이 쓴 리뷰/문의를 곧바로 보이게 하는 캐시 무효화 창구.
 *
 * 왜 별도 엔드포인트인가 —
 * 리뷰와 상품문의는 API 라우트를 거치지 않고 브라우저에서 Supabase 로 직접 INSERT 한다.
 * 그래서 서버에는 revalidateTag 를 부를 지점이 아예 없다. 쓰기 경로를 서버로 옮기면
 * 회귀 위험이 크므로, 기존 클라이언트 직접 INSERT 는 그대로 두고 "성공 직후 캐시만
 * 비워달라"고 요청하는 얇은 창구를 따로 뒀다. 이 라우트는 DB 를 쓰지 않는다.
 *
 * POST body: { scope: "reviews" | "inquiries" }
 */

/**
 * 즉시 만료 프로파일.
 *
 * Next 16 에서 revalidateTag 의 두 번째 인자(profile)는 **필수**다.
 * 단일 인자 형태는 deprecated 이고 타입 정의상 컴파일도 되지 않는다.
 *   revalidateTag(tag: string, profile: string | { expire?: number }): void
 *
 * profile 을 "max" 로 주면 stale-while-revalidate 가 되어, 방금 글을 쓴 사람이
 * 이어지는 router.refresh() 에서 **자기 글이 빠진 이전 목록**을 그대로 다시 본다.
 * 이 단위가 막으려는 회귀가 바로 그것이므로 반드시 즉시 만료여야 한다.
 * { expire: 0 } 이 (deprecated 된) 단일 인자 형태와 정확히 동일한 즉시 만료다.
 * ─ next/dist/server/web/spec-extension/revalidate.js 참고:
 *   `if (!profile || cacheLife?.expire === 0)` 인 경로만 즉시 만료로 처리된다.
 *
 * updateTag 는 Route Handler 에서 호출하면 throw 하므로(E872) 여기서는 쓸 수 없다.
 */
const IMMEDIATE = { expire: 0 } as const;

/** 외부에 노출하는 scope → 내부 캐시 태그. 임의 태그 무효화를 막으려 화이트리스트로 둔다. */
const SCOPE_TAGS = {
  reviews: CACHE_TAGS.reviews,
  inquiries: CACHE_TAGS.inquiries,
} as const;

type Scope = keyof typeof SCOPE_TAGS;

function isScope(value: unknown): value is Scope {
  return value === "reviews" || value === "inquiries";
}

/**
 * 계정당 호출 제한.
 *
 * 로그인 확인만으로는 충분치 않다 — 이 사이트는 자유 가입이라 "익명"과 "가입 5초 뒤"의
 * 차이밖에 없다. 이 창구는 즉시 만료라서, 계정 하나로 초당 수십 번 두드리면 홈과 전
 * 상품 상세의 리뷰/문의 캐시가 매번 비워져 캐시 도입 이전의 DB 부하로 되돌아간다.
 * 리뷰·문의 작성은 사람 속도의 행위라 분당 10회면 정상 사용에는 절대 닿지 않는다.
 * (bulk-inquiries/route.ts 의 동일 패턴을 키만 IP → user.id 로 바꿔 가져왔다.)
 */
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 10;
const hits = new Map<string, number[]>();

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(userId, recent);
  if (hits.size > 5000) {
    // 메모리 누수 방지 — 창을 벗어난 항목 정리
    for (const [k, v] of hits) if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
  }
  return recent.length > MAX_PER_WINDOW;
}

export async function POST(req: NextRequest) {
  let rawScope: unknown;
  try {
    rawScope = ((await req.json()) as { scope?: unknown }).scope;
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  if (!isScope(rawScope)) {
    return NextResponse.json({ error: "scope 값이 올바르지 않습니다." }, { status: 400 });
  }
  const scope: Scope = rawScope;

  try {
    // 최소 방어 — 로그인 사용자만 허용한다.
    // 익명에게 열어두면 이 엔드포인트를 반복 호출하는 것만으로 스토어프론트 캐시를
    // 계속 비워, 캐시 도입 이전의 DB 부하로 되돌릴 수 있다.
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    // 제한에 걸려도 200 을 돌려준다 — 호출부는 결과를 무시하고 router.refresh() 로 넘어가며,
    // 정상 사용자가 이 한도에 닿는 일은 없다. 실패로 취급해 사용자 흐름을 막을 이유가 없다.
    if (rateLimited(user.id)) {
      return NextResponse.json({ ok: false, throttled: true });
    }

    revalidateTag(SCOPE_TAGS[scope], IMMEDIATE);
    return NextResponse.json({ ok: true });
  } catch (error) {
    // 무효화 실패가 사용자 흐름을 막아서는 안 된다 — 호출부는 결과를 무시하고 진행하고,
    // cache.ts 의 TTL(리뷰 180초 / 문의 60초)이 안전망으로 남는다.
    console.error(`[cache/revalidate] scope=${scope} 처리 실패:`, error);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
