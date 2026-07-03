import type { CSSProperties } from "react";
import type { ProductWithImages } from "@/lib/types";
import ProductCard from "@/components/shop/ProductCard";
import Reveal from "@/components/shop/Reveal";
import SectionTitle from "@/components/shop/SectionTitle";

export interface NewArrivalsStripProps {
  /** 최신 등록 순 상품 */
  products: ProductWithImages[];
}

/**
 * 신상품 스트립 — 가로 스크롤(스냅) 카드.
 * 시작 여백은 container-hall의 좌측 라인과 정확히 맞춘다.
 *
 * 카드 스태거: 가로 스크롤러 안에서 카드마다 IntersectionObserver를 붙이면
 * 빠른 스와이프 시 발동이 누락될 수 있어, 스트립(부모)이 화면에 들어오는 순간
 * .reveal-words → .reveal-word 캐스케이드로 전 카드를 순차 리빌한다.
 */
export default function NewArrivalsStrip({ products }: NewArrivalsStripProps) {
  if (products.length === 0) return null;

  return (
    <section className="hairline-t py-16 md:py-28">
      <div className="container-hall">
        <Reveal>
          <SectionTitle
            overline="New Arrivals"
            title="새로 나온 다름"
            action={{ href: "/products", label: "전체 보기" }}
            className="mb-8 md:mb-12"
          />
        </Reveal>
      </div>

      <Reveal variant="words">
        <div
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-hidden pb-4 md:gap-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{
            paddingInline:
              "max(var(--spacing-gutter), calc((100vw - 96rem) / 2 + var(--spacing-gutter)))",
          }}
        >
          {products.map((product, i) => (
            <div
              key={product.id}
              className="reveal-word w-[68vw] shrink-0 snap-start sm:w-72 md:w-80"
              style={{ "--word-delay": `${i * 0.07}s` } as CSSProperties}
            >
              <ProductCard product={product} />
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
