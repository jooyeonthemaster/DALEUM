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
 */
export default function NewArrivalsStrip({ products }: NewArrivalsStripProps) {
  if (products.length === 0) return null;

  return (
    <section className="hairline-t py-24 md:py-32">
      <div className="container-hall">
        <Reveal>
          <SectionTitle
            overline="New Arrivals"
            title="새로 나온 다름"
            action={{ href: "/products", label: "전체 보기" }}
            className="mb-10 md:mb-14"
          />
        </Reveal>
      </div>

      <Reveal delay={0.1}>
        <div
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-4 md:gap-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{
            paddingInline:
              "max(var(--spacing-gutter), calc((100vw - 96rem) / 2 + var(--spacing-gutter)))",
          }}
        >
          {products.map((product) => (
            <div
              key={product.id}
              className="w-[68vw] shrink-0 snap-start sm:w-72 md:w-80"
            >
              <ProductCard product={product} />
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
