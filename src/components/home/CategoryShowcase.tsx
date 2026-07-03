import Image from "next/image";
import Link from "next/link";
import type { Category } from "@/lib/types";
import Reveal from "@/components/shop/Reveal";
import SectionTitle from "@/components/shop/SectionTitle";

export interface CategoryShowcaseProps {
  /** 활성 카테고리 (sort_order 정렬, 최대 5개 노출) */
  categories: Category[];
}

/** 카테고리 이미지가 없을 때 순서대로 쓰는 에디토리얼 대체 사진 */
const FALLBACK_IMAGES = [
  "/editorial/guksi-wood.jpg",
  "/editorial/somyeon-bowl.jpg",
  "/editorial/tteok-bowl.jpg",
  "/editorial/miyeok-noodle-bowl.jpg",
  "/editorial/buckwheat-noodle.jpg",
];

interface TileProps {
  category: Category;
  /** 전체 목록에서의 순번 (01/02/03 표기용) */
  index: number;
  image: string;
  sizes: string;
  className?: string;
}

function CategoryTile({ category, index, image, sizes, className = "" }: TileProps) {
  return (
    <Link
      href={`/products?category=${category.slug}`}
      className={`showcase-img group relative block overflow-hidden rounded-sm bg-cream-100 ${className}`}
    >
      <Image
        src={image}
        alt={category.name}
        fill
        sizes={sizes}
        className="object-cover"
      />
      {/* 하단 스크림 — 세리프 이름이 어떤 사진 위에서도 읽히도록 */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(to_top,rgba(25,28,24,0.62)_0%,rgba(25,28,24,0.12)_45%,rgba(25,28,24,0)_70%)]"
      />
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-6 md:p-8">
        <div className="min-w-0">
          <p className="label-caps text-[10px] text-cream-50/70">
            {String(index + 1).padStart(2, "0")}
          </p>
          <h3 className="headline-serif mt-2 text-xl text-cream-50 md:text-2xl">
            {category.name}
          </h3>
          {category.description && (
            <p className="mt-1 line-clamp-1 text-[13px] text-cream-50/70">
              {category.description}
            </p>
          )}
        </div>
        <span className="label-caps shrink-0 pb-1 text-cream-50/0 transition-colors duration-500 group-hover:text-cream-50">
          보러 가기
        </span>
      </div>
    </Link>
  );
}

/**
 * 카테고리 쇼케이스 — 비대칭 그리드.
 * 큰 타일 1 + 우측 스택 2 + 하단 와이드 최대 2.
 */
export default function CategoryShowcase({ categories }: CategoryShowcaseProps) {
  if (categories.length === 0) return null;

  const list = categories.slice(0, 5);
  const [first, ...rest] = list;
  const side = rest.slice(0, 2);
  const bottom = rest.slice(2);

  const imageOf = (cat: Category, i: number) =>
    cat.image_url ?? FALLBACK_IMAGES[i % FALLBACK_IMAGES.length];

  // 우측 스택이 있으면 큰 타일은 행 높이를 그대로 채우고, 혼자면 와이드 비율
  const bigAspect =
    side.length > 0
      ? "aspect-[4/5] sm:aspect-[3/2] md:aspect-auto md:h-full"
      : "aspect-[4/5] sm:aspect-[21/9]";

  return (
    <section className="container-hall py-24 md:py-32">
      <Reveal>
        <SectionTitle
          overline="Collections"
          title="오늘은 어떤 식탁을 차릴까요"
          action={{ href: "/products", label: "전체 상품" }}
          className="mb-10 md:mb-14"
        />
      </Reveal>

      <div className="grid gap-3 md:grid-cols-12 md:gap-4">
        <Reveal variant="clip" className={side.length > 0 ? "md:col-span-7" : "md:col-span-12"}>
          <CategoryTile
            category={first}
            index={0}
            image={imageOf(first, 0)}
            sizes="(min-width: 768px) 58vw, 100vw"
            className={bigAspect}
          />
        </Reveal>

        {side.length > 0 && (
          <div className="grid content-start gap-3 md:col-span-5 md:gap-4">
            {side.map((cat, i) => (
              <Reveal key={cat.id} delay={0.12 + i * 0.08}>
                <CategoryTile
                  category={cat}
                  index={i + 1}
                  image={imageOf(cat, i + 1)}
                  sizes="(min-width: 768px) 42vw, 100vw"
                  className={
                    side.length === 1
                      ? "aspect-[16/10] md:aspect-[4/5]"
                      : "aspect-[16/10] md:aspect-[16/11]"
                  }
                />
              </Reveal>
            ))}
          </div>
        )}

        {bottom.map((cat, i) => (
          <Reveal
            key={cat.id}
            delay={0.12 + i * 0.08}
            className={bottom.length === 1 ? "md:col-span-12" : "md:col-span-6"}
          >
            <CategoryTile
              category={cat}
              index={i + 3}
              image={imageOf(cat, i + 3)}
              sizes="(min-width: 768px) 50vw, 100vw"
              className={bottom.length === 1 ? "aspect-[16/9] md:aspect-[21/8]" : "aspect-[16/9] md:aspect-[16/8]"}
            />
          </Reveal>
        ))}
      </div>
    </section>
  );
}
