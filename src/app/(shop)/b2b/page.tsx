import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getCachedBulkProducts } from "@/lib/cache";
import { COMPANY } from "@/lib/constants";
import Reveal from "@/components/shop/Reveal";
import RevealText from "@/components/shop/RevealText";
import SectionTitle from "@/components/shop/SectionTitle";
import SpecTable from "@/components/catalog/SpecTable";
import BulkInquiryForm, { type BulkProductOption } from "@/components/shop/BulkInquiryForm";

export const metadata: Metadata = {
  title: "업소용·OEM 문의",
  description:
    "다름의 4kg 벌크 곤약쌀·곤약면과 발효곤약 페이스트 — 업소용 대용량, OEM·ODM, 원료 납품 문의를 받습니다.",
};

const CAPABILITIES = [
  {
    label: "발효 공법",
    body: "효모·유산균 발효로 곤약 특유의 냄새를 줄이고 식감과 소스 흡착을 개선했습니다. 특허 제10-2547189호·제10-2537721호.",
  },
  {
    label: "레토르트 대응",
    body: "열가열·레토르트 공정을 견디는 배합으로, 원료에 따라 공정 수율 75~95%를 확보합니다.",
  },
  {
    label: "냉동 유통",
    body: "알파발효곤약쌀은 내한성 처리로 가공 후 냉동유통이 가능하며, 해동 시 이수 현상이 적습니다.",
  },
  {
    label: "인증",
    body: "HACCP · FSSC 22000 · VEGAN · HALAL(2023.08) 인증 기반으로 생산합니다.",
  },
];

