import Marquee from "@/components/shop/Marquee";

const ITEMS = [
  "HACCP",
  "FSSC 22000",
  "VEGAN",
  "HALAL",
  "특허 제10-2547189호",
  "특허 제10-2537721호",
  "1일 25톤 생산",
  "국내 최초 발효곤약",
];

/** 인증·이력 마퀴 스트립 — 히어로 직하단에서 조용히 흐른다 */
export default function CertMarquee() {
  return (
    <section aria-label="인증 및 생산 이력">
      <Marquee className="hairline-t hairline-b bg-cream-50 py-5">
        {ITEMS.map((item) => (
          <span key={item} className="flex items-center">
            <span className="label-caps mx-7 whitespace-nowrap text-ink-500 md:mx-10">
              {item}
            </span>
            <span aria-hidden className="h-1 w-1 rounded-full bg-forest-300" />
          </span>
        ))}
      </Marquee>
    </section>
  );
}
