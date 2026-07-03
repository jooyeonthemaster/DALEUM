import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

/* ============================================================
   VIP 관리자 API 공통 검증/유틸
   ============================================================ */

/** 에러 응답 { error } */
export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** JSON body 파싱 — 실패하거나 객체가 아니면 null */
export async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await req.json()) as unknown;
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/**
 * 선택 텍스트 필드 — 미입력(undefined/null/공백)은 null,
 * 문자열이 아니거나 max를 넘으면 undefined(형식 오류).
 */
export function optText(v: unknown, max: number): string | null | undefined {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (!t) return null;
  if (t.length > max) return undefined;
  return t;
}

/** 0~100 할인율 (소수 둘째 자리 반올림) — 형식 오류면 undefined */
export function rateNum(v: unknown): number | undefined {
  const n =
    typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 100) return undefined;
  return Math.round(n * 100) / 100;
}

/** 1 이상의 정수 — 형식 오류면 undefined */
export function posInt(v: unknown, max = 100_000_000): number | undefined {
  const n =
    typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > max) return undefined;
  return n;
}

/** ISO 일시 — 미입력은 null, 파싱 불가면 undefined */
export function isoDate(v: unknown): string | null | undefined {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

/** 입장 코드/잠금 코드 정규화 — 대문자 영문·숫자 4~20자, 형식 오류면 undefined */
export function normalizeCode(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const code = v.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,20}$/.test(code)) return undefined;
  return code;
}

/** 헷갈리는 글자(O/0, I/1)를 뺀 입장 코드 자동 생성 */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function generateCode(length = 8): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

/** 캠페인 토큰 — URL-safe 소문자/숫자 */
const TOKEN_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
export function generateToken(length = 12): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
  return out;
}

/** Postgres unique 제약 위반 여부 */
export function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === "23505";
}

/** ilike/or 필터에 안전한 검색어 (PostgREST 예약 문자 제거) */
export function sanitizeSearch(q: string): string {
  return q.replace(/[%_,()"'\\]/g, " ").trim();
}
