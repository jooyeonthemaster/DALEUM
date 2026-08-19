"use client";

import { useState } from "react";
import PostcodeEmbed, { type Address as PostcodeAddress } from "react-daum-postcode";
import Modal from "@/components/admin/Modal";
import { Input, Label, Help } from "@/components/admin/Field";
import type { OrderStatus, RecipientInfo } from "@/lib/types";

/* ============================================================
   배송지 수정

   왜 필요한가:
   "주소를 잘못 적었어요, 동호수만 바꿔 주세요" 는 쇼핑몰 CS 에서 가장 흔한 요청인데,
   주문 상세의 배송지 칸은 <p> 태그뿐인 완전 읽기전용이었다. 그래서 대표가 할 수 있는 일은
   주문을 취소해 환불하고 다시 주문하게 하거나(할인·쿠폰이 날아간다), 내려받은 엑셀에서
   주소만 손으로 고쳐 택배사에 올리는 것뿐이었다. 후자는 시스템 기록과 실제 발송지가
   영원히 달라져 배송 사고가 나면 추적이 불가능하다.

   발송 이후에도 기록용 수정은 막지 않는다 — 다만 택배사에 따로 연락해야 한다고 알린다.
   ============================================================ */

interface ShippingEditModalProps {
  open: boolean;
  orderStatus: OrderStatus;
  recipient: RecipientInfo;
  onClose: () => void;
  onSave: (next: RecipientInfo) => Promise<void>;
}

const SHIPPED_ONWARD: OrderStatus[] = ["shipped", "delivered", "confirmed"];

export default function ShippingEditModal({
  open,
  orderStatus,
  recipient,
  onClose,
  onSave,
}: ShippingEditModalProps) {
  const [form, setForm] = useState<RecipientInfo>(recipient);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 모달을 다시 열 때 이전 편집 내용이 남지 않도록 열림 상태를 키로 삼는다
  const [openedFor, setOpenedFor] = useState(open);
  if (open !== openedFor) {
    setOpenedFor(open);
    if (open) {
      setForm(recipient);
      setSearching(false);
      setError(null);
    }
  }

  const set = (patch: Partial<RecipientInfo>) => setForm((f) => ({ ...f, ...patch }));

  const filled =
    form.name.trim() && form.phone.trim() && form.postcode.trim() && form.address1.trim();

  async function submit() {
    if (!filled || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSave({
        name: form.name.trim(),
        phone: form.phone.trim(),
        postcode: form.postcode.trim(),
        address1: form.address1.trim(),
        address2: form.address2?.trim() || undefined,
        memo: form.memo?.trim() || undefined,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "배송지를 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function applyPostcode(data: PostcodeAddress) {
    const building = data.buildingName ? ` (${data.buildingName})` : "";
    set({ postcode: data.zonecode, address1: `${data.address}${building}` });
    setSearching(false);
  }

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title="배송지 수정"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="border border-ink-200 bg-cream-50 px-4 py-2.5 text-sm text-ink-700 transition-colors hover:bg-cream-100 disabled:opacity-50"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!filled || busy}
            className="bg-forest-700 px-4 py-2.5 text-sm text-cream-50 transition-colors hover:bg-forest-800 disabled:opacity-50"
          >
            {busy ? "저장 중…" : "저장"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {SHIPPED_ONWARD.includes(orderStatus) && (
          <p className="border border-signal-red/40 bg-[#f9efe9] px-3.5 py-3 text-sm leading-relaxed text-signal-red">
            이미 발송된 주문입니다. 여기서 고쳐도 택배는 옛 주소로 갑니다. 택배사에 직접 주소 변경을
            요청하시고, 여기에는 기록을 남기는 용도로만 저장해 주세요.
          </p>
        )}

        <div>
          <Label htmlFor="ship-name" requiredMark>
            받는 분
          </Label>
          <Input
            id="ship-name"
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </div>

        <div>
          <Label htmlFor="ship-phone" requiredMark>
            연락처
          </Label>
          <Input
            id="ship-phone"
            value={form.phone}
            inputMode="tel"
            placeholder="010-1234-5678"
            onChange={(e) => set({ phone: e.target.value })}
          />
        </div>

        <div>
          <Label htmlFor="ship-postcode" requiredMark>
            우편번호 · 주소
          </Label>
          <div className="flex gap-2">
            <Input
              id="ship-postcode"
              value={form.postcode}
              readOnly
              placeholder="우편번호"
              className="krw max-w-32"
            />
            <button
              type="button"
              onClick={() => setSearching((v) => !v)}
              className="shrink-0 border border-ink-200 bg-cream-50 px-4 text-sm text-ink-700 transition-colors hover:bg-cream-100"
            >
              {searching ? "검색 닫기" : "우편번호 찾기"}
            </button>
          </div>
          {searching && (
            <div className="mt-2 border border-ink-200">
              <PostcodeEmbed
                onComplete={applyPostcode}
                autoClose={false}
                style={{ height: "clamp(320px, 48vh, 440px)" }}
              />
            </div>
          )}
          <div className="mt-2 space-y-2">
            <Input
              value={form.address1}
              readOnly
              placeholder="주소 (우편번호 찾기로 채워집니다)"
              aria-label="기본 주소"
            />
            <Input
              value={form.address2 ?? ""}
              placeholder="상세 주소 (동·호수)"
              aria-label="상세 주소"
              onChange={(e) => set({ address2: e.target.value })}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="ship-memo">배송 메모</Label>
          <Input
            id="ship-memo"
            value={form.memo ?? ""}
            placeholder="예) 부재 시 경비실에 맡겨 주세요"
            onChange={(e) => set({ memo: e.target.value })}
          />
          <Help>바뀐 주소는 처리 이력에 이전 주소와 함께 남고, 엑셀에도 곧바로 반영됩니다.</Help>
        </div>

        {error && <Help tone="error">{error}</Help>}
      </div>
    </Modal>
  );
}
