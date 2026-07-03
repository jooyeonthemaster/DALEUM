"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import DaumPostcodeEmbed, { type Address as DaumAddress } from "react-daum-postcode";
import { createClient } from "@/lib/supabase/client";
import type { Address } from "@/lib/types";
import { formatPhone } from "@/lib/format";
import Skeleton from "@/components/shop/Skeleton";
import ShopModal from "./ShopModal";

const MAX_ADDRESSES = 5;

const INPUT =
  "h-11 w-full border border-ink-200 bg-transparent px-3.5 text-sm text-ink-900 transition-colors placeholder:text-ink-300 focus:border-forest-600 focus-visible:outline-none";

interface FormState {
  id: string | null;
  label: string;
  recipient: string;
  phone: string;
  postcode: string;
  address1: string;
  address2: string;
  is_default: boolean;
}

const EMPTY_FORM: FormState = {
  id: null,
  label: "",
  recipient: "",
  phone: "",
  postcode: "",
  address1: "",
  address2: "",
  is_default: false,
};

/** 배송지 관리 — 목록 / 추가 / 수정 / 삭제 / 기본 배송지 지정 (최대 5개) */
export default function AddressBook() {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [postcodeOpen, setPostcodeOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [deleting, setDeleting] = useState<Address | null>(null);

  const load = useCallback(() => {
    return supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      return supabase
        .from("addresses")
        .select("*")
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true })
        .then(({ data, error }) => {
          if (error) {
            setListError("배송지를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
            setAddresses([]);
            return;
          }
          setAddresses((data ?? []) as Address[]);
        });
    });
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const list = addresses ?? [];

  const openCreate = () => {
    setListError(null);
    if (list.length >= MAX_ADDRESSES) {
      setListError(`배송지는 최대 ${MAX_ADDRESSES}개까지 저장할 수 있습니다.`);
      return;
    }
    setForm({ ...EMPTY_FORM, is_default: list.length === 0 });
    setFormError(null);
    setPostcodeOpen(false);
    setFormOpen(true);
  };

  const openEdit = (addr: Address) => {
    setListError(null);
    setForm({
      id: addr.id,
      label: addr.label,
      recipient: addr.recipient,
      phone: addr.phone,
      postcode: addr.postcode,
      address1: addr.address1,
      address2: addr.address2 ?? "",
      is_default: addr.is_default,
    });
    setFormError(null);
    setPostcodeOpen(false);
    setFormOpen(true);
  };

  const closeForm = () => {
    if (busy) return;
    setFormOpen(false);
  };

  const onPostcodeComplete = (data: DaumAddress) => {
    const building = data.buildingName ? ` (${data.buildingName})` : "";
    setForm((f) => ({ ...f, postcode: data.zonecode, address1: `${data.address}${building}` }));
    setPostcodeOpen(false);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !userId) return;

    const phoneDigits = form.phone.replace(/\D/g, "");
    if (!form.recipient.trim()) return setFormError("받는 분 이름을 입력해 주세요.");
    if (!/^0\d{9,10}$/.test(phoneDigits))
      return setFormError("연락처를 정확히 입력해 주세요. (예: 01012345678)");
    if (!form.postcode || !form.address1.trim())
      return setFormError("우편번호 찾기로 주소를 입력해 주세요.");

    setBusy(true);
    setFormError(null);

    const isOnly = list.length === 0 || (list.length === 1 && list[0].id === form.id);
    const makeDefault = form.is_default || isOnly;

    try {
      if (makeDefault) {
        // 기본 배송지는 하나만 — 나머지 해제
        const { error } = await supabase
          .from("addresses")
          .update({ is_default: false })
          .eq("user_id", userId);
        if (error) throw error;
      }

      const payload = {
        label: form.label.trim() || "기본 배송지",
        recipient: form.recipient.trim(),
        phone: phoneDigits,
        postcode: form.postcode,
        address1: form.address1.trim(),
        address2: form.address2.trim() || null,
        is_default: makeDefault,
      };

      if (form.id) {
        const { error } = await supabase.from("addresses").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("addresses")
          .insert({ ...payload, user_id: userId });
        if (error) throw error;
      }

      setFormOpen(false);
      await load();
    } catch {
      setFormError("저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const setDefault = async (addr: Address) => {
    if (!userId || addr.is_default) return;
    setListError(null);
    const { error: clearError } = await supabase
      .from("addresses")
      .update({ is_default: false })
      .eq("user_id", userId);
    const { error: setError } = clearError
      ? { error: clearError }
      : await supabase.from("addresses").update({ is_default: true }).eq("id", addr.id);
    if (clearError || setError) {
      setListError("기본 배송지 변경에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    }
    await load();
  };

  const remove = async () => {
    if (!deleting || busy) return;
    setBusy(true);
    setListError(null);
    try {
      const { error } = await supabase.from("addresses").delete().eq("id", deleting.id);
      if (error) throw error;
      // 기본 배송지를 지웠으면 남은 첫 번째를 기본으로 승격
      if (deleting.is_default) {
        const remaining = list.filter((a) => a.id !== deleting.id);
        if (remaining.length > 0) {
          await supabase.from("addresses").update({ is_default: true }).eq("id", remaining[0].id);
        }
      }
      setDeleting(null);
      await load();
    } catch {
      setListError("삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="headline-serif text-xl text-ink-900 md:text-[1.35rem]">배송지 관리</h2>
        <div className="flex items-center gap-3">
          <span className="krw text-xs text-ink-400">
            {list.length}/{MAX_ADDRESSES}
          </span>
          <button
            type="button"
            onClick={openCreate}
            className="flex min-h-11 items-center border border-ink-900 px-5 text-[13px] text-ink-900 transition-colors hover:bg-ink-900 hover:text-cream-50 md:min-h-9 md:px-4"
          >
            새 배송지
          </button>
        </div>
      </div>

      {listError && (
        <p role="alert" className="mb-4 text-[13px] text-signal-red">
          {listError}
        </p>
      )}

      {addresses === null ? (
        <div className="space-y-3" aria-hidden>
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="border border-ink-200 px-6 py-14 text-center md:py-16">
          <span className="mx-auto mb-6 block h-8 w-px bg-ink-300" aria-hidden />
          <p className="headline-serif text-balance text-lg text-ink-900 md:text-xl">
            저장된 배송지가 아직 없습니다.
          </p>
          <p className="mx-auto mt-3 max-w-xs text-balance text-sm leading-relaxed text-ink-500">
            자주 쓰는 주소를 등록해 두면 주문이 한결 빨라집니다.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="label-caps mt-8 inline-flex min-h-11 items-center border border-ink-900 px-8 text-ink-900 transition-colors duration-500 hover:bg-ink-900 hover:text-cream-50"
          >
            배송지 추가
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((addr) => (
            <li key={addr.id} className="border border-ink-200 p-5 md:p-6">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-sm font-medium text-ink-900">{addr.label}</span>
                {addr.is_default && (
                  <span className="rounded-full border border-forest-600/40 px-2 py-0.5 text-[10px] text-forest-700">
                    기본 배송지
                  </span>
                )}
              </div>
              <p className="mt-2.5 text-sm text-ink-900">
                {addr.recipient}
                <span className="krw ml-2 text-ink-500">{formatPhone(addr.phone)}</span>
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-600">
                <span className="krw text-ink-400">({addr.postcode})</span> {addr.address1}{" "}
                {addr.address2}
              </p>
              <div className="mt-4 flex items-center gap-3 border-t border-ink-100 pt-1.5 text-xs">
                {!addr.is_default && (
                  <button
                    type="button"
                    onClick={() => setDefault(addr)}
                    className="-mx-1 px-1 py-2.5 text-forest-700 transition-colors hover:text-forest-800"
                  >
                    기본으로 설정
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => openEdit(addr)}
                  className="-mx-1 px-1 py-2.5 text-ink-500 transition-colors hover:text-ink-900"
                >
                  수정
                </button>
                <button
                  type="button"
                  onClick={() => setDeleting(addr)}
                  className="-mx-1 px-1 py-2.5 text-ink-500 transition-colors hover:text-signal-red"
                >
                  삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* 배송지 입력 모달 */}
      <ShopModal
        open={formOpen}
        onClose={closeForm}
        title={form.id ? "배송지 수정" : "새 배송지"}
        footer={
          <>
            <button
              type="button"
              onClick={closeForm}
              disabled={busy}
              className="h-11 border border-ink-200 px-5 text-sm text-ink-700 transition-colors hover:bg-cream-100 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              form="address-form"
              disabled={busy}
              className="h-11 bg-forest-700 px-5 text-sm text-cream-50 transition-colors hover:bg-forest-800 disabled:opacity-50"
            >
              {busy ? "저장 중…" : "저장"}
            </button>
          </>
        }
      >
        <form id="address-form" onSubmit={save} className="space-y-4" noValidate>
          <div>
            <label htmlFor="addr-label" className="mb-1.5 block text-[13px] text-ink-600">
              배송지 이름
            </label>
            <input
              id="addr-label"
              type="text"
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="예: 집, 회사"
              maxLength={20}
              className={INPUT}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="addr-recipient" className="mb-1.5 block text-[13px] text-ink-600">
                받는 분
              </label>
              <input
                id="addr-recipient"
                type="text"
                value={form.recipient}
                onChange={(e) => setForm((f) => ({ ...f, recipient: e.target.value }))}
                placeholder="이름"
                maxLength={50}
                className={INPUT}
              />
            </div>
            <div>
              <label htmlFor="addr-phone" className="mb-1.5 block text-[13px] text-ink-600">
                연락처
              </label>
              <input
                id="addr-phone"
                type="tel"
                inputMode="numeric"
                value={form.phone}
                onChange={(e) =>
                  setForm((f) => ({ ...f, phone: e.target.value.replace(/[^\d-]/g, "") }))
                }
                placeholder="01012345678"
                className={INPUT}
              />
            </div>
          </div>
          <div>
            <label htmlFor="addr-postcode" className="mb-1.5 block text-[13px] text-ink-600">
              주소
            </label>
            <div className="flex gap-2">
              <input
                id="addr-postcode"
                type="text"
                readOnly
                value={form.postcode}
                placeholder="우편번호"
                className={`${INPUT} max-w-32 bg-cream-100`}
              />
              <button
                type="button"
                onClick={() => setPostcodeOpen((v) => !v)}
                className="h-11 shrink-0 border border-ink-900 px-4 text-[13px] text-ink-900 transition-colors hover:bg-ink-900 hover:text-cream-50"
              >
                우편번호 찾기
              </button>
            </div>
            {postcodeOpen && (
              <div className="mt-2 border border-ink-200">
                <DaumPostcodeEmbed onComplete={onPostcodeComplete} style={{ height: 380 }} />
              </div>
            )}
            <input
              type="text"
              readOnly
              value={form.address1}
              placeholder="주소"
              aria-label="기본 주소"
              className={`${INPUT} mt-2 bg-cream-100`}
            />
            <input
              type="text"
              value={form.address2}
              onChange={(e) => setForm((f) => ({ ...f, address2: e.target.value }))}
              placeholder="상세 주소 (동/호수 등)"
              aria-label="상세 주소"
              maxLength={100}
              className={`${INPUT} mt-2`}
            />
          </div>

          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, is_default: !f.is_default }))}
            disabled={list.length === 0 || (list.length === 1 && list[0].id === form.id)}
            aria-pressed={form.is_default}
            className="flex min-h-11 items-center gap-2.5 text-left disabled:opacity-60"
          >
            <span
              aria-hidden
              className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center border transition-colors ${
                form.is_default ? "border-forest-700 bg-forest-700" : "border-ink-300"
              }`}
            >
              {form.is_default && (
                <span className="block h-1.5 w-1.5 bg-cream-50" aria-hidden />
              )}
            </span>
            <span className="text-[13px] text-ink-600">기본 배송지로 설정</span>
          </button>

          {formError && (
            <p role="alert" className="text-[13px] text-signal-red">
              {formError}
            </p>
          )}
        </form>
      </ShopModal>

      {/* 삭제 확인 모달 */}
      <ShopModal
        open={deleting !== null}
        onClose={() => !busy && setDeleting(null)}
        title="배송지 삭제"
        footer={
          <>
            <button
              type="button"
              onClick={() => setDeleting(null)}
              disabled={busy}
              className="h-11 border border-ink-200 px-5 text-sm text-ink-700 transition-colors hover:bg-cream-100 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="h-11 bg-signal-red px-5 text-sm text-cream-50 transition-colors hover:bg-[#9c3c27] disabled:opacity-50"
            >
              {busy ? "삭제 중…" : "삭제"}
            </button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-ink-600">
          <span className="font-medium text-ink-900">{deleting?.label}</span> 배송지를
          삭제합니다. 삭제한 배송지는 복구할 수 없습니다.
        </p>
      </ShopModal>
    </div>
  );
}
