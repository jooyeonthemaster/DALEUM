import Image from "next/image";
import Link from "next/link";
import type { PricedProduct, ProductWithImages } from "@/lib/types";
import { STORAGE_TYPE_LABELS } from "@/lib/constants";
import PriceTag from "./PriceTag";

export interface ProductCardProps {
  /** PricedProduct(VIP 가격 해석 완료)면 VIP 표기까지 자동 처리 */
  product: ProductWithImages | PricedProduct;
  /** 첫 화면에 보이는 카드만 true (next/image priority) */
  priority?: boolean;
  className?: string;
}

/**
 * 상품 카드 — 서버/클라이언트 겸용 표시 컴포넌트.
 * 4:5 이미지(호버 줌), 뱃지, 품절 오버레이, 카테고리/보관 태그, 가격.
 * 링크: /products/[slug]
 */
export default function ProductCard({
  product,
  priority = false,
  className = "",
}: ProductCardProps) {
  const images = [...(product.product_images ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order
  );
  const primary = images.find((img) => img.is_primary) ?? images[0];

  const effectivePrice =
    "effective_price" in product ? product.effective_price : product.price;
  const vipApplied =
    ("vip_applied" in product && product.vip_applied) ||
    effectivePrice < product.price;
  const compareAt = vipApplied ? product.price : product.compare_at_price;
  const soldOut = product.status === "sold_out" || product.stock <= 0;
  const badges = (product.badges ?? []).slice(0, 2);
  const categoryName = product.categories?.name;

  return (
    <Link
      href={`/products/${product.slug}`}
      className={`group block ${className}`}
    >
      {/* 4:5 쇼케이스 이미지 */}
      <div className="showcase-img relative aspect-[4/5] overflow-hidden rounded-sm bg-cream-100">
        {primary ? (
          <Image
            src={primary.url}
            alt={primary.alt ?? product.name}
            fill
            priority={priority}
            sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 50vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="label-caps text-ink-300">Daleum</span>
          </div>
        )}

        {badges.length > 0 && (
          <div className="absolute left-3 top-3 flex gap-1.5">
            {badges.map((badge) => (
              <span
                key={badge}
                className="label-caps bg-cream-50/95 px-2 py-1 text-[10px] text-ink-900"
              >
                {badge}
              </span>
            ))}
          </div>
        )}

        {soldOut && (
          <div className="absolute inset-0 flex items-center justify-center bg-cream-50/70">
            <span className="label-caps border border-ink-900 px-4 py-2 text-ink-900">
              일시품절
            </span>
          </div>
        )}
      </div>

      {/* 정보 */}
      <div className="pt-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] tracking-[0.08em] text-ink-400">
            {categoryName ?? ""}
          </span>
          <span className="shrink-0 rounded-full border border-ink-200 px-2 py-0.5 text-[11px] text-ink-500">
            {STORAGE_TYPE_LABELS[product.storage_type]}
          </span>
        </div>
        <h3 className="mt-2 text-[15px] font-medium leading-snug text-ink-900">
          {product.name}
        </h3>
        {product.subtitle && (
          <p className="mt-1 line-clamp-1 text-[13px] text-ink-500">
            {product.subtitle}
          </p>
        )}
        <PriceTag
          price={effectivePrice}
          compareAt={compareAt}
          vipApplied={vipApplied}
          size="sm"
          className="mt-2.5"
        />
      </div>
    </Link>
  );
}
