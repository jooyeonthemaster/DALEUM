"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Tabs from "@/components/admin/Tabs";
import GroupsTab from "./GroupsTab";
import MembersTab from "./MembersTab";
import CodesTab from "./CodesTab";
import PricesTab from "./PricesTab";
import VipStepGuide from "./VipStepGuide";
import { api, type GroupRow } from "./vipApi";

/* ============================================================
   /admin/vip 탭 컨테이너.

   그룹 목록을 여기서 한 번만 읽어 네 탭에 내려 준다.
   예전에는 멤버·입장코드·상품별가격 탭이 각자 그룹을 다시 읽었고,
   그래서 '그룹이 하나도 없다'는 사실을 탭마다 따로 알게 됐다.
   한 곳에서 알아야 탭을 열기 전에 막다른 길임을 알려 줄 수 있다.
   ============================================================ */

const TABS = [
  { key: "groups", label: "그룹" },
  { key: "members", label: "멤버" },
  { key: "codes", label: "입장 코드" },
  { key: "prices", label: "상품별 가격" },
];

export default function VipTabs({ initialTab }: { initialTab: string }) {
  const [tab, setTab] = useState(initialTab);
  const [groups, setGroups] = useState<GroupRow[] | null>(null);
  const [priceCount, setPriceCount] = useState(0);

  const loadOverview = useCallback(async () => {
    try {
      const data = await api<{ groups: GroupRow[] }>("/api/admin/vip/groups");
      setGroups(data.groups);
    } catch {
      setGroups([]);
    }
    try {
      const data = await api<{ total: number }>("/api/admin/vip/prices?summary=1");
      setPriceCount(data.total);
    } catch {
      setPriceCount(0);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(loadOverview, 0);
    return () => clearTimeout(timer);
  }, [loadOverview]);

  function changeTab(key: string) {
    setTab(key);
    window.history.replaceState(null, "", `/admin/vip?tab=${key}`);
  }

  const list = useMemo(() => groups ?? [], [groups]);
  const hasGroup = list.length > 0;
  const hasReach = list.some((g) => g.member_count > 0 || g.code_count > 0);

  /**
   * 진행 안내는 3단계인데 탭은 4개다. 2단계가 멤버 탭과 입장 코드 탭 **둘 다**를
   * 뜻하기 때문이다(done 판정도 `멤버 또는 코드` 로 이미 그렇게 되어 있다).
   * 그래서 각 단계가 어떤 탭들을 덮는지 명시하고, 지금 탭이 그 안에 들면 그 단계를 짚는다.
   * 이걸 안 하면 '입장 코드' 탭에서만 어느 단계도 강조되지 않아, 대표는 자기가 순서
   * 바깥으로 나온 줄 알게 된다(실제로 그 탭에서 안내가 통째로 흐려졌다).
   */
  const steps = [
    {
      key: "groups",
      tabs: ["groups"],
      title: "그룹 만들기",
      description: "혜택의 단위입니다. 그룹마다 전체 할인율을 정합니다.",
      done: hasGroup,
    },
    {
      key: "members",
      tabs: ["members", "codes"],
      title: "고객에게 열어 주기 (멤버 배정 또는 입장 코드)",
      description: "가입 고객은 멤버로 배정하고, 그 외에는 입장 코드를 전달합니다. 둘 중 하나만 해도 됩니다.",
      done: hasReach,
    },
    {
      key: "prices",
      tabs: ["prices"],
      title: "상품별 전용가",
      description: "특정 상품만 따로 값을 매깁니다. 그룹 할인율보다 우선합니다.",
      done: priceCount > 0,
    },
  ];
  // 지금 보고 있는 탭이 속한 단계 — 입장 코드 탭도 2단계로 접어 준다
  const activeStepKey = steps.find((s) => s.tabs.includes(tab))?.key ?? tab;

  return (
    <div>
      <p className="mb-4 text-sm leading-relaxed text-ink-500">
        특별한 고객에게만 열리는 가격과 공간을 관리합니다. 아래 순서대로 진행하세요 — 그룹을 먼저
        만들어야 멤버 배정·입장 코드·상품별 전용가를 붙일 수 있습니다.
      </p>

      <VipStepGuide steps={steps} activeKey={activeStepKey} onGo={changeTab} />

      <Tabs tabs={TABS} active={tab} onChange={changeTab} className="mb-6" />

      {tab === "groups" && <GroupsTab groups={groups} onChanged={loadOverview} />}
      {tab === "members" && (
        <MembersTab
          groups={list}
          groupsLoading={groups === null}
          onGoToGroups={() => changeTab("groups")}
          onChanged={loadOverview}
        />
      )}
      {tab === "codes" && (
        <CodesTab
          groups={list}
          groupsLoading={groups === null}
          onGoToGroups={() => changeTab("groups")}
          onChanged={loadOverview}
        />
      )}
      {tab === "prices" && (
        <PricesTab
          groups={list}
          groupsLoading={groups === null}
          onGoToGroups={() => changeTab("groups")}
          onChanged={loadOverview}
        />
      )}
    </div>
  );
}
