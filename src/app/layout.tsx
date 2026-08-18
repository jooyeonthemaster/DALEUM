import type { Metadata, Viewport } from "next";
import { Noto_Serif_KR } from "next/font/google";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";

/**
 * 실제로 렌더되는 세리프 웨이트만 받는다. 웨이트 하나당 @font-face 블록이
 * 한글 unicode-range 청크 수(100+)만큼 생성되고, subsets 로 지정한 latin 파일은
 * 사용 여부와 무관하게 preload 로 즉시 내려받는다 — 안 쓰는 웨이트는 순수 낭비다.
 *
 * 사용처 (2026-08 전수 조사, JSX 중첩까지 추적):
 *   400 — src/app/(shop)/vip/s/[token]/page.tsx:228 `font-serif ... font-normal`
 *   600 — src/app/globals.css:135 `@utility headline-serif { font-weight: 600 }` (약 100곳)
 * 500 / 700 / 900 은 CSS·유틸리티·인라인 스타일 어디에도 참조가 없었고,
 * headline-serif 하위에 굵기를 바꾸는 <b>/<strong>(preflight `bolder`)이나
 * font-* 유틸리티도 없어 제거해도 렌더 결과가 동일하다.
 * → 세리프 텍스트에 새 굵기를 쓰려면 여기 weight 를 먼저 추가해야 한다.
 *
 * subsets: ["latin"] 유지 — Next 의 폰트 매니페스트상 Noto Serif KR 에는
 * "korean" 서브셋 이름 자체가 없다(cyrillic/latin/latin-ext/vietnamese).
 * 게다가 subsets 는 preload 대상만 고르며, 구글에서 받아온 CSS 의 모든 서브셋은
 * 그대로 self-host 된다 — 즉 이 값과 무관하게 한글 글리프는 항상 살아 있다.
 * latin preload 는 `krw headline-serif` 로 세리프 숫자(가격·연도·전화번호)를
 * 찍는 8곳에서 실제로 쓰이므로 그대로 둔다.
 */
const notoSerifKr = Noto_Serif_KR({
  variable: "--font-noto-serif-kr",
  weight: ["400", "600"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "다름 DALEUM — 발효로 완성한 곤약",
    template: "%s — 다름 DALEUM",
  },
  description:
    "곤약 그 이상의 한계를 발효로 완성하다. 국내 최초 효모·유산균 발효곤약, 다름의 프리미엄 저칼로리 식탁.",
  openGraph: {
    title: "다름 DALEUM — 발효로 완성한 곤약",
    description:
      "국내 최초 효모·유산균 발효곤약. HACCP · FSSC 22000 · VEGAN · HALAL 인증 프리미엄 곤약 식품.",
    locale: "ko_KR",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1d372b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${notoSerifKr.variable} h-full`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
