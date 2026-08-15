import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { BULK_INQUIRY_PURPOSES } from "@/lib/constants";
import type { BulkInquiryPurpose } from "@/lib/types";

/**
 * POST /api/bulk-inquiries — 업소용·OEM 견적 문의 접수 (비회원 공개)
 *
 * 거래처 담당자는 회원가입을 하지 않으므로 로그인을 요구하지 않는다.
 * 대신 테이블 RLS 에는 관리자 정책만 있고, 접수는 이 라우트가 service role 로만 수행한다.
 * (클라이언트에서 테이블로 직접 쓰거나 읽는 경로는 열려 있지 않다 — 문의에 연락처가 들어간다)
 */

const MAX = {
  company: 100,
  contact_name: 50,
  phone: 30,
  email: 120,
  biz_no: 20,
  volume: 200,
  message: 3000,
};

/** IP당 접수 제한 — 같은 곳에서 연속 등록되는 것만 막는 수준 */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) {
    // 메모리 누수 방지 — 창을 벗어난 항목 정리
    for (const [k, v] of hits) if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
  }
  return recent.length > MAX_PER_WINDOW;
}

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim();
}

function text(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** 숫자 9자리 이상이면 유효한 연락처로 본다 (02-…, 010-…, +82… 모두 통과) */
const PHONE_DIGITS = 9;

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  // 봇이 자동으로 채우는 미끼 필드 — 사람은 볼 수 없다. 채워져 있으면 조용히 성공 처리한다.
  if (text(body.website, 200)) {
    return NextResponse.json({ ok: true });
  }

  const ip = clientIp(req);
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "문의가 너무 자주 접수되었습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429 }
    );
  }

  const company = text(body.company, MAX.company);
  const contact_name = text(body.contact_name, MAX.contact_name);
  const phone = text(body.phone, MAX.phone);
  const email = text(body.email, MAX.email);
  const message = text(body.message, MAX.message);

  if (!company) return NextResponse.json({ error: "회사명을 입력해 주세요." }, { status: 400 });
  if (!contact_name) return NextResponse.json({ error: "담당자명을 입력해 주세요." }, { status: 400 });
  if ((phone.match(/\d/g) ?? []).length < PHONE_DIGITS)
    return NextResponse.json({ error: "연락처를 정확히 입력해 주세요." }, { status: 400 });
  if (!EMAIL_RE.test(email))
    return NextResponse.json({ error: "이메일 주소를 정확히 입력해 주세요." }, { status: 400 });
  if (message.length < 5)
    return NextResponse.json({ error: "문의 내용을 조금 더 자세히 적어 주세요." }, { status: 400 });

  const purposeRaw = text(body.purpose, 30);
  const purpose = BULK_INQUIRY_PURPOSES.includes(purposeRaw as BulkInquiryPurpose)
    ? (purposeRaw as BulkInquiryPurpose)
    : null;

  const product_slugs = Array.isArray(body.product_slugs)
    ? [...new Set(body.product_slugs.map((s) => text(s, 80)).filter(Boolean))].slice(0, 20)
    : [];

  const service = createServiceClient();
  const { error } = await service.from("bulk_inquiries").insert({
    company,
    contact_name,
    phone,
    email,
    biz_no: text(body.biz_no, MAX.biz_no) || null,
    purpose,
    product_slugs,
    volume: text(body.volume, MAX.volume) || null,
    message,
    source_ip: ip.slice(0, 60),
    user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300) || null,
  });

  if (error) {
    console.error("[bulk-inquiries] insert 실패:", error.message);
    return NextResponse.json(
      { error: "접수 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
