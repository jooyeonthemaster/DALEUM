import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Reveal from "@/components/shop/Reveal";
import OrderCard, { type OrderCardOrder } from "@/components/mypage/OrderCard";
import MypageEmpty from "@/components/mypage/MypageEmpty";

export const metadata: Metadata = { title: "주문 내역" };

const PERIODS = [3, 6, 12] as const;

/** 주문 목록 — 기간 필터(3/6/12개월) */
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const sp = await searchParams;
  const parsed = Number(sp.period);
  const months = (PERIODS as readonly number[]).includes(parsed) ? parsed : 3;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/mypage/orders");

  const since = new Date();
  since.setMonth(since.getMonth() - months);

  const { data } = await supabase
    .from("orders")
    .select("*, order_items(*)")
    .eq("user_id", user.id)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(100);

  const orders = (data ?? []) as unknown as OrderCardOrder[];

  return (
    <div>
      <Reveal variant="fade" delay={0.12} className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="headline-serif text-xl text-ink-900 md:text-[1.35rem]">주문 내역</h2>
        <div className="flex" role="group" aria-label="조회 기간">
          {PERIODS.map((p) => (
            <Link
              key={p}
              href={p === 3 ? "/mypage/orders" : `/mypage/orders?period=${p}`}
              aria-current={months === p ? "true" : undefined}
              className={`-ml-px flex min-h-10 items-center border px-4 text-[12px] transition-colors first:ml-0 md:min-h-8 md:px-3.5 ${
                months === p
                  ? "z-10 border-ink-900 bg-ink-900 text-cream-50"
                  : "border-ink-200 text-ink-500 hover:text-ink-900"
              }`}
            >
              {p}개월
            </Link>
          ))}
        </div>
      </Reveal>

      {orders.length === 0 ? (
        <Reveal variant="fade" delay={0.2}>
          <MypageEmpty
            title={`최근 ${months}개월 동안의 주문 내역이 없습니다.`}
            description="발효가 완성한 곤약의 식탁을 천천히 둘러보세요."
            action={{ href: "/products", label: "상품 보러 가기" }}
          />
        </Reveal>
      ) : (
        <div className="space-y-3">
          {orders.map((order, i) => (
            <Reveal key={order.id} variant="fade" delay={0.16 + Math.min(i, 6) * 0.07}>
              <OrderCard order={order} />
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}
