import type { Metadata } from "next";
import VipTabs from "./_components/VipTabs";

export const metadata: Metadata = { title: "VIP 관리" };

const TAB_KEYS = ["groups", "members", "codes", "prices"];

/**
 * /admin/vip — VIP 그룹/멤버/입장 코드/상품별 가격 관리 (탭 4개)
 */
export default async function VipAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const initialTab = tab && TAB_KEYS.includes(tab) ? tab : "groups";
  return <VipTabs initialTab={initialTab} />;
}
