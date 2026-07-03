import type { Metadata, Viewport } from "next";
import { Noto_Serif_KR } from "next/font/google";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";

const notoSerifKr = Noto_Serif_KR({
  variable: "--font-noto-serif-kr",
  weight: ["400", "500", "600", "700", "900"],
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
