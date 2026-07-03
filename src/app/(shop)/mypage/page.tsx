import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ProductWithImages } from "@/lib/types";
import ProductCard from "@/components/shop/ProductCard";
import OrderCard, { type OrderCardOrder } from "@/components/mypage/OrderCard";

interface WishJoinRow {
  id: string;
  products: ProductWithImages | ProductWithImages[] | null;
}

/** 섹션 헤더 — 마이페이지 내부용 작은 타이틀 */
function PanelTitle({
  title,
  action,
}: {
  title: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="mb-5 flex items-baseline justify-between gap-3">
      <h2 className="headline-serif text-xl text-ink-900 md:text-[1.35rem]">{title}</h2>
      {action && (
        <Link href={action.href} className="link-line shrink-0 text-[13px] text-ink-600">
          {action.label}
        </Link>
      )}
    </div>
  );
}

/** 섹션 내부 빈 상태 — 페이지 전체 EmptyState보다 작은 패널형 */
function PanelEmpty({
  sentence,
  action,
}: {
  sentence: string;
  action: { href: string; label: string };
}) {
  return (
    <div className="border border-ink-200 px-6 py-14 text-center">
      <p className="headline-serif text-lg text-ink-900">{sentence}</p>
      <Link
        href={action.href}
        className="link-line mt-5 inline-block text-[13px] text-ink-600"
      >
        {action.label}
      </Link>
    </div>
  );
}

/** 마이페이지 대시보드 — 최근 주문 3건 + 위시리스트 미리보기 */
export default async function MypageDashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/mypage");

  const [ordersRes, wishRes] = await Promise.all([
    supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("wishlists")
      .select("id, products(*, product_images(*), categories(id, slug, name))")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(4),
  ]);

  const orders = (ordersRes.data ?? []) as unknown as OrderCardOrder[];
  const shippingCount = orders.filter((o) => o.status === "shipped").length;

  const wishProducts = ((wishRes.data ?? []) as unknown as WishJoinRow[])
    .map((row) => (Array.isArray(row.products) ? row.products[0] : row.products))
    .filter((p): p is ProductWithImages => Boolean(p));

  return (
    <div className="space-y-14">
      <section>
        <PanelTitle title="최근 주문" action={{ href: "/mypage/orders", label: "전체 보기" }} />
        {shippingCount > 0 && (
          <p className="mb-4 flex items-center gap-2 border border-forest-600 bg-forest-50 px-4 py-3 text-[13px] text-forest-800">
            <span className="h-1.5 w-1.5 rounded-full bg-forest-600" aria-hidden />
            지금 {shippingCount}건의 주문이 배송 중입니다.
          </p>
        )}
        {orders.length === 0 ? (
          <PanelEmpty
            sentence="아직 주문 내역이 없습니다."
            action={{ href: "/products", label: "상품 보러 가기" }}
          />
        ) : (
          <div className="space-y-3">
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        )}
      </section>

      <section className="hairline-t pt-12">
        <PanelTitle
          title="위시리스트"
          action={{ href: "/mypage/wishlist", label: "전체 보기" }}
        />
        {wishProducts.length === 0 ? (
          <PanelEmpty
            sentence="마음에 담아둔 상품이 아직 없습니다."
            action={{ href: "/products", label: "상품 둘러보기" }}
          />
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-10 md:grid-cols-4 md:gap-x-4">
            {wishProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
