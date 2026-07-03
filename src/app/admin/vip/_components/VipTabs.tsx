"use client";

import { useState } from "react";
import Tabs from "@/components/admin/Tabs";
import GroupsTab from "./GroupsTab";
import MembersTab from "./MembersTab";
import CodesTab from "./CodesTab";
import PricesTab from "./PricesTab";

const TABS = [
  { key: "groups", label: "그룹" },
  { key: "members", label: "멤버" },
  { key: "codes", label: "입장 코드" },
  { key: "prices", label: "상품별 가격" },
];

/** /admin/vip 탭 컨테이너 — 탭 상태를 URL 쿼리에 반영해 새로고침에도 유지 */
export default function VipTabs({ initialTab }: { initialTab: string }) {
  const [tab, setTab] = useState(initialTab);

  function changeTab(key: string) {
    setTab(key);
    window.history.replaceState(null, "", `/admin/vip?tab=${key}`);
  }

  return (
    <div>
      <p className="mb-4 text-sm text-ink-500">
        특별한 고객에게만 열리는 가격과 공간을 관리합니다. 그룹을 만들고, 멤버를 배정하고,
        입장 코드와 상품별 전용 가격으로 프라이빗한 혜택을 설계하세요.
      </p>
      <Tabs tabs={TABS} active={tab} onChange={changeTab} className="mb-6" />
      {tab === "groups" && <GroupsTab />}
      {tab === "members" && <MembersTab />}
      {tab === "codes" && <CodesTab />}
      {tab === "prices" && <PricesTab />}
    </div>
  );
}
