import Image from "next/image";
import Link from "next/link";
import type { ProductWithImages } from "@/lib/types";
import { STORAGE_TYPE_LABELS } from "@/lib/constants";
import Reveal from "@/components/shop/Reveal";
import VipPrice from "./VipPrice";
import VipAddToCartButton from "./VipAddToCartButton";

export interface VipProductCardProps {
  /** product_images 조인 필수, product_variants/categories 조인 권장 */
  product: ProductWithImages;
  /** 해석된 판매가 (VIP 우대가 또는 캠페인 지정가) */
  price: number;
  /** 우대가 적용 여부 — 마크/브라스 강조 표시 */
  vipApplied: boolean;
  /** 가격 마크 문구 (기본 "VIP") */
  markLabel?: string;
  /** 시크릿 캠페인 카드면 캠페인 id — 담기 라인에 실린다 */
  campaignId?: string;
  /** 첫 화면 카드만 true (next/image priority) */
  priority?: boolean;
  /** true면 이미지가 커튼(clip)으로 걷히며 등장 — 그리드 스태거와 함께 사용 */
  revealImage?: boolean;
  /** 이미지 커튼 등장 지연(초) — 카드 래퍼 리빌보다 살짝 늦게 */
  revealDelay?: number;
  className?: string;
}

/**
 * VIP 프라이빗 살롱 전용 상품 카드 — forest-950 다크 배경 위에서 사용.
 * 공용 ProductCard는 ink 텍스트라 다크에서 쓸 수 없어 자체 제작 (COMPONENTS_SHOP.md 참고).
 * 서버/클라이언트 겸용. 옵션 상품은 담기 대신 상세로 유도한다.
 */
export default function VipProductCard({
  product,
  price,
  vipApplied,
  markLabel = "VIP",
  campaignId,
  priority = false,
  revealImage = false,
  revealDelay = 0,
  className = "",
}: VipProductCardProps) {
  const images = [...(product.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const primary = images.find((img) => img.is_primary) ?? images[0];

  const soldOut = product.status === "sold_out" || product.stock <= 0;
  const compareAt = price < product.price ? product.price : product.compare_at_price;
  const badges = (product.badges ?? []).slice(0, 2);
  const categoryName = product.categories?.name;
  const hasVariants = (product.product_variants ?? []).some((v) => v.is_active);
  // 캠페인 지정가는 상품 단위로 적용되므로 캠페인 카드는 옵션 상품도 기본 구성으로 바로 담는다
  // (상세 페이지로 이동하면 캠페인 컨텍스트가 사라진다)
  const directAdd = !hasVariants || Boolean(campaignId);

  const showcase = (
    <div className="showcase-img relative aspect-[4/5] overflow-hidden rounded-sm bg-forest-900">
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
          <span className="label-caps text-cream-50/25">Daleum</span>
        </div>
      )}

      {badges.length > 0 && (
        <div className="absolute left-3 top-3 flex gap-1.5">
          {badges.map((badge) => (
            <span
              key={badge}
              className="label-caps bg-forest-950/85 px-2 py-1 text-[10px] text-brass-300"
            >
              {badge}
            </span>
          ))}
        </div>
      )}

      {soldOut && (
        <div className="absolute inset-0 flex items-center justify-center bg-forest-950/70">
          <span className="label-caps border border-cream-50/70 px-4 py-2 text-cream-50">
            일시품절
          </span>
        </div>
      )}
    </div>
  );

  return (
    <div className={`group flex flex-col ${className}`}>
      <Link href={`/products/${product.slug}`} className="block">
        {/* 4:5 쇼케이스 이미지 — revealImage면 커튼이 걷히듯 등장 (clip은 직계 자식 하나) */}
        {revealImage ? (
          <Reveal variant="clip" delay={revealDelay}>
            {showcase}
          </Reveal>
        ) : (
          showcase
        )}

        {/* 정보 */}
        <div className="pt-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] tracking-[0.08em] text-cream-50/40">
              {categoryName ?? ""}
            </span>
            <span className="shrink-0 rounded-full border border-cream-50/15 px-2 py-0.5 text-[11px] text-cream-200/70">
              {STORAGE_TYPE_LABELS[product.storage_type]}
            </span>
          </div>
          <h3 className="mt-2 text-[15px] font-medium leading-snug text-cream-50">
            {product.name}
          </h3>
          {product.subtitle && (
            <p className="mt-1 line-clamp-1 text-[13px] text-cream-200/50">{product.subtitle}</p>
          )}
          <VipPrice
            price={price}
            compareAt={compareAt}
            vipApplied={vipApplied}
            markLabel={markLabel}
            size="sm"
            className="mt-2.5"
          />
        </div>
      </Link>

      {/* 담기 — 옵션 상품은 상세에서 선택하도록 유도 (캠페인 카드는 바로 담기) */}
      <div className="mt-3.5">
        {!directAdd && !soldOut ? (
          <Link
            href={`/products/${product.slug}`}
            className="flex h-11 w-full items-center justify-center border border-cream-50/20 text-[13px] text-cream-100 transition-colors duration-300 ease-hall hover:border-brass-300 hover:text-brass-300"
          >
            옵션 선택하기
          </Link>
        ) : (
          <VipAddToCartButton
            productId={product.id}
            slug={product.slug}
            name={product.name}
            price={price}
            originalPrice={product.price}
            imageUrl={primary?.url ?? null}
            stock={product.stock}
            campaignId={campaignId}
            soldOut={soldOut}
          />
        )}
      </div>
    </div>
  );
}
