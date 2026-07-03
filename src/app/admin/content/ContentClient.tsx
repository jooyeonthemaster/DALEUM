"use client";

import { useState } from "react";
import Tabs from "@/components/admin/Tabs";
import BannersTab from "./BannersTab";
import PopupsTab from "./PopupsTab";
import NoticesTab from "./NoticesTab";

/** 콘텐츠 관리 — 배너 / 팝업 / 공지 3탭 */
export default function ContentClient() {
  const [tab, setTab] = useState("banners");

  return (
    <div>
      <Tabs
        className="mb-6"
        tabs={[
          { key: "banners", label: "배너" },
          { key: "popups", label: "팝업" },
          { key: "notices", label: "공지" },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === "banners" && <BannersTab />}
      {tab === "popups" && <PopupsTab />}
      {tab === "notices" && <NoticesTab />}
    </div>
  );
}
