import Link from "next/link";
import { COMPANY } from "@/lib/constants";

const LEGAL_NAV = [
  { href: "/terms", label: "이용약관", emphasis: false },
  { href: "/privacy", label: "개인정보 처리방침", emphasis: true },
  { href: "/support#contact", label: "고객센터", emphasis: false },
];

const FOOTER_NAV = [
  { href: "/products", label: "전체상품" },
  { href: "/about", label: "브랜드스토리" },
  { href: "/support", label: "고객센터" },
  { href: "/vip", label: "VIP 라운지" },
];

/** 스토어프론트 다크 푸터 — forest-950, 격조있는 마무리 */
export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-forest-950 text-cream-200">
      <div className="container-hall grid gap-14 py-16 md:grid-cols-[1.5fr_1fr_1.1fr] md:gap-10 md:py-24">
        {/* 브랜드 */}
        <div>
          <p className="flex items-baseline gap-2.5">
            <span className="headline-serif text-2xl text-cream-50">다름</span>
            <span className="label-caps text-forest-300">Daleum</span>
          </p>
          <p className="mt-5 max-w-xs text-sm leading-relaxed text-forest-200">
            {COMPANY.slogan}
          </p>
          <ul className="mt-9 flex max-w-sm flex-wrap gap-x-5 gap-y-2.5">
            {COMPANY.certifications.map((cert) => (
              <li key={cert} className="label-caps text-forest-400">
                {cert}
              </li>
            ))}
          </ul>
        </div>

        {/* 바로가기 */}
        <nav aria-label="푸터 메뉴">
          <p className="label-caps text-forest-400">Shop</p>
          <ul className="mt-6 space-y-3.5 text-sm">
            {FOOTER_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="link-line text-cream-200 transition-colors hover:text-cream-50"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* 고객센터 */}
        <div>
          <p className="label-caps text-forest-400">Customer Care</p>
          <p className="krw headline-serif mt-5 text-2xl text-cream-50">{COMPANY.tel}</p>
          <p className="mt-3 text-sm leading-relaxed text-forest-200">{COMPANY.csHours}</p>
          <p className="mt-5 text-sm text-forest-300">{COMPANY.email}</p>
        </div>
      </div>

      {/* 하단 법적 표기 */}
      <div className="border-t border-forest-800">
        <div className="container-hall py-8">
          {/* 정책 링크 — 전자상거래법 표시의무 */}
          <ul className="mb-7 flex flex-wrap items-center gap-x-6 gap-y-2.5 text-xs">
            {LEGAL_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`link-line transition-colors hover:text-cream-50 ${
                    item.emphasis ? "text-cream-100" : "text-forest-300"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1.5 text-xs leading-relaxed text-forest-400">
            <p>
              {COMPANY.name}({COMPANY.nameEn}) · 대표 {COMPANY.ceo} · 사업자등록번호{" "}
              <span className="krw">{COMPANY.bizNo}</span>
              <a
                href={COMPANY.bizInfoUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="link-line ml-2 text-forest-300 transition-colors hover:text-cream-200"
              >
                사업자정보 확인
              </a>
            </p>
            <p>
              통신판매업신고번호 <span className="krw">{COMPANY.mailOrderNo}</span>
            </p>
            <p>{COMPANY.address}</p>
            <p>
              전화 <span className="krw">{COMPANY.tel}</span> · 팩스{" "}
              <span className="krw">{COMPANY.fax}</span> · {COMPANY.email}
            </p>
            <p>
              개인정보 보호책임자 {COMPANY.privacyOfficer.name} · 호스팅 제공자
              Vercel, Inc.
            </p>
          </div>
          <p className="label-caps text-forest-500">
            © {year} Daleum Co., Ltd. All Rights Reserved.
          </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
