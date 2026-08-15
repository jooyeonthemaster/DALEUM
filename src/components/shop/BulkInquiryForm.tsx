"use client";

import { useState } from "react";
import { BULK_INQUIRY_PURPOSES, BULK_INQUIRY_PURPOSE_LABELS, COMPANY } from "@/lib/constants";
import type { BulkInquiryPurpose } from "@/lib/types";

export interface BulkProductOption {
  slug: string;
  name: string;
}

export interface BulkInquiryFormProps {
  products: BulkProductOption[];
}

const inputBase =
  "w-full rounded-none border border-ink-200 bg-cream-50 px-3.5 py-3 text-[15px] text-ink-900 placeholder:text-ink-300 transition-colors focus:border-forest-600 focus:outline-none disabled:bg-cream-100 disabled:text-ink-400";

interface FormState {
  company: string;
  contact_name: string;
  phone: string;
  email: string;
  biz_no: string;
  purpose: BulkInquiryPurpose | "";
  volume: string;
  message: string;
}

const EMPTY: FormState = {
  company: "",
  contact_name: "",
  phone: "",
  email: "",
  biz_no: "",
  purpose: "",
  volume: "",
  message: "",
};

export default function BulkInquiryForm({ products }: BulkInquiryFormProps) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [picked, setPicked] = useState<string[]>([]);
  const [honeypot, setHoneypot] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggleProduct = (slug: string) =>
    setPicked((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/bulk-inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, product_slugs: picked, website: honeypot }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "접수 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      setDone(true);
    } catch {
      setError("네트워크 오류로 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="border border-ink-200 bg-cream-100 px-6 py-14 text-center md:py-20">
        <p className="label-caps text-forest-600">Received</p>
        <p className="headline-serif mt-5 text-xl text-ink-900 md:text-2xl">
          문의가 접수되었습니다.
        </p>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-pretty text-ink-500">
          담당자가 확인 후 영업일 기준 1–2일 안에 남겨주신 연락처로 회신드립니다.
          급하신 경우 {COMPANY.tel}로 전화 주시면 더 빠르게 안내해 드립니다.
        </p>
        <button
          type="button"
          onClick={() => {
            setForm(EMPTY);
            setPicked([]);
            setAgreed(false);
            setDone(false);
          }}
          className="group label-caps mt-5 inline-block py-3.5 text-ink-600 transition-colors hover:text-ink-900"
        >
          <span className="relative after:absolute after:left-0 after:-bottom-[3px] after:h-px after:w-full after:origin-right after:scale-x-0 after:bg-current after:transition-transform after:duration-500 after:[transition-timing-function:var(--ease-hall)] group-hover:after:origin-left group-hover:after:scale-x-100">
            문의 하나 더 남기기
          </span>
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="border border-ink-200 bg-cream-50 p-6 md:p-10">
      {/* 봇 미끼 — 사람 눈과 스크린리더 모두에서 감춘다 */}
      <div className="hidden" aria-hidden>
        <label htmlFor="website">website</label>
        <input
          id="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label htmlFor="bi-company" className="mb-1.5 block text-[13px] font-medium text-ink-700">
            회사명 <span className="text-signal-red">*</span>
          </label>
          <input
            id="bi-company"
            required
            maxLength={100}
            className={inputBase}
            placeholder="주식회사 다름"
            value={form.company}
            onChange={(e) => set("company", e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="bi-name" className="mb-1.5 block text-[13px] font-medium text-ink-700">
            담당자명 <span className="text-signal-red">*</span>
          </label>
          <input
            id="bi-name"
            required
            maxLength={50}
            className={inputBase}
            placeholder="홍길동"
            value={form.contact_name}
            onChange={(e) => set("contact_name", e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="bi-phone" className="mb-1.5 block text-[13px] font-medium text-ink-700">
            연락처 <span className="text-signal-red">*</span>
          </label>
          <input
            id="bi-phone"
            required
            inputMode="tel"
            maxLength={30}
            className={inputBase}
            placeholder="010-0000-0000"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="bi-email" className="mb-1.5 block text-[13px] font-medium text-ink-700">
            이메일 <span className="text-signal-red">*</span>
          </label>
          <input
            id="bi-email"
            required
            type="email"
            maxLength={120}
            className={inputBase}
            placeholder="name@company.com"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="bi-bizno" className="mb-1.5 block text-[13px] font-medium text-ink-700">
            사업자등록번호
          </label>
          <input
            id="bi-bizno"
            maxLength={20}
            className={inputBase}
            placeholder="000-00-00000 (선택)"
            value={form.biz_no}
            onChange={(e) => set("biz_no", e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="bi-purpose" className="mb-1.5 block text-[13px] font-medium text-ink-700">
            문의 유형
          </label>
          <select
            id="bi-purpose"
            className={`${inputBase} appearance-none`}
            value={form.purpose}
            onChange={(e) => set("purpose", e.target.value as BulkInquiryPurpose | "")}
          >
            <option value="">선택해 주세요</option>
            {BULK_INQUIRY_PURPOSES.map((p) => (
              <option key={p} value={p}>
                {BULK_INQUIRY_PURPOSE_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {products.length > 0 && (
        <fieldset className="mt-8">
          <legend className="mb-3 block text-[13px] font-medium text-ink-700">
            관심 품목 <span className="font-normal text-ink-400">(복수 선택 가능)</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {products.map((p) => {
              const on = picked.includes(p.slug);
              return (
                <button
                  key={p.slug}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleProduct(p.slug)}
                  className={`border px-3 py-2 text-[13px] transition-colors ${
                    on
                      ? "border-forest-600 bg-forest-600 text-cream-50"
                      : "border-ink-200 bg-cream-50 text-ink-600 hover:border-ink-400"
                  }`}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="mt-8">
        <label htmlFor="bi-volume" className="mb-1.5 block text-[13px] font-medium text-ink-700">
          예상 물량 · 주기
        </label>
        <input
          id="bi-volume"
          maxLength={200}
          className={inputBase}
          placeholder="예) 월 200박스 정기 / 우선 샘플 1박스"
          value={form.volume}
          onChange={(e) => set("volume", e.target.value)}
        />
      </div>

      <div className="mt-5">
        <label htmlFor="bi-message" className="mb-1.5 block text-[13px] font-medium text-ink-700">
          문의 내용 <span className="text-signal-red">*</span>
        </label>
        <textarea
          id="bi-message"
          required
          rows={6}
          maxLength={3000}
          className={`${inputBase} resize-y leading-relaxed`}
          placeholder="필요하신 규격, 납기, 포장 형태, 검토 중인 용도 등을 적어주시면 더 정확하게 안내해 드립니다."
          value={form.message}
          onChange={(e) => set("message", e.target.value)}
        />
      </div>

      <label className="mt-6 flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-600">
        <input
          type="checkbox"
          required
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 accent-forest-700"
        />
        <span>
          견적 안내를 위해 입력하신 회사·담당자 정보를 수집·이용하는 데 동의합니다.
          문의 처리 목적으로만 사용하며, 처리 완료 후 3년간 보관 뒤 파기합니다.
        </span>
      </label>

      {error && (
        <p role="alert" className="mt-5 border border-signal-red/30 bg-[#f6e8e3] px-4 py-3 text-sm text-signal-red">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || !agreed}
        className="mt-7 w-full bg-forest-900 py-4 text-sm font-medium text-cream-50 transition-colors hover:bg-forest-950 disabled:cursor-not-allowed disabled:bg-ink-200 disabled:text-ink-400"
      >
        {submitting ? "접수 중…" : "문의 남기기"}
      </button>
      <p className="mt-3 text-center text-[13px] text-ink-400">
        영업일 기준 1–2일 안에 회신드립니다. 급하시면 {COMPANY.tel}로 연락 주세요.
      </p>
    </form>
  );
}
