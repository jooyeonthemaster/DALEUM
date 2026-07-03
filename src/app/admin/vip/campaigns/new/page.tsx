import type { Metadata } from "next";
import CampaignForm from "../_components/CampaignForm";

export const metadata: Metadata = { title: "새 VIP 캠페인" };

/** /admin/vip/campaigns/new — 시크릿 캠페인 만들기 */
export default function NewVipCampaignPage() {
  return <CampaignForm />;
}
