import Image from "next/image";
import Link from "next/link";
import Parallax from "@/components/shop/Parallax";
import Reveal from "@/components/shop/Reveal";

const STATS: { value: string; unit?: string; label: string; note: string }[] = [
  {
    value: "8–15",
    label: "냄새 측정값",
    note: "발효 전 55~78이던 곤약의 냄새 측정값이 발효 후 8~15까지 내려갑니다.",
  },
  {
    value: "1,200만",
    unit: "CFU/g",
    label: "유산균",
    note: "발효 과정에서 자란 유산균을 그램당 1,200만 CFU까지 담았습니다.",
  },
  {
    value: "95",
    unit: "%",
    label: "제조 수율",
    note: "버려지는 원료를 줄인 안정된 공정으로 95%의 수율을 지킵니다.",
  },
];

/**
 * 발효 이야기 — forest-950 다크 풀블리드 장면.
 * 좌 텍스트 / 우 사진, 하단에 세리프 대형 수치 3개.
 */
export default function FermentStory() {
  return (
    <section className="bg-forest-950 text-cream-50">
      <div className="container-hall py-20 md:py-32">
        <div className="grid items-center gap-12 md:grid-cols-2 md:gap-20">
          <div>
            <Reveal>
              <p className="label-caps text-forest-300">Fermentation</p>
            </Reveal>
            <Reveal delay={0.08}>
              <h2 className="headline-serif mt-6 text-3xl leading-[1.25] md:text-5xl">
                냄새는 덜고,
                <br />
                식감은 살리고
              </h2>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="mt-8 max-w-md text-[15px] leading-[1.9] text-cream-50/70">
                곤약 특유의 비린 향은 효모와 유산균이 오랜 시간에 걸쳐
                걷어냅니다. 첨가물로 가리는 대신 발효로 다듬은 곤약은 향이
                조용해지고, 식감은 오히려 더 탱글해집니다. 국내 최초
                발효곤약이라는 이름은 그렇게 시작되었습니다.
              </p>
            </Reveal>
            <Reveal delay={0.24}>
              <Link
                href="/about"
                className="link-line label-caps mt-10 inline-block text-cream-50/80 transition-colors hover:text-cream-50"
              >
                발효 이야기 더 보기
              </Link>
            </Reveal>
          </div>

          <Reveal
            variant="clip"
            className="relative aspect-[4/5] overflow-hidden rounded-sm md:aspect-[5/6]"
          >
            <Parallax speed={44} className="h-full w-full">
              <Image
                src="/editorial/noodle-closeup.jpg"
                alt="발효를 마친 곤약면 클로즈업"
                fill
                sizes="(min-width: 768px) 50vw, 100vw"
                className="scale-110 object-cover"
              />
            </Parallax>
          </Reveal>
        </div>

        {/* 수치 스탯 — 헤어라인이 좌→우로 그어진 뒤 숫자가 순서대로 떠오른다 */}
        <Reveal
          variant="rule"
          className="mt-14 h-px w-full bg-cream-50/15 md:mt-24"
        />
        <div className="grid gap-9 pt-10 sm:grid-cols-3 md:gap-8 md:pt-12">
          {STATS.map((stat, i) => (
            <Reveal key={stat.label} delay={0.12 + i * 0.1}>
              <p className="headline-serif krw text-4xl text-cream-50 md:text-[2.5rem] md:leading-none lg:text-[3.25rem]">
                {stat.value}
                {stat.unit && (
                  <span className="ml-1.5 whitespace-nowrap text-lg md:text-xl">
                    {stat.unit}
                  </span>
                )}
              </p>
              <p className="label-caps mt-4 text-forest-300">{stat.label}</p>
              <p className="mt-2 max-w-[17rem] text-[13px] leading-relaxed text-cream-50/60">
                {stat.note}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
