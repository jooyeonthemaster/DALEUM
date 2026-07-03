"use client";

import { useEffect, useRef } from "react";
import { track } from "@/lib/analytics";

/**
 * 시크릿 캠페인 열람 트래킹 — 마운트 시 vip_campaign_view 1회 전송.
 * require_code 게이트 안쪽에 두면 실제로 열람한 경우에만 기록된다.
 */
export default function CampaignViewTracker({
  campaignId,
  token,
}: {
  campaignId: string;
  token: string;
}) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    track("vip_campaign_view", { meta: { campaignId, token } });
  }, [campaignId, token]);

  return null;
}
