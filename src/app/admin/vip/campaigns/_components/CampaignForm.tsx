"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ExternalLink, X } from "lucide-react";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import ImageUploader from "@/components/admin/ImageUploader";
import { FieldRow, Input, Select, Textarea, Toggle } from "@/components/admin/Field";
import { discountRate, krw } from "@/lib/format";
import CustomerSearch from "../../_components/CustomerSearch";
import ProductSearch from "../../_components/ProductSearch";
import {
  api,
  BTN_DANGER,
  BTN_GHOST,
  BTN_PRIMARY,
  campaignUrl,
  copyText,
  isoToDateInput,
  kstDayEnd,
  type CampaignDetail,
  type CustomerHit,
  type GroupRow,
  type ProductHit,
} from "../../_components/vipApi";

/* ============================================================
   시크릿 캠페인 빌더 — 신규(/new)와 수정([id]) 공용
   제목/인사말/대상/코드 잠금/히어로/만료 + 상품 큐레이션(캠페인가·순서)
   ============================================================ */

type TargetType = "none" | "group" | "user";

interface ItemDraft {
  productId: string;
  name: string;
  price: number; // 정가
  value: string; // 캠페인가 입력값
}

const MESSAGE_PLACEHOLDER =
  "고객님께 드리는 감사의 마음을 담아, 이곳에서만 만나실 수 있는 가격으로 준비했습니다.";

