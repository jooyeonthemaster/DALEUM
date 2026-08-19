"use client";

/* ============================================================
   설정 화면 조각 — 카드 셸 / 토스트 / '미설정' 배지 / 입력 검증

   SettingsClient 에서 떼어냈다. 화면 본문에 카드 껍데기와 검증 규칙까지 섞여 있어
   파일이 400줄을 넘었고, 문구 하나 고치려 해도 어디를 봐야 하는지 헷갈렸다.
   ============================================================ */

import { useCallback, useEffect, useRef, useState } from "react";
import { Help } from "@/components/admin/Field";

/* ---------- 폼 타입 ---------- */

export interface ShippingForm {
  base_fee: string;
  free_threshold: string;
  island_extra: string;
}

export interface StoreForm {
  name: string;
  cs_phone: string;
  cs_hours: string;
}

export type StoreField = keyof StoreForm;

/* ---------- 검증 ----------
   화면에서 먼저 걸러 내고, 서버(api/admin/settings)도 같은 규칙으로 한 번 더 막는다.
   예전에는 빈 문자열이 그대로 저장돼서, 회색 예시 문구를 값으로 착각한 채 저장을 누르면
   고객센터 번호가 통째로 비워졌다. */

/** 숫자와 하이픈만 — 국번 포함 9자리 이상이어야 실제로 걸리는 번호다 */
const PHONE_PATTERN = /^[0-9][0-9-]{7,}[0-9]$/;

export function validateStore(v: StoreForm): Partial<Record<StoreField, string>> {
  const errors: Partial<Record<StoreField, string>> = {};
  if (v.name.trim().length === 0) errors.name = "스토어 이름을 입력해 주세요.";
  if (v.cs_phone.trim().length === 0) {
    errors.cs_phone = "고객센터 전화번호를 입력해 주세요.";
  } else if (!PHONE_PATTERN.test(v.cs_phone.trim())) {
    errors.cs_phone = "숫자와 하이픈(-)만 써서 입력해 주세요. 예: 031-963-3375";
  }
  if (v.cs_hours.trim().length === 0) errors.cs_hours = "고객센터 운영시간을 입력해 주세요.";
  return errors;
}

/* ---------- 토스트 ---------- */

export function useToast() {
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

export function Toast({ message }: { message: string | null }) {
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

/* ---------- 조각 ---------- */

/** 값이 비어 있다는 사실을 입력칸 옆에서 바로 알린다 — 회색 예시 문구와 구분되지 않던 문제 */
export function EmptyBadge() {
  return (
    <span className="ml-2 inline-flex items-center bg-[#fdf3f0] px-1.5 py-0.5 text-[11px] font-medium text-signal-red">
      미설정
    </span>
  );
}

/**
 * 설정 카드 껍데기.
 * 예전에는 영문 오버라인(Shipping / Store)을 받았는데, 그 문자열이 저장 요청에 실려 가는
 * 내부 키와 같은 값이라 화면에 시스템 키가 그대로 노출됐다. prop 자체를 없앴다.
 */
export function SectionCard({
  title,
  description,
  children,
  onSave,
  saving,
  error,
}: {
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
        <h2 className="headline-serif text-lg text-ink-900">{title}</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-400">{description}</p>
      </div>
      <div className="divide-y divide-ink-100 px-6">{children}</div>
      <div className="flex items-center justify-between gap-4 border-t border-ink-100 px-6 py-4">
        <div>
          {error && (
            <Help tone="error" className="mt-0">
              {error}
            </Help>
          )}
        </div>
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

/**
 * 고객 화면에 아직 연결되지 않은 값이라는 경고.
 * 저장은 되지만 고객이 보는 번호는 바뀌지 않는다 — 성공 토스트만 띄우고 아무것도
 * 바뀌지 않으면, 옛 회선을 해지했다가 문의가 통째로 유실된다.
 */
export function NotWiredNotice() {
  return (
    <div className="flex gap-2.5 border-b border-ink-100 py-4">
      <span
        aria-hidden
        className="mt-1 h-2 w-2 shrink-0 rounded-full bg-signal-amber"
      />
      <div className="text-xs leading-relaxed text-ink-600">
        <p className="font-medium text-ink-800">
          여기서 바꾼 값은 아직 고객 화면에 반영되지 않습니다.
        </p>
        <p className="mt-1 text-ink-500">
          고객이 보는 스토어 하단·주문완료 안내·회사소개·상품 상세의 전화번호와 운영시간은
          현재 고정된 값으로 표시됩니다. 실제 고객센터 번호가 바뀌었다면 담당자에게 알려
          주세요. 여기 적어 둔 값은 연결 작업이 끝나면 그대로 쓰입니다.
        </p>
      </div>
    </div>
  );
}
