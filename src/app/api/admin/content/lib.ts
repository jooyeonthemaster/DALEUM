import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { CACHE_TAGS } from "@/lib/cache";

/**
 * 배너/팝업/공지 공용 CRUD 헬퍼 — 각 route.ts가 리소스 설정과 함께 호출한다.
 */

/* ---------- 스토어프론트 캐시 무효화 ---------- */

/**
 * 즉시 만료 프로파일.
 *
 * Next 16 에서 revalidateTag 의 두 번째 인자(profile)는 **필수**다.
 * 단일 인자 형태는 deprecated 이고 타입 정의상 컴파일도 되지 않는다.
 *   revalidateTag(tag: string, profile: string | { expire?: number }): void
 *
 * profile 을 "max" 로 주면 stale-while-revalidate 가 되어, 관리자가 저장한 직후
 * 방문자(및 관리자 자신)가 이전 내용을 한 번 더 보게 된다.
 * 캐시 도입 전에는 매 요청이 DB 를 새로 읽어 그런 지연이 아예 없었으므로,
 * 기존 표시 동작을 1:1 로 보존하려면 즉시 만료여야 한다.
 * { expire: 0 } 이 (deprecated 된) 단일 인자 형태와 정확히 동일한 즉시 만료다.
 * ─ next/dist/server/web/spec-extension/revalidate.js 참고:
 *   `if (!profile || cacheLife?.expire === 0)` 인 경로만 즉시 만료로 처리된다.
 *
 * updateTag 는 Route Handler 에서 호출하면 throw 하므로(E872) 여기서는 쓸 수 없다.
 */
const IMMEDIATE = { expire: 0 } as const;

/**
 * banners / popups / notices 는 셋 다 홈·고객센터에 노출되므로
 * 어느 테이블이 바뀌든 content 태그 하나만 무효화하면 된다.
 * 쓰기가 실제로 성공한 뒤에만 호출한다.
 */
function revalidateContent() {
  revalidateTag(CACHE_TAGS.content, IMMEDIATE);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = Record<string, unknown>;
type ValidateResult = { data?: Record<string, unknown>; error?: string };

export interface ContentResource {
  table: "banners" | "popups" | "notices";
  /** 응답 키 (단수) — 예: banner */
  singular: string;
  /** 응답 키 (복수) — 예: banners */
  plural: string;
  /** 에러 문구용 한글 명칭 */
  label: string;
  order: { column: string; ascending: boolean }[];
  validate: (body: Body, partial: boolean) => ValidateResult;
}

/* ---------- 필드 파서 ---------- */

function str(v: unknown, max = 200): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s.length <= max ? s : s.slice(0, max);
}

function nullableStr(v: unknown, max = 500): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : null;
}

function iso(v: unknown): string | null | "invalid" {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") return "invalid";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "invalid" : d.toISOString();
}

