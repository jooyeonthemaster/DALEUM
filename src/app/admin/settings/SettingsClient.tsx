"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FieldRow, Input, Help } from "@/components/admin/Field";
import { krw } from "@/lib/format";

/* ---------- 타입 ---------- */

interface ShippingForm {
  base_fee: string;
  free_threshold: string;
  island_extra: string;
}

interface StoreForm {
  name: string;
  cs_phone: string;
  cs_hours: string;
}

/* ---------- 토스트 ---------- */

function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((msg: string) => {
    setMessage(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 2500);
  }, []);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return { message, show };
}

function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-[110] -translate-x-1/2 bg-forest-900 px-5 py-3 text-sm text-cream-50"
    >
      {message}
    </div>
  );
}

/* ---------- 섹션 카드 ---------- */

function SectionCard({
  overline,
  title,
  description,
  children,
  onSave,
  saving,
  error,
}: {
  overline: string;
  title: string;
  description: string;
  children: React.ReactNode;
  onSave: () => void;
  saving: boolean;
  error: string | null;
}) {
  return (
    <section className="border border-ink-200 bg-cream-50">
      <div className="border-b border-ink-100 px-6 py-5">
        <p className="label-caps text-forest-600">{overline}</p>
        <h2 className="mt-1.5 headline-serif text-lg text-ink-900">{title}</h2>
        <p className="mt-1 text-xs text-ink-400">{description}</p>
      </div>
      <div className="divide-y divide-ink-100 px-6">{children}</div>
      <div className="flex items-center justify-between gap-4 border-t border-ink-100 px-6 py-4">
        <div>{error && <Help tone="error" className="mt-0">{error}</Help>}</div>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="shrink-0 bg-forest-700 px-5 py-2.5 text-sm text-cream-50 transition-colors hover:bg-forest-800 disabled:opacity-50"
        >
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>
    </section>
  );
}

/* ---------- 페이지 ---------- */

export default function SettingsClient() {
  const [shipping, setShipping] = useState<ShippingForm | null>(null);
  const [store, setStore] = useState<StoreForm | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [savingKey, setSavingKey] = useState<"shipping" | "store" | null>(null);
  const [shippingError, setShippingError] = useState<string | null>(null);
  const [storeError, setStoreError] = useState<string | null>(null);

  const { message, show } = useToast();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/settings", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "설정을 불러오지 못했습니다.");
      setShipping({
        base_fee: String(body.shipping.base_fee),
        free_threshold: String(body.shipping.free_threshold),
        island_extra: String(body.shipping.island_extra),
      });
      setStore({
        name: body.store.name ?? "",
        cs_phone: body.store.cs_phone ?? "",
        cs_hours: body.store.cs_hours ?? "",
      });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "설정을 불러오지 못했습니다.");
    }
  }, []);

  useEffect(() => {
    // 데이터 로드 — setState는 모두 fetch 완료(await) 이후에만 실행된다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  function retry() {
    setLoadError(null);
    void load();
  }

  async function save(key: "shipping" | "store") {
    const value = key === "shipping" ? shipping : store;
    if (!value) return;
    setSavingKey(key);
    if (key === "shipping") setShippingError(null);
    else setStoreError(null);

    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "저장에 실패했습니다.");
      show(key === "shipping" ? "배송 설정을 저장했습니다." : "스토어 정보를 저장했습니다.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "저장에 실패했습니다.";
      if (key === "shipping") setShippingError(msg);
      else setStoreError(msg);
    } finally {
      setSavingKey(null);
    }
  }

  if (loadError) {
    return (
      <div className="py-24 text-center">
        <p className="headline-serif text-lg text-ink-500">{loadError}</p>
        <button
          type="button"
          onClick={retry}
          className="mt-6 border border-ink-200 bg-cream-50 px-4 py-2.5 text-sm text-ink-700 transition-colors hover:bg-cream-100"
        >
          다시 불러오기
        </button>
      </div>
    );
  }

  if (!shipping || !store) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-72 animate-pulse border border-ink-200 bg-cream-100" />
        ))}
      </div>
    );
  }

  const freeThreshold = Number(shipping.free_threshold);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* ---------- 배송 설정 ---------- */}
      <SectionCard
        overline="Shipping"
        title="배송 설정"
        description="주문 금액에 따른 배송비 계산에 바로 반영됩니다."
        onSave={() => save("shipping")}
        saving={savingKey === "shipping"}
        error={shippingError}
      >
        <FieldRow label="기본 배송비" htmlFor="ship-base" help="할인 반영 후 상품 합계가 무료 기준 미만일 때 부과됩니다.">
          <div className="flex items-center gap-2">
            <Input
              id="ship-base"
              type="number"
              min={0}
              className="max-w-40"
              value={shipping.base_fee}
              onChange={(e) => setShipping({ ...shipping, base_fee: e.target.value })}
            />
            <span className="text-sm text-ink-500">원</span>
          </div>
        </FieldRow>
        <FieldRow
          label="무료배송 기준"
          htmlFor="ship-free"
          help={
            Number.isFinite(freeThreshold) && freeThreshold > 0
              ? `${krw(freeThreshold)}원 이상 주문 시 배송비가 무료가 됩니다.`
              : "0이면 모든 주문이 무료배송됩니다."
          }
        >
          <div className="flex items-center gap-2">
            <Input
              id="ship-free"
              type="number"
              min={0}
              className="max-w-40"
              value={shipping.free_threshold}
              onChange={(e) => setShipping({ ...shipping, free_threshold: e.target.value })}
            />
            <span className="text-sm text-ink-500">원</span>
          </div>
        </FieldRow>
        <FieldRow label="도서산간 추가비" htmlFor="ship-island" help="제주/도서산간 지역 배송 시 추가되는 금액입니다.">
          <div className="flex items-center gap-2">
            <Input
              id="ship-island"
              type="number"
              min={0}
              className="max-w-40"
              value={shipping.island_extra}
              onChange={(e) => setShipping({ ...shipping, island_extra: e.target.value })}
            />
            <span className="text-sm text-ink-500">원</span>
          </div>
        </FieldRow>
      </SectionCard>

      {/* ---------- 스토어 정보 ---------- */}
      <SectionCard
        overline="Store"
        title="스토어 정보"
        description="고객센터 안내 등 스토어 곳곳에 표시되는 정보입니다."
        onSave={() => save("store")}
        saving={savingKey === "store"}
        error={storeError}
      >
        <FieldRow label="스토어 이름" htmlFor="store-name">
          <Input
            id="store-name"
            className="max-w-60"
            value={store.name}
            onChange={(e) => setStore({ ...store, name: e.target.value })}
          />
        </FieldRow>
        <FieldRow label="CS 전화" htmlFor="store-phone">
          <Input
            id="store-phone"
            className="max-w-60"
            value={store.cs_phone}
            onChange={(e) => setStore({ ...store, cs_phone: e.target.value })}
            placeholder="031-963-3375"
          />
        </FieldRow>
        <FieldRow label="운영시간" htmlFor="store-hours">
          <Input
            id="store-hours"
            value={store.cs_hours}
            onChange={(e) => setStore({ ...store, cs_hours: e.target.value })}
            placeholder="평일 10:00 – 17:00 (점심 12:00 – 13:00)"
          />
        </FieldRow>
      </SectionCard>

      <Toast message={message} />
    </div>
  );
}
