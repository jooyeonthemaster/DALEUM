import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import Reveal from "@/components/shop/Reveal";
import FermentContrast from "@/components/about/FermentContrast";
import HistoryTimeline, { type TimelineEntry } from "@/components/about/HistoryTimeline";
import OdorScale from "@/components/about/OdorScale";
import { COMPANY } from "@/lib/constants";

export const metadata: Metadata = {
  title: "브랜드 스토리",
  description:
    "국내 최초 효모·유산균 발효곤약. 냄새·식감·열·냉동·산 — 일반 곤약의 다섯 가지 한계를 발효로 극복한 다름의 이야기.",
};

/* ---------- 연혁 데이터 ---------- */

const HISTORY: TimelineEntry[] = [
  {
    date: "2019.07",
    title: "다름 설립",
    description: "일본 Soy Machine System과 기술 파트너십을 맺으며 발효곤약의 여정을 시작했습니다.",
  },
  { date: "2020.12", title: "고양 본사·공장 준공" },
  {
    date: "2021.09",
    title: "주식회사 다름으로 상호 변경, 식품제조업 허가 취득",
  },
  { date: "2021.10", title: "HACCP 인증 획득" },
  { date: "2021.12", title: "연구개발전담부서 설립" },
  {
    date: "2022.03",
    title: "소비자 브랜드 마틴조 런칭, 발효곤약라면 생산 개시",
  },
  { date: "2022.11", title: "미국 FDA 등록" },
  {
    date: "2023.03",
    title: "생산설비 3호 라인 증설",
    description: "1일 생산량 25톤 체제를 갖췄습니다.",
  },
  { date: "2023.05", title: "FSSC 22000 인증 획득" },
  { date: "2023.06", title: "발효곤약 관련 특허 2건 등록" },
  { date: "2023.07", title: "일반 HACCP 전환, VEGAN 인증 획득" },
  { date: "2023.08", title: "HALAL 인증 획득" },
];

/* ---------- 특허/인증 데이터 ---------- */

const PATENTS = [
  {
    no: "특허 제10-2544843호",
    name: "유산균 발효를 이용한 곤약의 제조 방법",
    desc: "곤약 특유의 냄새를 없애고 조직을 치밀하게 만드는 유산균 발효 공정.",
  },
  {
    no: "특허 제10-2544844호",
    name: "효모 발효를 이용한 곤약 냄새 저감 방법",
    desc: "효모 발효로 냄새 원인 물질을 분해해 무취에 가까운 곤약을 완성하는 기술.",
  },
];

const CERTS = [
  { name: "HACCP", desc: "식품안전관리인증 — 전 공정 위해요소 관리" },
  { name: "FSSC 22000", desc: "글로벌 식품안전 시스템 인증" },
  { name: "VEGAN", desc: "한국비건인증원 비건 인증" },
  { name: "HALAL", desc: "할랄 인증 — 수출 기준 충족" },
  { name: "FDA 등록", desc: "미국 식품의약국 시설 등록" },
  { name: "기업부설연구소", desc: "연구개발전담부서 — 발효 기술 R&D" },
];

const KAKAO_MAP_URL = `https://map.kakao.com/link/search/${encodeURIComponent(
  "경기도 고양시 일산동구 동국로 194"
)}`;

