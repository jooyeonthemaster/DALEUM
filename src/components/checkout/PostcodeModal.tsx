"use client";

import PostcodeEmbed, { type Address as PostcodeAddress } from "react-daum-postcode";
import CheckoutModal from "./CheckoutModal";

export interface PostcodeResult {
  postcode: string;
  address1: string;
}

export interface PostcodeModalProps {
  open: boolean;
  onClose: () => void;
  /** 검색 완료 시 우편번호 + 기본 주소 전달 (건물명 포함) */
  onComplete: (value: PostcodeResult) => void;
}

/** 카카오(다음) 우편번호 검색 모달 */
export default function PostcodeModal({ open, onClose, onComplete }: PostcodeModalProps) {
  const handleComplete = (data: PostcodeAddress) => {
    const building = data.buildingName ? ` (${data.buildingName})` : "";
    onComplete({ postcode: data.zonecode, address1: `${data.address}${building}` });
    onClose();
  };

  return (
    <CheckoutModal open={open} title="우편번호 검색" onClose={onClose}>
      <div className="p-2 sm:p-3">
        <PostcodeEmbed
          onComplete={handleComplete}
          autoClose={false}
          style={{ height: 460 }}
        />
      </div>
    </CheckoutModal>
  );
}
