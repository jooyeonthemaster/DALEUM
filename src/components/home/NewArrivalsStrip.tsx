import type { CSSProperties } from "react";
import type { ProductCardRow } from "@/lib/types";
import ProductCard from "@/components/shop/ProductCard";
import Reveal from "@/components/shop/Reveal";
import SectionTitle from "@/components/shop/SectionTitle";

export interface NewArrivalsStripProps {
  /**
   * 최신 등록 순 상품.
   * 카드 표시에 필요한 컬럼만 담은 행이라, 전체 행(ProductWithImages)을 가진
   * 호출부도 그대로 넘길 수 있다.
   */
  products: ProductCardRow[];
}

/**
 * 스트립 좌우 인셋 — container-hall의 좌측 라인과 정확히 같은 값.
 *
 * 100vw가 아니라 100%인 이유: 100vw는 세로 스크롤바 폭까지 포함하므로,
 * container-hall(문서 콘텐츠 폭 기준)보다 스크롤바 절반만큼 오른쪽으로 밀린다.
 * %는 컨테이닝 블록의 인라인 폭으로 풀리므로 제목 라인과 픽셀 단위로 일치한다.
 */
const EDGE_INSET =
  "max(var(--spacing-gutter), calc((100% - 96rem) / 2 + var(--spacing-gutter)))";

/**
 * 신상품 스트립 — 가로 스크롤(스냅) 카드.
 * 시작 여백은 container-hall의 좌측 라인과 정확히 맞춘다.
 *
 * 주의: snap-mandatory + snap-start 스크롤러에서 padding-inline만 주면
 * 스냅포트 시작선이 "패딩 박스"라, 브라우저가 첫 카드를 그 선에 붙이려고
 * 스크롤을 패딩만큼 자동으로 먹는다(scrollLeft === paddingLeft). 결과적으로
 * 좌측 여백이 통째로 사라지고 카드가 화면 끝에 붙어 잘려 보인다.
 * scroll-padding-inline으로 스냅포트를 콘텐츠 라인까지 밀어줘야 여백이 남는다.
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
            paddingInline: EDGE_INSET,
            scrollPaddingInline: EDGE_INSET,
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
