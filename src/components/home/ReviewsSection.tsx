import Reveal from "@/components/shop/Reveal";
import SectionTitle from "@/components/shop/SectionTitle";

/** 홈 후기 표시용 축약 타입 (page.tsx에서 매핑해 전달) */
export interface HomeReview {
  id: string;
  rating: number;
  content: string;
  name: string | null;
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
    name: "김지현",
    productName: "발효곤약면",
  },
  {
    id: "fallback-2",
    rating: 5,
    content:
      "저녁마다 밥에 섞어 먹은 지 두 달째예요. 식감이 밥알과 잘 어울려서 거부감이 없고, 속이 한결 가볍습니다.",
    name: "박서연",
    productName: "곤약쌀",
  },
  {
    id: "fallback-3",
    rating: 4,
    content:
      "야식으로 떡볶이를 포기 못 했는데 이걸로 바꾸고 나서 부담이 훨씬 줄었어요. 쫄깃한 식감은 그대로라 만족합니다.",
    name: "이준호",
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

/** 이름 마스킹 — 김지현 → 김*현 */
function maskName(name: string | null): string {
  const t = name?.trim() ?? "";
  if (t.length === 0) return "다름 고객";
  if (t.length === 1) return t;
  if (t.length === 2) return `${t[0]}*`;
  return `${t[0]}${"*".repeat(t.length - 2)}${t[t.length - 1]}`;
}

/** 리뷰/신뢰 섹션 — 세리프 인용 2~3개 + 별점 */
export default function ReviewsSection({ reviews }: ReviewsSectionProps) {
  const list = (reviews.length > 0 ? reviews : FALLBACK_REVIEWS).slice(0, 3);

  return (
    <section className="bg-cream-100 py-24 md:py-32">
      <div className="container-hall">
        <Reveal>
          <SectionTitle
            overline="Voices"
            title="먼저 맛본 분들의 이야기"
            className="mb-12 md:mb-16"
          />
        </Reveal>

        <div className="grid gap-12 md:grid-cols-3 md:gap-8 lg:gap-12">
          {list.map((review, i) => (
            <Reveal
              key={review.id}
              as="figure"
              delay={i * 0.1}
              className="flex h-full flex-col"
            >
              <Stars rating={review.rating} />
              <blockquote className="headline-serif mt-6 flex-1 text-lg leading-[1.7] text-ink-900 md:text-xl">
                <p className="line-clamp-5">“{review.content}”</p>
              </blockquote>
              <figcaption className="mt-8 flex items-center gap-3 text-[13px] text-ink-500">
                <span className="font-medium text-ink-700">
                  {maskName(review.name)} 님
                </span>
                {review.productName && (
                  <>
                    <span aria-hidden className="h-3 w-px bg-ink-300" />
                    <span>{review.productName}</span>
                  </>
                )}
              </figcaption>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