export default function CampaignForm({ campaignId }: { campaignId?: string }) {
  const router = useRouter();
  const isEdit = Boolean(campaignId);

  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [groups, setGroups] = useState<GroupRow[]>([]);

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const [expires, setExpires] = useState("");
  const [active, setActive] = useState(true);
  const [targetType, setTargetType] = useState<TargetType>("none");
  const [groupId, setGroupId] = useState("");
  const [customer, setCustomer] = useState<CustomerHit | null>(null);
  const [requireCode, setRequireCode] = useState("");
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

  // 수정 모드 — 캠페인 로드
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
        setTitle(c.title);
        setMessage(c.message ?? "");
        setHeroUrl(c.hero_image_url);
        setExpires(isoToDateInput(c.expires_at));
        setActive(c.is_active);
        setRequireCode(c.require_code ?? "");
        setToken(c.token);
        if (c.group_id) {
          setTargetType("group");
          setGroupId(c.group_id);
        } else if (c.target_user_id) {
          setTargetType("user");
          setCustomer(
            c.profiles
              ? { id: c.profiles.id, name: c.profiles.name, email: c.profiles.email, phone: null }
              : { id: c.target_user_id, name: null, email: null, phone: null }
          );
        }
        setItems(
          c.vip_campaign_items.map((item) => ({
            productId: item.product_id,
            name: item.products?.name ?? "삭제된 상품",
            price: item.products?.price ?? item.custom_price,
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
    noticeTimer.current = setTimeout(() => setNotice(null), 5000);
  }

  function addProduct(product: ProductHit) {
    setItems((prev) => [
      ...prev,
      { productId: product.id, name: product.name, price: product.price, value: "" },
    ]);
  }

  function moveItem(index: number, dir: -1 | 1) {
    setItems((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function itemInvalidReason(item: ItemDraft): string | null {
    const n = Number(item.value);
    if (item.value.trim() === "" || !Number.isInteger(n) || n < 1) {
      return "캠페인가를 1원 이상의 정수로 입력해 주세요.";
    }
    if (n > item.price) return "캠페인가는 정가를 넘을 수 없습니다.";
    return null;
  }

  async function save() {
    if (!title.trim()) {
      setError("캠페인 제목을 입력해 주세요.");
      return;
    }
    if (targetType === "group" && !groupId) {
      setError("대상 그룹을 선택해 주세요.");
      return;
    }
    if (targetType === "user" && !customer) {
      setError("대상 고객을 검색해 선택해 주세요.");
      return;
    }
    if (requireCode.trim() && !/^[A-Z0-9]{4,20}$/.test(requireCode.trim().toUpperCase())) {
      setError("잠금 코드는 영문 대문자·숫자 4~20자로 입력해 주세요.");
      return;
    }
    if (items.length === 0) {
      setError("캠페인에 담을 상품을 1개 이상 추가해 주세요.");
      return;
    }
    for (const item of items) {
      const reason = itemInvalidReason(item);
      if (reason) {
        setError(`'${item.name}' — ${reason}`);
        return;
      }
    }

    setSaving(true);
    setError(null);
    const payload = JSON.stringify({
      title: title.trim(),
      message: message.trim() || null,
      group_id: targetType === "group" ? groupId : null,
      target_user_id: targetType === "user" ? customer!.id : null,
      require_code: requireCode.trim() ? requireCode.trim().toUpperCase() : null,
      hero_image_url: heroUrl,
      expires_at: kstDayEnd(expires),
      is_active: active,
      items: items.map((item) => ({
        product_id: item.productId,
        custom_price: Number(item.value),
      })),
    });

    try {
      if (isEdit) {
        await api(`/api/admin/vip/campaigns/${campaignId}`, { method: "PATCH", body: payload });
        showNotice("캠페인이 저장되었습니다. 아래 링크를 고객에게 전달하세요.");
      } else {
        const data = await api<{ campaign: CampaignDetail }>("/api/admin/vip/campaigns", {
          method: "POST",
          body: payload,
        });
        router.replace(`/admin/vip/campaigns/${data.campaign.id}`);
        return; // 이동 후 공유 카드가 보인다
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function copyShareLink() {
    if (!token) return;
    const ok = await copyText(campaignUrl(token));
    if (ok) showNotice("링크가 복사되었습니다 — 고객에게 문자·카톡으로 전달하세요.");
  }

  if (loading) {
    return (
      <div className="space-y-4">
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
            {isEdit ? title || "캠페인 수정" : "새 시크릿 캠페인"}
          </h1>
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
        <p className="mb-4 border border-forest-200 bg-forest-50 px-4 py-2.5 text-sm text-forest-800">
          {notice}
        </p>
      )}
      {error && (
        <p className="mb-4 border border-signal-red/30 bg-[#f6e8e3] px-4 py-2.5 text-sm text-signal-red">
          {error}
        </p>
      )}

      {/* 공유 카드 — 저장된 캠페인만 */}
      {token && (
        <div className="mb-6 border border-forest-600/40 bg-forest-50 p-5">
          <p className="label-caps text-forest-700">Secret Link</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="krw min-w-0 flex-1 basis-64 truncate border border-ink-200 bg-cream-50 px-3 py-2 text-sm text-ink-900">
              {campaignUrl(token)}
            </code>
            <button type="button" onClick={copyShareLink} className={BTN_PRIMARY}>
              링크 복사
            </button>
            <a
              href={`/vip/s/${token}`}
              target="_blank"
              rel="noopener"
              className={`inline-flex items-center gap-1.5 ${BTN_GHOST}`}
            >
              미리보기
              <ExternalLink size={14} strokeWidth={1.5} />
            </a>
          </div>
          <p className="mt-2 text-xs text-ink-500">
            이 링크를 고객에게 문자·카톡으로 전달하세요. 링크를 아는 사람만 페이지를 볼 수 있습니다.
          </p>
        </div>
      )}

      {/* 기본 정보 */}
      <section className="border border-ink-200 bg-cream-50 p-5">
        <h2 className="label-caps mb-2 text-ink-400">기본 정보</h2>
        <div className="divide-y divide-ink-100">
          <FieldRow label="제목" required htmlFor="camp-title">
            <Input
              id="camp-title"
              value={title}
              maxLength={100}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 단골 고객님을 위한 여름 감사전"
            />
          </FieldRow>
          <FieldRow label="인사말" htmlFor="camp-message" help="캠페인 페이지 상단에 세리프체로 표시됩니다.">
            <Textarea
              id="camp-message"
              rows={4}
              value={message}
              maxLength={2000}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={MESSAGE_PLACEHOLDER}
            />
          </FieldRow>
          <FieldRow label="히어로 이미지" help="캠페인 페이지 상단 배경. 어두운 톤의 이미지를 권장합니다.">
            <ImageUploader
              value={heroUrl ? [{ url: heroUrl }] : []}
              onChange={(next) => setHeroUrl(next[next.length - 1]?.url ?? null)}
              bucket="banners"
              prefix="vip-campaigns"
              multiple={false}
            />
          </FieldRow>
          <FieldRow label="만료일" htmlFor="camp-expires" help="해당 날짜의 자정까지 열립니다. 비워두면 만료 없음.">
            <Input
              id="camp-expires"
              type="date"
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
              className="max-w-44"
            />
          </FieldRow>
          <FieldRow label="활성 상태" help="끄면 링크가 있어도 만료 안내가 표시됩니다.">
            <Toggle checked={active} onChange={setActive} label={active ? "활성" : "비활성"} />
          </FieldRow>
        </div>
      </section>

      {/* 대상 설정 */}
      <section className="mt-4 border border-ink-200 bg-cream-50 p-5">
        <h2 className="label-caps mb-2 text-ink-400">대상 설정</h2>
        <div className="divide-y divide-ink-100">
          <FieldRow label="열람 대상" help="'링크 공개'는 링크를 아는 사람 누구나 볼 수 있습니다.">
            <div className="flex flex-wrap gap-4 pb-3">
              {(
                [
                  { key: "none", label: "링크 공개" },
                  { key: "group", label: "특정 그룹" },
                  { key: "user", label: "개별 고객" },
                ] as const
              ).map((option) => (
                <label
                  key={option.key}
                  className="flex cursor-pointer items-center gap-1.5 text-sm text-ink-700"
                >
                  <input
                    type="radio"
                    name="camp-target"
                    checked={targetType === option.key}
                    onChange={() => setTargetType(option.key)}
                    className="accent-forest-700"
                  />
                  {option.label}
                </label>
              ))}
            </div>
            {targetType === "group" && (
              <Select value={groupId} onChange={(e) => setGroupId(e.target.value)} aria-label="대상 그룹">
                <option value="">그룹 선택</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            )}
            {targetType === "user" && <CustomerSearch value={customer} onChange={setCustomer} />}
          </FieldRow>
          <FieldRow
            label="추가 코드 잠금"
            htmlFor="camp-code"
            help="입력하면 이 코드를 아는 고객만 페이지를 열 수 있습니다. 비워두면 잠금 없음."
          >
            <Input
              id="camp-code"
              value={requireCode}
              maxLength={20}
              onChange={(e) => setRequireCode(e.target.value.toUpperCase())}
              placeholder="예: THANKS2026"
              className="krw max-w-56 uppercase tracking-[0.08em]"
            />
          </FieldRow>
        </div>
      </section>

      {/* 상품 큐레이션 */}
      <section className="mt-4 border border-ink-200 bg-cream-50 p-5">
        <h2 className="label-caps mb-2 text-ink-400">상품 큐레이션</h2>
        <p className="mb-3 text-sm text-ink-500">
          상품을 검색해 담고, 이 캠페인에서만 적용될 가격을 정하세요. 위에서부터 순서대로
          진열됩니다.
        </p>
        <ProductSearch onAdd={addProduct} excludeIds={items.map((item) => item.productId)} />

        {items.length === 0 ? (
          <p className="mt-4 border border-dashed border-ink-300 px-4 py-8 text-center text-sm text-ink-400">
            아직 담긴 상품이 없습니다. 상품을 검색해 추가해 주세요.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-ink-100 border border-ink-200">
            {items.map((item, i) => {
              const n = Number(item.value);
              const valid = itemInvalidReason(item) === null;
              return (
                <li key={item.productId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                  <div className="flex shrink-0 flex-col">
                    <button
                      type="button"
                      onClick={() => moveItem(i, -1)}
                      disabled={i === 0}
                      aria-label="위로 이동"
                      className="p-0.5 text-ink-400 transition-colors hover:text-forest-700 disabled:opacity-30"
                    >
                      <ArrowUp size={14} strokeWidth={1.5} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveItem(i, 1)}
                      disabled={i === items.length - 1}
                      aria-label="아래로 이동"
                      className="p-0.5 text-ink-400 transition-colors hover:text-forest-700 disabled:opacity-30"
                    >
                      <ArrowDown size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                  <span className="krw w-6 shrink-0 text-center text-xs text-ink-400">{i + 1}</span>
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="truncate text-sm text-ink-900">{item.name}</p>
                    <p className="krw text-xs text-ink-400">정가 {krw(item.price)}원</p>
                  </div>
                  <div className="relative w-36 shrink-0">
                    <Input
                      type="number"
                      min={1}
                      max={item.price}
                      step={10}
                      value={item.value}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((it, idx) => (idx === i ? { ...it, value: e.target.value } : it))
                        )
                      }
                      placeholder="캠페인가"
                      aria-label="캠페인가"
                      className="krw pr-9"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-400">
                      원
                    </span>
                  </div>
                  <p className="krw w-16 shrink-0 text-right text-sm">
                    {valid ? (
                      <span className="font-semibold text-forest-700">
                        {discountRate(item.price, n)}%
                      </span>
                    ) : (
                      <span className="text-ink-300">—</span>
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                    aria-label="상품 제거"
                    className="shrink-0 p-1 text-ink-400 transition-colors hover:text-signal-red"
                  >
                    <X size={16} strokeWidth={1.5} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="mt-6 flex justify-end">
        <button type="button" onClick={save} disabled={saving} className={BTN_PRIMARY}>
          {saving ? "저장 중…" : isEdit ? "저장" : "캠페인 만들기"}
        </button>
      </div>

      {/* 삭제 확인 */}
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => {
          await api(`/api/admin/vip/campaigns/${campaignId}`, { method: "DELETE" });
          router.push("/admin/vip/campaigns");
        }}
        title="캠페인 삭제"
        description={`'${title}' 캠페인을 삭제합니다. 전달된 링크는 더 이상 열리지 않으며 되돌릴 수 없습니다.`}
        confirmLabel="삭제"
        danger
      />
    </div>
  );
}
