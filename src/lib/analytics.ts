"use client";

/** 경량 자체 분석 — analytics_events 테이블로 전송 */

function sessionId(): string {
  const KEY = "daleum_sid";
  try {
    let sid = sessionStorage.getItem(KEY);
    if (!sid) {
      sid = crypto.randomUUID();
      sessionStorage.setItem(KEY, sid);
    }
    return sid;
  } catch {
    return "anon";
  }
}

export type AnalyticsEvent =
  | "page_view"
  | "product_view"
  | "add_to_cart"
  | "begin_checkout"
  | "purchase"
  | "vip_enter"
  | "vip_campaign_view"
  | "search";

export function track(
  event: AnalyticsEvent,
  data: { path?: string; productId?: string; orderId?: string; meta?: Record<string, unknown> } = {}
) {
  try {
    const body = JSON.stringify({
      event,
      path: data.path ?? window.location.pathname,
      product_id: data.productId ?? null,
      order_id: data.orderId ?? null,
      session_id: sessionId(),
      meta: data.meta ?? {},
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/analytics/track", new Blob([body], { type: "application/json" }));
    } else {
      fetch("/api/analytics/track", { method: "POST", body, keepalive: true });
    }
  } catch {
    // 분석 실패는 절대 UX를 막지 않는다
  }
}
