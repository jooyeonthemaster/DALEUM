"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import CampaignBasics from "./CampaignBasics";
import CampaignItems from "./CampaignItems";
import CampaignShareCard from "./CampaignShareCard";
import {
  EMPTY_CAMPAIGN_DRAFT,
  itemInvalidReason,
  type CampaignDraft,
  type ItemDraft,
} from "./campaignDraft";
import {
  api,
  BTN_DANGER,
  BTN_GHOST,
  BTN_PRIMARY,
  isoToDateInput,
  kstDayEnd,
  type CampaignDetail,
  type GroupRow,
} from "../../_components/vipApi";

/* ============================================================
   시크릿 캠페인 만들기/수정 — 신규(/new)와 수정([id]) 공용.

   이 파일은 상태와 저장만 맡는다. 화면은 세 조각으로 나눴다:
   CampaignBasics(기본 정보·열람 범위) / CampaignItems(상품과 가격) /
   CampaignShareCard(고객에게 보낼 링크).
   예전에는 한 파일 532줄이라 어디를 고쳐야 하는지 찾기부터 일이었다.
   ============================================================ */

export default function CampaignForm({ campaignId }: { campaignId?: string }) {
  const router = useRouter();
  const isEdit = Boolean(campaignId);

  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [draft, setDraft] = useState<CampaignDraft>(EMPTY_CAMPAIGN_DRAFT);
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [token, setToken] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api<{ groups: GroupRow[] }>("/api/admin/vip/groups")
      .then((data) => setGroups(data.groups))
      .catch(() => setGroups([]));
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, []);

  // 수정 모드 — 저장된 캠페인을 폼에 채운다
  useEffect(() => {
    if (!campaignId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await api<{ campaign: CampaignDetail }>(
          `/api/admin/vip/campaigns/${campaignId}`
        );
        if (cancelled) return;
        const c = data.campaign;
        setDraft({
          title: c.title,
          message: c.message ?? "",
          heroUrl: c.hero_image_url,
          expires: isoToDateInput(c.expires_at),
          active: c.is_active,
          targetType: c.group_id ? "group" : c.target_user_id ? "user" : "none",
          groupId: c.group_id ?? "",
          customer: c.target_user_id
            ? c.profiles
              ? { id: c.profiles.id, name: c.profiles.name, email: c.profiles.email, phone: null }
              : { id: c.target_user_id, name: null, email: null, phone: null }
            : null,
          requireCode: c.require_code ?? "",
        });
        setToken(c.token);
        setItems(
          c.vip_campaign_items.map((item) => ({
            productId: item.product_id,
            name: item.products?.name ?? "삭제된 상품",
            price: item.products?.price ?? item.custom_price,
            cost: item.products?.cost_price ?? null,
            value: String(item.custom_price),
          }))
        );
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "캠페인을 불러오지 못했습니다.");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  function showNotice(text: string) {
    setNotice(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 6000);
  }

  function patch(next: Partial<CampaignDraft>) {
    setDraft((prev) => ({ ...prev, ...next }));
  }

  /** 저장 전 검사 — 막는 이유를 사람 말로 돌려준다 */
  function validate(): string | null {
    if (!draft.title.trim()) return "캠페인 제목을 넣어 주세요.";
    if (draft.targetType === "group" && !draft.groupId) return "어느 그룹에게 열지 골라 주세요.";
    if (draft.targetType === "user" && !draft.customer) {
      return "어느 고객에게 열지 검색해 골라 주세요.";
    }
    const code = draft.requireCode.trim().toUpperCase();
    if (code && !/^[A-Z0-9]{4,20}$/.test(code)) {
      return "암호는 영문 대문자와 숫자만으로 4~20자를 넣어 주세요.";
    }
    if (items.length === 0) return "캠페인에 담을 상품을 1개 이상 골라 주세요.";
    for (const item of items) {
      const reason = itemInvalidReason(item);
      if (reason) return `'${item.name}' — ${reason}`;
    }
    return null;
  }

  async function save() {
    const invalid = validate();
    if (invalid) {
      setError(invalid);
      return;
    }

    setSaving(true);
    setError(null);
    const payload = JSON.stringify({
      title: draft.title.trim(),
      message: draft.message.trim() || null,
      group_id: draft.targetType === "group" ? draft.groupId : null,
      target_user_id: draft.targetType === "user" ? draft.customer!.id : null,
      require_code: draft.requireCode.trim() ? draft.requireCode.trim().toUpperCase() : null,
      hero_image_url: draft.heroUrl,
      expires_at: kstDayEnd(draft.expires),
      is_active: draft.active,
      items: items.map((item) => ({
        product_id: item.productId,
        custom_price: Number(item.value),
      })),
    });

    try {
      if (isEdit) {
        await api(`/api/admin/vip/campaigns/${campaignId}`, { method: "PATCH", body: payload });
        showNotice("저장했습니다. 위의 ‘안내 문구 복사’로 고객에게 보내세요.");
      } else {
        const data = await api<{ campaign: CampaignDetail }>("/api/admin/vip/campaigns", {
          method: "POST",
          body: payload,
        });
        router.replace(`/admin/vip/campaigns/${data.campaign.id}`);
        return; // 이동한 화면에서 공유 카드가 보인다
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    // 폼과 같은 폭(max-w-4xl)으로 자리를 잡아 둔다 — 폭이 다르면 다 읽힌 순간 화면이 튄다
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-40 animate-pulse border border-ink-200 bg-cream-100" />
        ))}
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="border border-ink-200 bg-cream-50 px-6 py-16 text-center">
        <p className="headline-serif text-lg text-ink-900">{loadError}</p>
        <Link href="/admin/vip/campaigns" className={`mt-6 inline-block ${BTN_GHOST}`}>
          캠페인 목록으로
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/admin/vip/campaigns"
            className="text-sm text-ink-500 transition-colors hover:text-forest-700"
          >
            ← 캠페인 목록
          </Link>
          <h1 className="headline-serif mt-1 text-xl text-ink-900">
            {isEdit ? draft.title || "캠페인 수정" : "새 캠페인 만들기"}
          </h1>
          {!isEdit && (
            <p className="mt-1 text-sm text-ink-500">
              고른 상품을 특별한 가격으로 담아, 링크를 받은 고객에게만 열리는 페이지를 만듭니다.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isEdit && (
            <button type="button" onClick={() => setDeleteOpen(true)} className={BTN_DANGER}>
              삭제
            </button>
          )}
          <button type="button" onClick={save} disabled={saving} className={BTN_PRIMARY}>
            {saving ? "저장 중…" : isEdit ? "저장" : "캠페인 만들기"}
          </button>
        </div>
      </div>

      {notice && (
        <p className="mb-4 border border-forest-200 bg-forest-50 px-4 py-2.5 text-sm leading-relaxed text-forest-800">
          {notice}
        </p>
      )}
      {error && (
        <p className="mb-4 border border-signal-red/30 bg-[#f6e8e3] px-4 py-2.5 text-sm text-signal-red">
          {error}
        </p>
      )}

      {token && (
        <CampaignShareCard token={token} title={draft.title} onNotice={showNotice} />
      )}

      <CampaignBasics draft={draft} onPatch={patch} groups={groups} />
      <CampaignItems items={items} onChange={setItems} />

      <div className="mt-6 flex justify-end">
        <button type="button" onClick={save} disabled={saving} className={BTN_PRIMARY}>
          {saving ? "저장 중…" : isEdit ? "저장" : "캠페인 만들기"}
        </button>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => {
          await api(`/api/admin/vip/campaigns/${campaignId}`, { method: "DELETE" });
          router.push("/admin/vip/campaigns");
        }}
        title="캠페인 삭제"
        description={`'${draft.title}' 캠페인을 지웁니다. 이미 보낸 링크는 더 이상 열리지 않으며 되돌릴 수 없습니다.`}
        confirmLabel="삭제"
        danger
      />
    </div>
  );
}
