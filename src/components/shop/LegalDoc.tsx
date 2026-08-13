import type { ReactNode } from "react";
import Reveal from "@/components/shop/Reveal";
import RevealText from "@/components/shop/RevealText";

export interface LegalArticle {
  /** 앵커 id — 목차 링크 대상 */
  id: string;
  /** 조문 제목 — 예: "제1조 (목적)" */
  title: string;
  body: ReactNode;
}

/** 위탁·보유기간 등 표 형식 고지 */
export function LegalTable({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="my-6 overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse text-left text-[13px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-y border-ink-300">
            {head.map((cell) => (
              <th
                key={cell}
                scope="col"
                className="label-caps px-3 py-3 font-normal text-ink-500"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-ink-200 align-top">
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className="px-3 py-3.5 leading-relaxed text-ink-700"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 법적 고지 문서 공용 레이아웃 — 이용약관 / 개인정보 처리방침 */
export default function LegalDoc({
  overline,
  title,
  lead,
  effectiveDate,
  articles,
}: {
  overline: string;
  title: string;
  lead: string;
  /** 시행일 — 예: "2026년 8월 13일" */
  effectiveDate: string;
  articles: LegalArticle[];
}) {
  return (
    <div className="container-hall pb-24 md:pb-36">
      {/* ---------- 헤더 ---------- */}
      <div className="py-16 md:py-24">
        <Reveal>
          <p className="label-caps text-forest-600">{overline}</p>
        </Reveal>
        <RevealText
          as="h1"
          text={title}
          delay={0.1}
          className="headline-serif mt-6 block text-3xl text-ink-900 md:text-[2.75rem]"
        />
        <Reveal delay={0.3}>
          <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-pretty text-ink-500">
            {lead}
          </p>
          <p className="krw label-caps mt-8 text-ink-400">
            시행일 {effectiveDate}
          </p>
        </Reveal>
      </div>

      {/* minmax(0,·) — auto 트랙이 표의 max-content 로 부풀어 페이지가 가로로 밀리는 것 방지 */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-14 md:grid-cols-[15rem_minmax(0,1fr)] md:gap-16">
        {/* ---------- 목차 ---------- */}
        <nav aria-label="목차" className="min-w-0 md:sticky md:top-28 md:self-start">
          <p className="label-caps border-b border-ink-200 pb-3 text-ink-400">
            Index
          </p>
          <ol className="mt-5 space-y-2.5 text-[13px] leading-snug">
            {articles.map((article) => (
              <li key={article.id}>
                <a
                  href={`#${article.id}`}
                  className="link-line text-ink-500 transition-colors hover:text-ink-900"
                >
                  {article.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* ---------- 본문 ---------- */}
        {/* min-w-0 — 그리드 자식의 기본 min-width:auto 로 표가 페이지를 밀어내는 것 방지 */}
        <div className="min-w-0">
          {articles.map((article, index) => (
            <section
              key={article.id}
              id={article.id}
              className={`scroll-mt-28 ${index > 0 ? "mt-14 border-t border-ink-200 pt-14" : ""}`}
            >
              <h2 className="headline-serif text-xl text-ink-900 md:text-2xl">
                {article.title}
              </h2>
              <div className="mt-6 space-y-3.5 text-[14px] leading-[1.85] text-ink-600 [&_a]:underline [&_a]:underline-offset-2 [&_li]:mt-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-normal [&_strong]:text-ink-900 [&_ul]:list-disc [&_ul]:pl-5 [&_ol_ol]:list-[lower-alpha] [&_ol]:marker:text-ink-400 [&_ul]:marker:text-ink-400">
                {article.body}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
