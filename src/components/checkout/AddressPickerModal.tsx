"use client";

import type { Address } from "@/lib/types";
import { formatPhone } from "@/lib/format";
import CheckoutModal from "./CheckoutModal";

export interface AddressPickerModalProps {
  open: boolean;
  onClose: () => void;
  addresses: Address[];
  onSelect: (address: Address) => void;
}

/** 저장된 배송지 선택 모달 (회원 전용) */
export default function AddressPickerModal({
  open,
  onClose,
  addresses,
  onSelect,
}: AddressPickerModalProps) {
  return (
    <CheckoutModal open={open} title="배송지 선택" onClose={onClose}>
      {addresses.length === 0 ? (
        <p className="px-6 py-14 text-center text-sm text-ink-500">
          저장된 배송지가 없습니다. 주소를 직접 입력해 주세요.
        </p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {addresses.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => onSelect(a)}
                className="group w-full px-5 py-5 text-left transition-colors hover:bg-cream-100"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-sm font-semibold text-ink-900">{a.label}</span>
                  {a.is_default && (
                    <span className="label-caps rounded-full border border-forest-600/40 px-2.5 py-0.5 text-[10px] text-forest-700">
                      기본 배송지
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-sm text-ink-600">
                  {a.recipient} · {formatPhone(a.phone)}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-ink-500">
                  ({a.postcode}) {a.address1}
                  {a.address2 ? ` ${a.address2}` : ""}
                </p>
                <span className="link-line mt-2.5 inline-block text-xs font-medium text-forest-700">
                  이 주소로 배송
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </CheckoutModal>
  );
}