export default function AboutPage() {
  return (
    <div>
      {/* ============ 오프닝 — 풀블리드 ============ */}
      <section className="relative flex min-h-[72vh] items-end overflow-hidden md:min-h-[85vh]">
        <Image
          src="/editorial/noodle-closeup.jpg"
          alt="발효곤약면 클로즈업"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div aria-hidden className="absolute inset-0 bg-forest-950/45" />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-forest-950/85 via-forest-950/25 to-forest-950/15"
        />
        <div className="container-hall relative pt-36 pb-16 md:pb-24">
          <Reveal>
            <p className="label-caps text-forest-200">Brand Story · Since 2019</p>
            <h1 className="headline-serif mt-6 text-[2.75rem] leading-[1.12] text-cream-50 md:text-6xl lg:text-7xl">
              다름은, 다릅니다
            </h1>
            <p className="mt-7 max-w-xl text-base leading-relaxed text-cream-200 md:text-lg">
              곤약 그 이상의 한계를 발효로 완성하다.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ============ 인트로 선언 ============ */}
      <section className="container-hall py-24 md:py-36">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="label-caps text-forest-600">Fermented Konjac</p>
          <p className="headline-serif mt-8 text-2xl leading-[1.55] text-ink-900 md:text-[2.1rem]">
            곤약은 천 년을 먹어온 식재료지만,
            <br />
            누구도 그 한계를 넘지 못했습니다.
          </p>
          <p className="mx-auto mt-8 max-w-xl text-[15px] leading-loose text-ink-600">
            다름은 국내 최초로 효모와 유산균 발효 기술을 곤약에 적용했습니다.
            냄새 때문에 데쳐야 했고, 식감 때문에 겉돌았고, 열과 냉동과 산 앞에서
            무너지던 곤약 — 그 다섯 가지 한계를 발효 하나로 넘었습니다.
          </p>
        </Reveal>

        <div className="mt-20 grid gap-4 md:mt-28 md:grid-cols-12 md:gap-6">
          <Reveal variant="clip" className="md:col-span-7">
            <figure className="showcase-img grain-overlay relative aspect-[16/10] overflow-hidden">
              <Image
                src="/editorial/konjac-tubers.jpg"
                alt="수확한 곤약 구근"
                fill
                sizes="(min-width: 768px) 55vw, 100vw"
                className="object-cover"
              />
            </figure>
            <figcaption className="label-caps mt-4 text-ink-400">
              01 — 곤약 구근
            </figcaption>
          </Reveal>
          <Reveal variant="clip" delay={0.15} className="md:col-span-5 md:mt-24">
            <figure className="showcase-img grain-overlay relative aspect-[4/3] overflow-hidden">
              <Image
                src="/editorial/konjac-powder.jpg"
                alt="정제한 곤약 분말"
                fill
                sizes="(min-width: 768px) 40vw, 100vw"
                className="object-cover"
              />
            </figure>
            <figcaption className="label-caps mt-4 text-ink-400">
              02 — 정제 분말, 그리고 발효
            </figcaption>
          </Reveal>
        </div>
      </section>

      {/* ============ 발효 기술 챕터 — 5가지 한계 ============ */}
      <section className="hairline-t bg-cream-100">
        <div className="container-hall py-24 md:py-36">
          <Reveal className="max-w-2xl">
            <p className="label-caps text-forest-600">Chapter 01 — Fermentation</p>
            <h2 className="headline-serif mt-6 text-3xl text-ink-900 md:text-[2.6rem]">
              일반 곤약의 다섯 가지 한계,
              <br />
              발효가 전부 넘었습니다
            </h2>
          </Reveal>

          <FermentContrast className="mt-14 md:mt-20" />

          {/* 냄새 수치 비교 */}
          <Reveal className="mt-16 border border-ink-200 bg-cream-50 p-7 md:mt-24 md:p-14">
            <div className="grid gap-10 md:grid-cols-[1fr_1.3fr] md:gap-16">
              <div>
                <p className="label-caps text-forest-600">Odor Test</p>
                <h3 className="headline-serif mt-5 text-2xl text-ink-900 md:text-[1.9rem]">
                  냄새는, 숫자로
                  <br />
                  증명합니다
                </h3>
                <p className="mt-6 max-w-sm text-sm leading-loose text-ink-600">
                  냄새 측정기로 잰 일반 곤약의 냄새 강도는 55~78. 다름의
                  발효곤약은 8~15 — 아메리카노 한 잔(13)과 같은 수준입니다.
                  데치지 않고 뜯자마자 조리해도 되는 이유입니다.
                </p>
              </div>
              <OdorScale
                className="self-center"
                scaleMax={80}
                items={[
                  { label: "일반 곤약", min: 55, max: 78, tone: "muted" },
                  { label: "다름 발효곤약", min: 8, max: 15, tone: "forest" },
                  { label: "아메리카노", note: "참고 기준", min: 13, max: 13, tone: "ref" },
                ]}
                caption="냄새 측정기 측정값 — 수치가 낮을수록 냄새가 적습니다. 자사 품질 검사 기준."
              />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============ 특허/인증 — 다크 밴드 ============ */}
      <section className="bg-forest-950 text-cream-100">
        <div className="container-hall py-24 md:py-36">
          <Reveal className="max-w-2xl">
            <p className="label-caps text-forest-300">Chapter 02 — Proof</p>
            <h2 className="headline-serif mt-6 text-3xl text-cream-50 md:text-[2.6rem]">
              기술은 특허로,
              <br />
              신뢰는 인증으로
            </h2>
          </Reveal>

          {/* 특허 2건 */}
          <div className="mt-14 grid gap-px bg-forest-800 md:mt-20 md:grid-cols-2">
            {PATENTS.map((patent, i) => (
              <Reveal key={patent.no} delay={i * 0.1} className="bg-forest-950 py-10 md:px-10 md:py-12">
                <p className="label-caps krw text-forest-300">{patent.no}</p>
                <p className="headline-serif mt-5 text-xl text-cream-50 md:text-2xl">
                  {patent.name}
                </p>
                <p className="mt-4 max-w-md text-sm leading-relaxed text-forest-200">
                  {patent.desc}
                </p>
              </Reveal>
            ))}
          </div>

          {/* 인증 그리드 — 텍스트 중심 */}
          <div className="mt-16 grid grid-cols-2 gap-x-8 gap-y-12 border-t border-forest-800 pt-14 md:mt-20 md:grid-cols-3 md:gap-x-12">
            {CERTS.map((cert, i) => (
              <Reveal key={cert.name} delay={i * 0.06}>
                <p className="label-caps text-cream-50">{cert.name}</p>
                <p className="mt-3 text-[13px] leading-relaxed text-forest-300">
                  {cert.desc}
                </p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ 연혁 타임라인 ============ */}
      <section className="container-hall py-24 md:py-36">
        <Reveal className="max-w-2xl">
          <p className="label-caps text-forest-600">Chapter 03 — History</p>
          <h2 className="headline-serif mt-6 text-3xl text-ink-900 md:text-[2.6rem]">
            2019년의 확신이
            <br />
            오늘의 다름이 되기까지
          </h2>
        </Reveal>

        <HistoryTimeline entries={HISTORY} className="mt-16 md:mt-24" />
      </section>

      {/* ============ 생산 ============ */}
      <section className="hairline-t bg-cream-100">
        <div className="container-hall py-24 md:py-36">
          <div className="grid gap-12 md:grid-cols-12 md:gap-8">
            <Reveal className="md:col-span-4">
              <p className="label-caps text-forest-600">Chapter 04 — Production</p>
              <h2 className="headline-serif mt-6 text-3xl text-ink-900 md:text-[2.4rem]">
                하루 25톤,
                <br />
                세 개의 라인
              </h2>
              <p className="mt-8 max-w-sm text-[15px] leading-loose text-ink-600">
                고양 본사 공장의 모든 공정은 HACCP과 FSSC 22000 기준으로
                관리됩니다. 원료 입고부터 세척·발효·성형·포장까지 구역을
                분리하고, 매일 전 라인을 살균 세척한 뒤에야 다음 생산을
                시작합니다. 위생은 절차가 아니라 습관이라고 믿습니다.
              </p>
            </Reveal>

            <div className="md:col-span-8">
              <Reveal variant="clip">
                <figure className="showcase-img relative aspect-[16/10] overflow-hidden">
                  <Image
                    src="/editorial/factory-line.jpg"
                    alt="다름 고양 공장 생산 라인"
                    fill
                    sizes="(min-width: 768px) 62vw, 100vw"
                    className="object-cover"
                  />
                </figure>
              </Reveal>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Reveal variant="clip" delay={0.12}>
                  <figure className="showcase-img relative aspect-[3/2] overflow-hidden">
                    <Image
                      src="/editorial/factory-pouches.jpg"
                      alt="컨베이어 위의 발효곤약 파우치"
                      fill
                      sizes="(min-width: 640px) 31vw, 100vw"
                      className="object-cover"
                    />
                  </figure>
                </Reveal>
                <Reveal delay={0.2} className="flex flex-col justify-center gap-7 border border-ink-200 bg-cream-50 p-7">
                  {[
                    { value: "25톤", label: "1일 최대 생산량" },
                    { value: "3개", label: "독립 생산 라인" },
                    { value: "21개사", label: "OEM 파트너" },
                  ].map((stat) => (
                    <div key={stat.label} className="flex items-baseline justify-between gap-4">
                      <span className="krw headline-serif text-3xl text-forest-700 md:text-4xl">
                        {stat.value}
                      </span>
                      <span className="label-caps text-ink-400">{stat.label}</span>
                    </div>
                  ))}
                </Reveal>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ 대표 인사 ============ */}
      <section className="container-hall py-24 md:py-36">
        <div className="grid items-center gap-12 md:grid-cols-12 md:gap-16">
          <Reveal variant="clip" className="md:col-span-5">
            <figure className="showcase-img grain-overlay relative aspect-[6/5] overflow-hidden">
              <Image
                src="/editorial/ceo-martin.jpg"
                alt="다름 대표 조중규 — 마틴조"
                fill
                sizes="(min-width: 768px) 40vw, 100vw"
                className="object-cover"
              />
            </figure>
          </Reveal>

          <Reveal delay={0.1} className="md:col-span-7">
            <p className="label-caps text-forest-600">Founder — Martin Cho</p>
            <blockquote className="headline-serif mt-7 text-2xl leading-[1.5] text-ink-900 md:text-[2rem]">
              “곤약을 다시 발명한 것이 아닙니다.
              <br />
              발효로, 마침내 완성했을 뿐입니다.”
            </blockquote>
            <div className="mt-8 max-w-xl space-y-5 text-[15px] leading-loose text-ink-600">
              <p>
                안경 쓴 캐릭터 마틴조의 주인공, 대표 조중규입니다. 저는 곤약이
                가진 가능성을 믿었고, 그 가능성을 가로막는 것이 곤약 자체가
                아니라 만드는 방법이라고 생각했습니다. 4년의 발효 연구 끝에
                냄새 없는 곤약, 면 같은 곤약, 얼려도 되는 곤약을 만들었습니다.
              </p>
              <p>
                마켓컬리, 쿠캣, 대상 — 까다롭기로 이름난 21개사가 자신들의
                이름을 걸고 다름의 기술을 선택했습니다. 이제 그 기술을 다름의
                이름으로, 당신의 식탁에 올립니다.
              </p>
            </div>
            <p className="mt-9 flex items-baseline gap-3">
              <span className="headline-serif text-lg text-ink-900">조중규</span>
              <span className="label-caps text-ink-400">CEO, Daleum Co., Ltd.</span>
            </p>
          </Reveal>
        </div>
      </section>

      {/* ============ 클로징 — 오시는 길 ============ */}
      <section className="hairline-t">
        <div className="container-hall py-24 md:py-36">
          <Reveal className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="label-caps text-forest-600">Visit Us</p>
              <h2 className="headline-serif mt-6 text-3xl text-ink-900 md:text-[2.6rem]">
                오시는 길
              </h2>
            </div>
            <a
              href={KAKAO_MAP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="link-line label-caps pb-1 text-ink-600 transition-colors hover:text-ink-900"
            >
              카카오맵에서 보기
            </a>
          </Reveal>

          <Reveal variant="clip" className="mt-12 md:mt-16">
            <figure className="showcase-img relative aspect-[16/10] overflow-hidden md:aspect-[21/9]">
              <Image
                src="/editorial/building.jpg"
                alt="경기도 고양시 다름 본사 사옥"
                fill
                sizes="100vw"
                className="object-cover"
              />
            </figure>
          </Reveal>

          <div className="mt-12 grid gap-10 md:mt-16 md:grid-cols-3 md:gap-8">
            <Reveal>
              <p className="label-caps text-ink-400">Address</p>
              <p className="mt-4 text-[15px] leading-relaxed text-ink-900">
                {COMPANY.address}
              </p>
            </Reveal>
            <Reveal delay={0.08}>
              <p className="label-caps text-ink-400">Contact</p>
              <p className="krw mt-4 text-[15px] leading-relaxed text-ink-900">
                전화 {COMPANY.tel}
                <br />
                팩스 {COMPANY.fax}
                <br />
                {COMPANY.email}
              </p>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="label-caps text-ink-400">Hours</p>
              <p className="krw mt-4 text-[15px] leading-relaxed text-ink-900">
                {COMPANY.csHours}
              </p>
            </Reveal>
          </div>

          <Reveal className="mt-16 flex flex-col items-center gap-8 border border-ink-200 bg-cream-100 px-6 py-14 text-center md:mt-24 md:py-20">
            <p className="headline-serif max-w-lg text-xl leading-relaxed text-ink-900 md:text-2xl">
              발효가 완성한 곤약의 식탁,
              <br />
              이제 직접 확인해 보세요.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/products"
                className="label-caps inline-block bg-ink-900 px-9 py-3.5 text-cream-50 transition-colors duration-500 hover:bg-forest-800"
              >
                상품 보러 가기
              </Link>
              <Link
                href="/support"
                className="label-caps inline-block border border-ink-900 px-9 py-3.5 text-ink-900 transition-colors duration-500 hover:bg-ink-900 hover:text-cream-50"
              >
                문의하기
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
