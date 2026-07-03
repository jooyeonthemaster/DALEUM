import type { Metadata } from "next";
import CampaignForm from "../_components/CampaignForm";

export const metadata: Metadata = { title: "VIP 캠페인 수정" };

/** /admin/vip/campaigns/[id] — 시크릿 캠페인 수정 + 공유 링크 */
export default async function EditVipCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CampaignForm campaignId={id} />;
}
