"use client";

/* ============================================================
   고객 상세 화면의 공통 조각 — 응답 타입과 구역(Section) 껍데기
   ============================================================ */

import type { ReactNode } from "react";
import type { OrderStatus } from "@/lib/types";

export interface CustomerDetail {
  id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  role: string;
  marketing_opt_in: boolean;
  memo: string | null;
  created_at: string;
}

export interface VipInfo {
  group_id: string;
  group_name: string;
  discount_rate: number;
  note: string | null;
  custom_price_count: number;
}

export interface OrderRow {
  id: string;
  order_no: string;
  created_at: string;
  status: OrderStatus;
  total: number;
  order_items: { name_snapshot: string; qty: number }[];
}

export interface AddressRow {
  id: string;
  label: string;
  recipient: string;
  phone: string;
  postcode: string;
  address1: string;
  address2: string | null;
  is_default: boolean;
}

export interface CustomerReviewRow {
  id: string;
  rating: number;
  content: string;
  is_hidden: boolean;
  admin_reply: string | null;
  created_at: string;
  products: { name: string; slug: string } | { name: string; slug: string }[] | null;
}

export interface CustomerDetailResponse {
  customer: CustomerDetail;
  vip: VipInfo | null;
  stats: { order_count: number; total_spent: number };
  orders: OrderRow[];
  ordersTotal: number;
  addresses: AddressRow[];
  reviews: CustomerReviewRow[];
}

/** 리뷰에 임베드된 상품은 클라이언트 타입 추론상 배열일 수도 있다 */
export function reviewProductName(r: CustomerReviewRow): string {
  const p = Array.isArray(r.products) ? r.products[0] : r.products;
  return p?.name ?? "삭제된 상품";
}

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border border-ink-200 bg-cream-50">
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 hairline-b">
        <h2 className="label-caps text-ink-400">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}
