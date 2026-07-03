import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * 경량 자체 분석 이벤트 수집.
 * - sendBeacon/fetch keepalive로 호출됨 (클라이언트 @/lib/analytics)
 * - 어떤 경우에도 200 반환: 분석 실패가 UX를 막으면 안 된다
 * - body 크기/필드 길이를 엄격히 제한해 스팸성 대량 insert를 완화
 */

const MAX_BODY_BYTES = 4096;
const MAX_META_BYTES = 2048;
const ALLOWED_EVENTS = new Set([
  "page_view",
  "product_view",
  "add_to_cart",
  "begin_checkout",
  "purchase",
  "vip_enter",
  "vip_campaign_view",
  "search",
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ok() {
  return NextResponse.json({ ok: true });
}

function asUuid(v: unknown): string | null {
  return typeof v === "string" && UUID_RE.test(v) ? v : null;
}

export async function POST(req: NextRequest) {
  try {
    const text = await req.text();
    if (!text || text.length > MAX_BODY_BYTES) return ok();

    const body = JSON.parse(text) as Record<string, unknown>;

    const event = typeof body.event === "string" ? body.event.slice(0, 64) : "";
    if (!ALLOWED_EVENTS.has(event)) return ok();

    const sessionId = typeof body.session_id === "string" ? body.session_id.slice(0, 64) : null;
    if (!sessionId) return ok();

    const path = typeof body.path === "string" ? body.path.slice(0, 512) : null;

    let meta: Record<string, unknown> = {};
    if (body.meta && typeof body.meta === "object" && !Array.isArray(body.meta)) {
      const serialized = JSON.stringify(body.meta);
      if (serialized.length <= MAX_META_BYTES) meta = body.meta as Record<string, unknown>;
    }

    const service = createServiceClient();
    await service.from("analytics_events").insert({
      event,
      path,
      product_id: asUuid(body.product_id),
      order_id: asUuid(body.order_id),
      session_id: sessionId,
      meta,
    });
  } catch {
    // 수집 실패는 조용히 무시
  }
  return ok();
}