export default async function B2BPage() {
  /**
   * 4kg 벌크·페이스트는 견적 거래 품목이라 판매(장바구니·결제)를 열지 않는다.
   * 상품 자체는 draft 로 두고 여기서 사양만 공개한 뒤 문의로 받는다.
   * draft 는 RLS 로 익명에게 가려지므로 캐시 계층이 service role 로 읽고,
   * 쿠키·유저와 무관한 고정 목록이라 전 방문자가 같은 결과를 공유한다.
   */
  const products = await getCachedBulkProducts();
  const options: BulkProductOption[] = products.map((p) => ({ slug: p.slug, name: p.name }));

  return (
    <div className="container-hall pb-24 md:pb-36">
      {/* ---------- 헤더 ---------- */}
      <div className="py-16 text-center md:py-24">
        <Reveal>
          <p className="label-caps text-forest-600">For Business</p>
        </Reveal>
        <RevealText
          as="h1"
          text="업소용·OEM 문의"
          delay={0.1}
          className="headline-serif mt-6 block text-3xl text-ink-900 md:text-[2.75rem]"
        />
        <Reveal delay={0.3}>
          <p className="mx-auto mt-6 max-w-lg text-[15px] leading-relaxed text-pretty text-ink-500">
            다름은 발효곤약 원료를 직접 만드는 제조사입니다.
            4kg 벌크 곤약쌀·곤약면과 발효곤약 페이스트는 규격과 물량에 따라 조건이 달라
            낱개 판매 대신 견적으로 안내드립니다.
          </p>
        </Reveal>
        <Reveal delay={0.4}>
          <a
            href="#inquiry"
            className="group label-caps mt-6 inline-block py-3.5 text-ink-600 transition-colors hover:text-ink-900"
          >
            <span className="relative after:absolute after:left-0 after:-bottom-[3px] after:h-px after:w-full after:origin-right after:scale-x-0 after:bg-current after:transition-transform after:duration-500 after:[transition-timing-function:var(--ease-hall)] group-hover:after:origin-left group-hover:after:scale-x-100">
              견적 문의하기
            </span>
          </a>
        </Reveal>
      </div>

      {/* ---------- 제조 역량 ---------- */}
      <section className="scroll-mt-28">
        <Reveal>
          <SectionTitle overline="Capability" title="제조 역량" className="mb-10" />
        </Reveal>
        <div className="grid border border-ink-200 md:grid-cols-2">
          {CAPABILITIES.map((c, i) => (
            <Reveal
              key={c.label}
              delay={i * 0.07}
              className={`border-ink-200 p-8 md:p-10 ${
                i % 2 === 0 ? "md:border-r" : ""
              } ${i < CAPABILITIES.length - 1 ? "border-b md:border-b" : ""} ${
                i >= CAPABILITIES.length - 2 ? "md:border-b-0" : ""
              }`}
            >
              <p className="label-caps text-ink-400">{c.label}</p>
              <p className="mt-4 text-[15px] leading-relaxed text-pretty text-ink-700">{c.body}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- 취급 품목 ---------- */}
      <section id="lineup" className="scroll-mt-28 pt-20 md:pt-28">
        <Reveal>
          <SectionTitle
            overline="Lineup"
            title={`취급 품목${products.length > 0 ? ` (${products.length})` : ""}`}
            className="mb-10"
          />
        </Reveal>

        {products.length === 0 ? (
          <Reveal>
            <p className="border border-ink-200 px-6 py-14 text-center text-sm text-ink-500">
              품목 정보를 준비 중입니다. 아래 문의를 남겨주시면 담당자가 직접 안내해 드립니다.
            </p>
          </Reveal>
        ) : (
          <div className="space-y-4">
            {products.map((product, i) => {
              const image =
                [...(product.product_images ?? [])].sort(
                  (a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order
                )[0] ?? null;
              return (
                <Reveal key={product.id} delay={(i % 4) * 0.06}>
                  <article className="grid gap-6 border border-ink-200 p-6 md:grid-cols-[200px_1fr] md:gap-10 md:p-8">
                    <div className="relative aspect-square w-full overflow-hidden bg-cream-100 md:w-[200px]">
                      {image ? (
                        <Image
                          src={image.url}
                          alt={image.alt ?? product.name}
                          fill
                          sizes="(min-width: 768px) 200px, 100vw"
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[13px] text-ink-300">
                          이미지 준비 중
                        </div>
                      )}
                    </div>

                    <div>
                      <h3 className="headline-serif text-xl text-ink-900">{product.name}</h3>
                      {product.subtitle && (
                        <p className="mt-2 text-sm leading-relaxed text-pretty text-ink-500">
                          {product.subtitle}
                        </p>
                      )}
                      {product.description && (
                        <ul className="mt-4 space-y-1.5">
                          {product.description
                            .split("\n")
                            .filter((line) => line.trim().startsWith("- "))
                            .map((line, j) => (
                              <li
                                key={j}
                                className="relative pl-5 text-[13px] leading-[1.8] text-ink-600 before:absolute before:left-0 before:text-ink-300 before:content-['—']"
                              >
                                {line.trim().slice(2)}
                              </li>
                            ))}
                        </ul>
                      )}
                      {Object.keys(product.specs ?? {}).length > 0 && (
                        <SpecTable data={product.specs} columns={2} className="mt-6" />
                      )}
                      <p className="mt-5 text-[13px] text-ink-400">
                        규격·물량에 따라 단가가 달라집니다 —{" "}
                        <a href="#inquiry" className="text-forest-700 underline underline-offset-4">
                          견적 문의
                        </a>
                        로 안내드립니다.
                      </p>
                    </div>
                  </article>
                </Reveal>
              );
            })}
          </div>
        )}
      </section>

      {/* ---------- 문의 ---------- */}
      <section id="inquiry" className="scroll-mt-28 pt-20 md:pt-28">
        <Reveal>
          <SectionTitle overline="Inquiry" title="견적 문의" className="mb-4" />
        </Reveal>
        <Reveal delay={0.06}>
          <p className="mb-8 max-w-xl text-sm leading-relaxed text-pretty text-ink-500">
            아래 내용을 남겨주시면 담당자가 확인 후 영업일 기준 1–2일 안에 회신드립니다.
            OEM·ODM 생산, 원료 납품, 도매 유통, 샘플 요청 모두 이곳으로 받습니다.
          </p>
        </Reveal>
        <Reveal delay={0.12}>
          <BulkInquiryForm products={options} />
        </Reveal>

        <Reveal delay={0.1} className="mt-10 grid border border-ink-200 md:grid-cols-3">
          <div className="border-b border-ink-200 p-8 md:border-r md:border-b-0">
            <p className="label-caps text-ink-400">Tel</p>
            <a
              href={`tel:${COMPANY.tel.replace(/-/g, "")}`}
              className="krw headline-serif mt-4 block text-2xl text-ink-900 transition-colors hover:text-forest-700"
            >
              {COMPANY.tel}
            </a>
            <p className="krw mt-3 text-sm text-ink-500">{COMPANY.csHours}</p>
          </div>
          <div className="border-b border-ink-200 p-8 md:border-r md:border-b-0">
            <p className="label-caps text-ink-400">Email</p>
            <a href={`mailto:${COMPANY.email}`} className="mt-4 block text-[15px] text-ink-900">
              {COMPANY.email}
            </a>
            <p className="mt-3 text-sm text-ink-500">사양서·견적서 요청도 가능합니다.</p>
          </div>
          <div className="p-8">
            <p className="label-caps text-ink-400">Factory</p>
            <p className="mt-4 text-[15px] leading-relaxed text-ink-900">{COMPANY.address}</p>
            <Link
              href="/about"
              className="group label-caps mt-1 inline-block py-3.5 text-ink-600 transition-colors hover:text-ink-900"
            >
              <span className="relative after:absolute after:left-0 after:-bottom-[3px] after:h-px after:w-full after:origin-right after:scale-x-0 after:bg-current after:transition-transform after:duration-500 after:[transition-timing-function:var(--ease-hall)] group-hover:after:origin-left group-hover:after:scale-x-100">
                회사 소개 보기
              </span>
            </Link>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
