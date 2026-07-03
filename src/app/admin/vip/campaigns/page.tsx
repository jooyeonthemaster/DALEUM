import type { Metadata } from "next";
import CampaignList from "./_components/CampaignList";

export const metadata: Metadata = { title: "VIP 캠페인" };

/**
 * /admin/vip/campaigns — 시크릿 캠페인 목록
 * 특정 고객/그룹에게 링크로 전달하는 전용 할인 페이지를 관리한다.
 */
export default function VipCampaignsPage() {
  return <CampaignList />;
}
