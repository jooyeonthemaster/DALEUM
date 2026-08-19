"use client";

/* ============================================================
   설정 화면

   고친 것과 그 이유:
   1) 영문 머리글 'SHIPPING'·'STORE' 를 없앴다. 그 문자열은 저장 요청에 실려 가는 내부 키와
      같은 값이었고, 바로 아래 한국어 제목과 중복이라 화면이 미완성으로 보였다.
   2) 'CS 전화' 회색 예시 문구를 값으로 착각하는 문제 — placeholder 를 '예: …' 로 바꾸고,
      비어 있으면 입력칸 옆에 '미설정' 배지를 띄운다. 저장 전에 화면에서 먼저 막는다.
   3) 각 항목이 **어디에 반영되는지**를 적었다. 배송비는 장바구니·상품 상세에 즉시 반영되지만,
      스토어 정보는 지금 어느 화면도 읽지 않는다 — 그 사실을 숨기지 않고 그대로 말한다.
      (고객 화면은 lib/constants.ts 의 고정값을 쓴다. 연결은 이 화면의 소관이 아니다.)
   4) '도서산간 추가비' 도 같은 부류였다. 도움말이 '기본 배송비에 더해지는 금액' 이라고
      단정했지만 결제 계산에는 한 푼도 붙지 않는다 — 안내 문장에만 쓰인다. 같은 형태의
      경고를 붙였다. (3)과 (4)를 한 화면에서 다르게 말하면 어느 쪽을 믿어야 할지 모른다.

   카드 셸·토스트·검증 규칙은 settings-ui.tsx 로 옮겼다.
   ============================================================ */

import { useCallback, useEffect, useState } from "react";
import { FieldRow, Input, Help } from "@/components/admin/Field";
import { krw } from "@/lib/format";
import CompanyInfoCard from "./CompanyInfoCard";
import {
  EmptyBadge,
  NotWiredNotice,
  SectionCard,
  Toast,
  useToast,
  validateStore,
  type ShippingForm,
  type StoreField,
  type StoreForm,
} from "./settings-ui";

/* ---------- 조각 ---------- */

/**
 * '저장은 되지만 결제 금액에는 아직 반영되지 않는 값' 이라는 경고.
 * settings-ui.tsx 의 NotWiredNotice 와 같은 생김새를 쓰되(관리자가 같은 뜻으로 읽어야 한다),
 * 그 조각은 스토어 정보 전용 문구를 품고 있고 이번 파도에서 공용 파일은 손대지 않기로 해서
 * 이 화면 안에 따로 둔다.
 */
