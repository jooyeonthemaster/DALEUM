import Image from "next/image";
import Link from "next/link";
import type { Order, OrderItem } from "@/lib/types";
import { formatDate, krw } from "@/lib/format";
import OrderStatusLabel from "./OrderStatusLabel";

export interface OrderCardOrder extends Order {
  order_items: OrderItem[];
}

export interface OrderCardProps {
  order: OrderCardOrder;
  className?: string;
}

/**
 * 주문 요약 카드 — 마이페이지 대시보드/주문 목록 공용.
 * 배송중 주문은 forest 보더로 강조된다. 전체가 상세 링크.
 */
export default function OrderCard({ order, className = "" }: OrderCardProps) {
  const items = order.order_items ?? [];
  const first = items[0];
  const restCount = items.length - 1;
  const totalQty = items.reduce((n, item) => n + item.qty, 0);
  const shipped = order.status === "shipped";
  const thumbs = items.slice(0, 3);

  return (
    <Link
      href={`/mypage/orders/${order.id}`}
      className={`block border bg-cream-50 p-5 transition-colors duration-300 md:p-6 ${
        shipped ? "border-forest-600" : "border-ink-200 hover:border-ink-400"
      } ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="flex items-baseline gap-3">
          <span className="krw text-[13px] font-semibold text-ink-900">{order.order_no}</span>
          <span className="text-xs text-ink-400">{formatDate(order.created_at)}</span>
        </div>
        <OrderStatusLabel status={order.status} />
      </div>

      <div className="mt-4 flex items-center gap-4">
        <div className="flex shrink-0 gap-1.5">
          {thumbs.map((item) => (
            <div
              key={item.id}
              className="relative h-14 w-14 overflow-hidden bg-cream-100 md:h-16 md:w-16"
            >
              {item.image_url ? (
                <Image
                  src={item.image_url}
                  alt={item.name_snapshot}
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-[9px] tracking-[0.18em] text-ink-300">
                  DALEUM
                </span>
              )}
            </div>
          ))}
          {items.length > 3 && (
            <div className="flex h-14 w-14 items-center justify-center border border-ink-200 text-xs text-ink-500 md:h-16 md:w-16">
              +{items.length - 3}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm leading-snug text-ink-900">
            {first ? first.name_snapshot : "주문 상품"}
          </p>
          <p className="mt-1 text-xs text-ink-400">
            {restCount > 0 && <>외 {restCount}건 · </>}총 {totalQty}개
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3.5">
        <span className="text-xs text-ink-500">결제 금액</span>
        <span className="krw text-[15px] font-semibold text-ink-900">{krw(order.total)}원</span>
      </div>
    </Link>
  );
}
