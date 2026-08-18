import Reveal from "@/components/shop/Reveal";
import SectionTitle from "@/components/shop/SectionTitle";

/**
 * 홈 후기 표시용 축약 타입.
 * 이름은 이미 마스킹된 상태로 들어온다 — 캐시 계층(lib/cache.ts 의 maskHomeName)이
 * 원본 이름을 공유 캐시에 남기지 않으려고 적재 전에 마스킹을 끝내기 때문이다.
 * 여기서 다시 마스킹하면 "김*현" 이 "김**" 로 뭉개진다.
 */
export interface HomeReview {
  id: string;
  rating: number;
  content: string;
  maskedName: string;
  productName: string | null;
}

export interface ReviewsSectionProps {
  /** 실제 후기 — 비어 있으면 큐레이션 문구로 대체 */
  reviews: HomeReview[];
}

/** 후기가 아직 없을 때 쓰는 큐레이션 문구 */
const FALLBACK_REVIEWS: HomeReview[] = [
  {
    id: "fallback-1",
    rating: 5,
    content:
      "곤약 특유의 냄새가 정말 안 나서 놀랐어요. 헹구지 않고 바로 조리해도 비린내가 없고, 아이들도 국수인 줄 알고 잘 먹습니다.",
    maskedName: "김*현",
    productName: "발효곤약면",
  },
  {
    id: "fallback-2",
    rating: 5,
    content:
      "저녁마다 밥에 섞어 먹은 지 두 달째예요. 식감이 밥알과 잘 어울려서 거부감이 없고, 속이 한결 가볍습니다.",
    maskedName: "박*연",
    productName: "곤약쌀",
  },
  {
    id: "fallback-3",
    rating: 4,
    content:
      "야식으로 떡볶이를 포기 못 했는데 이걸로 바꾸고 나서 부담이 훨씬 줄었어요. 쫄깃한 식감은 그대로라 만족합니다.",
    maskedName: "이*호",
    productName: "곤약 떡볶이떡",
  },
];

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5" role="img" aria-label={`별점 5점 만점에 ${rating}점`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          aria-hidden
          className={`text-[15px] leading-none ${i < rating ? "text-forest-600" : "text-ink-200"}`}
        >
          ★
        </span>
      ))}
    </div>
  );
}

/** 리뷰/신뢰 섹션 — 세리프 인용 2~3개 + 별점 */
export default function ReviewsSection({ reviews }: ReviewsSectionProps) {
  const list = (reviews.length > 0 ? reviews : FALLBACK_REVIEWS).slice(0, 3);

  return (
    <section className="bg-cream-100 py-16 md:py-28">
      <div className="container-hall">
        <Reveal>
          <SectionTitle
            overline="Voices"
            title="먼저 맛본 분들의 이야기"
            className="mb-10 md:mb-14"
          />
        </Reveal>

        <div className="grid gap-10 md:grid-cols-3 md:gap-8 lg:gap-12">
          {list.map((review, i) => (
            <div key={review.id} className="flex h-full flex-col">
              {/* 헤어라인이 좌→우로 그어진 뒤, 인용문이 블러가 걷히며 떠오른다 */}
              <Reveal
                variant="rule"
                delay={i * 0.12}
                className="h-px w-full bg-ink-200"
              />
              <Reveal
                as="figure"
                variant="blur"
                delay={0.1 + i * 0.12}
                className="flex flex-1 flex-col pt-7"
              >
                <Stars rating={review.rating} />
                <blockquote className="headline-serif mt-6 flex-1 text-lg leading-[1.7] text-ink-900 md:text-xl">
                  <p className="line-clamp-5">“{review.content}”</p>
                </blockquote>
                <figcaption className="mt-8 flex items-center gap-3 text-[13px] text-ink-500">
                  <span className="font-medium text-ink-700">
                    {review.maskedName} 님
                  </span>
                  {review.productName && (
                    <>
                      <span aria-hidden className="h-3 w-px bg-ink-300" />
                      <span>{review.productName}</span>
                    </>
                  )}
                </figcaption>
              </Reveal>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