function PartialWireNotice() {
  return (
    <div className="mt-2.5 flex gap-2.5 border border-ink-200 bg-cream-100 px-3 py-2.5">
      <span aria-hidden className="mt-1 h-2 w-2 shrink-0 rounded-full bg-signal-amber" />
      <div className="text-xs leading-relaxed text-ink-600">
        <p className="font-medium text-ink-800">
          이 금액은 아직 실제 결제 금액에 자동으로 더해지지 않습니다.
        </p>
        <p className="mt-1 text-ink-500">
          지금은 상품 상세의 배송 안내 문구(&ldquo;도서산간은 추가 배송비가 발생할 수
          있습니다&rdquo;)에만 쓰입니다. 제주·도서산간 주문의 추가 배송비는 따로 받아야 합니다.
          결제에 자동으로 반영하려면 담당자에게 알려 주세요.
        </p>
      </div>
    </div>
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
  const [storeFieldErrors, setStoreFieldErrors] = useState<Partial<Record<StoreField, string>>>({});

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

  function editStore(field: StoreField, next: string) {
    if (!store) return;
    setStore({ ...store, [field]: next });
    // 고치는 중에 빨간 테두리가 계속 떠 있으면 방해만 된다 — 손대는 순간 지운다
    if (storeFieldErrors[field]) {
      setStoreFieldErrors({ ...storeFieldErrors, [field]: undefined });
    }
  }

  async function save(key: "shipping" | "store") {
    const value = key === "shipping" ? shipping : store;
    if (!value) return;

    if (key === "store") {
      const errors = validateStore(value as StoreForm);
      setStoreFieldErrors(errors);
      const first = Object.values(errors)[0];
      if (first) {
        setStoreError(first);
        return;
      }
    }

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
      if (!res.ok) {
        // 서버가 어느 칸이 문제인지 알려 주면 그 칸을 빨갛게 표시한다
        if (key === "store" && typeof body?.field === "string") {
          setStoreFieldErrors({ [body.field as StoreField]: body.error });
        }
        throw new Error(body?.error ?? "저장에 실패했습니다.");
      }
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
  const invalid = "border-signal-red";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* ---------- 배송 설정 ---------- */}
      <SectionCard
        title="배송 설정"
        description="저장하면 장바구니와 상품 상세의 배송비 안내에 바로 반영됩니다."
        onSave={() => save("shipping")}
        saving={savingKey === "shipping"}
        error={shippingError}
      >
        <FieldRow
          label="기본 배송비"
          htmlFor="ship-base"
          help="할인 반영 후 상품 합계가 무료 기준 미만일 때 부과됩니다."
        >
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
              ? `${krw(freeThreshold)}원 이상 주문하면 배송비를 받지 않습니다.`
              : "0으로 두면 모든 주문이 무료배송이 됩니다."
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
        <FieldRow label="도서산간 추가비" htmlFor="ship-island">
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
          {/* 옛 도움말은 '기본 배송비에 더해지는 금액입니다' 라고 단정했다. 사실이 아니다 —
              결제 배송비를 계산하는 곳(lib/shipping.ts calcShippingFee)은 이 값을 아예 보지
              않고, 무료배송 기준 미만이면 기본 배송비만 붙인다. 이 숫자를 읽는 곳은 상품 상세
              배송 안내의 '추가 배송비 N원이 발생할 수 있습니다' 문장 한 곳뿐이다.
              올렸는데 결제액은 그대로인 것을 뒤늦게 알면 그 차액은 전부 손실이므로,
              스토어 정보 카드가 그러듯 연결되지 않았다는 사실을 숨기지 않고 그대로 말한다. */}
          <PartialWireNotice />
        </FieldRow>
      </SectionCard>

      {/* ---------- 스토어 정보 ---------- */}
      <SectionCard
        title="스토어 정보"
        description="고객센터 안내에 쓰려고 적어 두는 값입니다."
        onSave={() => save("store")}
        saving={savingKey === "store"}
        error={storeError}
      >
        {/* 저장은 되지만 고객 화면은 아직 이 값을 읽지 않는다 — 그 사실을 화면에 적어 둔다 */}
        <NotWiredNotice />

        <FieldRow
          label="스토어 이름"
          htmlFor="store-name"
          help="주문·안내 문구에서 스토어를 부르는 이름입니다."
        >
          <div className="flex flex-wrap items-center gap-1">
            <Input
              id="store-name"
              className={`max-w-60 ${storeFieldErrors.name ? invalid : ""}`}
              value={store.name}
              aria-invalid={Boolean(storeFieldErrors.name)}
              onChange={(e) => editStore("name", e.target.value)}
              placeholder="예: 다름"
            />
            {store.name.trim().length === 0 && <EmptyBadge />}
          </div>
          {storeFieldErrors.name && <Help tone="error">{storeFieldErrors.name}</Help>}
        </FieldRow>

        <FieldRow
          label="고객센터 전화번호"
          htmlFor="store-phone"
          help="고객이 문의할 때 거는 번호입니다. 숫자와 하이픈(-)만 넣어 주세요."
        >
          <div className="flex flex-wrap items-center gap-1">
            <Input
              id="store-phone"
              className={`max-w-60 ${storeFieldErrors.cs_phone ? invalid : ""}`}
              value={store.cs_phone}
              aria-invalid={Boolean(storeFieldErrors.cs_phone)}
              onChange={(e) => editStore("cs_phone", e.target.value)}
              placeholder="예: 031-963-3375"
            />
            {store.cs_phone.trim().length === 0 && <EmptyBadge />}
          </div>
          {storeFieldErrors.cs_phone && <Help tone="error">{storeFieldErrors.cs_phone}</Help>}
        </FieldRow>

        <FieldRow
          label="고객센터 운영시간"
          htmlFor="store-hours"
          help="전화를 받을 수 있는 요일과 시간을 적어 주세요."
        >
          <div className="flex flex-wrap items-center gap-1">
            <Input
              id="store-hours"
              className={`max-w-96 ${storeFieldErrors.cs_hours ? invalid : ""}`}
              value={store.cs_hours}
              aria-invalid={Boolean(storeFieldErrors.cs_hours)}
              onChange={(e) => editStore("cs_hours", e.target.value)}
              placeholder="예: 평일 10:00 – 17:00 (점심 12:00 – 13:00)"
            />
            {store.cs_hours.trim().length === 0 && <EmptyBadge />}
          </div>
          {storeFieldErrors.cs_hours && <Help tone="error">{storeFieldErrors.cs_hours}</Help>}
        </FieldRow>
      </SectionCard>

      {/* 법정 표기 항목 — 고객이 실제로 보고 있는 값을 확인만 할 수 있게 둔다 */}
      <CompanyInfoCard />

      <Toast message={message} />
    </div>
  );
}