function intOr(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

/** starts_at / ends_at / sort_order / is_active 공통 처리 */
function applyCommon(body: Body, out: Record<string, unknown>): string | null {
  if (body.starts_at !== undefined) {
    const v = iso(body.starts_at);
    if (v === "invalid") return "시작일이 올바르지 않습니다.";
    out.starts_at = v;
  }
  if (body.ends_at !== undefined) {
    const v = iso(body.ends_at);
    if (v === "invalid") return "종료일이 올바르지 않습니다.";
    out.ends_at = v;
  }
  if (
    typeof out.starts_at === "string" &&
    typeof out.ends_at === "string" &&
    out.ends_at < out.starts_at
  ) {
    return "종료일은 시작일 이후여야 합니다.";
  }
  if (body.sort_order !== undefined) out.sort_order = intOr(body.sort_order, 0);
  if (body.is_active !== undefined) out.is_active = Boolean(body.is_active);
  return null;
}

/* ---------- 리소스 정의 ---------- */

export const BANNERS: ContentResource = {
  table: "banners",
  singular: "banner",
  plural: "banners",
  label: "배너",
  order: [
    { column: "placement", ascending: true },
    { column: "sort_order", ascending: true },
    { column: "created_at", ascending: false },
  ],
  validate(body, partial) {
    const out: Record<string, unknown> = {};

    if (body.title !== undefined || !partial) {
      const title = str(body.title, 100);
      if (!title) return { error: "배너 제목을 입력해 주세요." };
      out.title = title;
    }
    if (body.subtitle !== undefined) out.subtitle = nullableStr(body.subtitle, 200);
    if (body.image_url !== undefined) out.image_url = nullableStr(body.image_url, 1000);
    if (body.link_url !== undefined) out.link_url = nullableStr(body.link_url, 1000);

    if (body.placement !== undefined || !partial) {
      if (!["hero", "strip", "mid", "footer"].includes(body.placement as string)) {
        return { error: "배너 위치가 올바르지 않습니다." };
      }
      out.placement = body.placement;
    }
    if (body.text_theme !== undefined) {
      if (body.text_theme !== "dark" && body.text_theme !== "light") {
        return { error: "텍스트 테마가 올바르지 않습니다." };
      }
      out.text_theme = body.text_theme;
    }

    const commonError = applyCommon(body, out);
    if (commonError) return { error: commonError };
    return { data: out };
  },
};

export const POPUPS: ContentResource = {
  table: "popups",
  singular: "popup",
  plural: "popups",
  label: "팝업",
  order: [
    { column: "sort_order", ascending: true },
    { column: "created_at", ascending: false },
  ],
  validate(body, partial) {
    const out: Record<string, unknown> = {};

    if (body.title !== undefined || !partial) {
      const title = str(body.title, 100);
      if (!title) return { error: "팝업 제목을 입력해 주세요." };
      out.title = title;
    }
    if (body.image_url !== undefined) out.image_url = nullableStr(body.image_url, 1000);
    if (body.content !== undefined) out.content = nullableStr(body.content, 2000);
    if (body.link_url !== undefined) out.link_url = nullableStr(body.link_url, 1000);

    if (body.position !== undefined) {
      if (!["center", "bottom-left", "bottom"].includes(body.position as string)) {
        return { error: "팝업 위치가 올바르지 않습니다." };
      }
      out.position = body.position;
    }

    const commonError = applyCommon(body, out);
    if (commonError) return { error: commonError };
    return { data: out };
  },
};

export const NOTICES: ContentResource = {
  table: "notices",
  singular: "notice",
  plural: "notices",
  label: "공지",
  order: [
    { column: "is_pinned", ascending: false },
    { column: "created_at", ascending: false },
  ],
  validate(body, partial) {
    const out: Record<string, unknown> = {};

    if (body.title !== undefined || !partial) {
      const title = str(body.title, 150);
      if (!title) return { error: "공지 제목을 입력해 주세요." };
      out.title = title;
    }
    if (body.content !== undefined || !partial) {
      const content = typeof body.content === "string" ? body.content.trim() : "";
      if (!content) return { error: "공지 내용을 입력해 주세요." };
      out.content = content.slice(0, 10000);
    }
    if (body.is_pinned !== undefined) out.is_pinned = Boolean(body.is_pinned);
    if (body.is_active !== undefined) out.is_active = Boolean(body.is_active);
    return { data: out };
  },
};

/* ---------- 공용 핸들러 ---------- */

export async function listRows(resource: ContentResource) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  let query = service.from(resource.table).select("*").limit(500);
  for (const o of resource.order) {
    query = query.order(o.column, { ascending: o.ascending });
  }
  const { data, error } = await query;

  if (error) {
    console.error(`[admin/content/${resource.table} GET]`, error);
    return NextResponse.json(
      { error: `${resource.label} 목록을 불러오지 못했습니다.` },
      { status: 500 }
    );
  }
  return NextResponse.json({ [resource.plural]: data ?? [] });
}

export async function createRow(resource: ContentResource, req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const { data: cols, error: msg } = resource.validate(body, false);
  if (msg || !cols) return NextResponse.json({ error: msg ?? "잘못된 요청입니다." }, { status: 400 });

  const { data, error } = await service.from(resource.table).insert(cols).select("*").single();
  if (error) {
    console.error(`[admin/content/${resource.table} POST]`, error);
    return NextResponse.json(
      { error: `${resource.label}을(를) 생성하지 못했습니다.` },
      { status: 500 }
    );
  }
  revalidateContent();
  return NextResponse.json({ [resource.singular]: data }, { status: 201 });
}

export async function updateRow(resource: ContentResource, req: Request, id: string) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: `${resource.label}을(를) 찾을 수 없습니다.` }, { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const { data: cols, error: msg } = resource.validate(body, true);
  if (msg || !cols) return NextResponse.json({ error: msg ?? "잘못된 요청입니다." }, { status: 400 });
  if (Object.keys(cols).length === 0) {
    return NextResponse.json({ error: "수정할 내용이 없습니다." }, { status: 400 });
  }

  const { data, error } = await service
    .from(resource.table)
    .update(cols)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error(`[admin/content/${resource.table} PATCH]`, error);
    return NextResponse.json(
      { error: `${resource.label}을(를) 수정하지 못했습니다.` },
      { status: 500 }
    );
  }
  if (!data) {
    // 매칭된 행이 없으면 실제 쓰기가 없었으므로 무효화하지 않는다.
    return NextResponse.json({ error: `${resource.label}을(를) 찾을 수 없습니다.` }, { status: 404 });
  }
  revalidateContent();
  return NextResponse.json({ [resource.singular]: data });
}

export async function deleteRow(resource: ContentResource, id: string) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { service } = auth;

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: `${resource.label}을(를) 찾을 수 없습니다.` }, { status: 404 });
  }

  const { error } = await service.from(resource.table).delete().eq("id", id);
  if (error) {
    console.error(`[admin/content/${resource.table} DELETE]`, error);
    return NextResponse.json(
      { error: `${resource.label}을(를) 삭제하지 못했습니다.` },
      { status: 500 }
    );
  }
  revalidateContent();
  return NextResponse.json({ ok: true });
}
