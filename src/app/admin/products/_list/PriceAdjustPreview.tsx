"use client";

/* ============================================================
   가격 일괄 조정 — 적용 전후 미리보기.

   모달에서 떼어 낸 조각이다(모달이 400줄을 넘겼다).

   휴대폰에서 표를 그대로 쓰지 않는 이유:
   예전에는 화면 크기와 상관없이 높이 18rem 짜리 스크롤 상자 안에 3열 표를 넣었다.
   좁은 화면에서는 모달 자체도 스크롤되기 때문에 **스크롤 상자가 두 겹**이 되어,
   손가락을 어디에 올리느냐에 따라 안쪽이 움직이기도 하고 모달이 움직이기도 했다.
   상품명은 두 글자쯤 남기고 잘렸다. 그래서 좁은 화면에서는 스크롤을 모달 하나로 합치고
   한 상품을 두 줄 카드(상품명 / 지금 → 바뀔 값)로 편다.
   ============================================================ */

import { krw } from "@/lib/format";
import type { PricePreviewRow } from "./price-preview";

/** 바뀔 값 칸 — 표와 카드가 같은 문장을 써야 해서 한 곳에서 만든다 */
function AfterValue({ row }: { row: PricePreviewRow }) {
  if (row.skip) return <span className="text-xs text-ink-400">{row.skip}</span>;
  if (row.blocked) return <span className="text-xs text-signal-red">판매중이라 0원 불가</span>;

  const delta = row.before !== null && row.after !== null ? row.after - row.before : null;

  return (
    <>
      <span className="krw font-medium text-ink-900">{krw(row.after ?? 0)}원</span>
      {delta !== null && (
        // 증감액에 단위가 없어 "+1,600" 이 1,600원인지 16%인지 읽는 사람이 판단해야 했다
        <span
          className={`krw ml-1.5 text-xs ${delta >= 0 ? "text-forest-700" : "text-signal-amber"}`}
        >
          {delta >= 0 ? "+" : "−"}
          {krw(Math.abs(delta))}원
        </span>
      )}
      {row.margin !== null && (
        <span
          className={`krw ml-1.5 text-xs ${row.margin < 0 ? "text-signal-red" : "text-ink-400"}`}
        >
          마진 {row.margin}%
        </span>
      )}
      {row.overCompare && row.compareAt !== null && (
        <span className="krw mt-0.5 block text-xs text-signal-amber">
          정가 {krw(row.compareAt)}원보다 비싸집니다
        </span>
      )}
      {row.surchargedVariants > 0 && (
        <span className="mt-0.5 block text-xs text-signal-red">
          추가 금액이 붙은 옵션 {row.surchargedVariants}개는 그대로입니다
        </span>
      )}
    </>
  );
}

export default function PriceAdjustPreview({ rows }: { rows: PricePreviewRow[] }) {
  return (
    <>
      {/* ---------- 넓은 화면: 표 ---------- */}
      <div className="hidden max-h-72 overflow-y-auto border border-ink-200 md:block">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-cream-100">
            <tr className="hairline-b">
              <th scope="col" className="px-3 py-2 text-left text-xs text-ink-500">
                상품
              </th>
              <th scope="col" className="px-3 py-2 text-right text-xs text-ink-500">
                지금
              </th>
              <th scope="col" className="px-3 py-2 text-right text-xs text-ink-500">
                바뀔 값
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className={`border-b border-ink-100 last:border-b-0 ${
                  r.blocked ? "bg-signal-red/5" : ""
                }`}
              >
                <td className="px-3 py-2 text-ink-900">
                  <span className="line-clamp-2">{r.name}</span>
                </td>
                <td className="krw whitespace-nowrap px-3 py-2 text-right text-ink-500">
                  {r.before === null ? "—" : `${krw(r.before)}원`}
                </td>
                <td className="px-3 py-2 text-right">
                  <AfterValue row={r} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---------- 좁은 화면: 두 줄 카드 (모달 스크롤 하나만 쓴다) ---------- */}
      <ul className="border border-ink-200 md:hidden">
        {rows.map((r) => (
          <li
            key={r.id}
            className={`border-b border-ink-100 px-3 py-2.5 last:border-b-0 ${
              r.blocked ? "bg-signal-red/5" : ""
            }`}
          >
            <p className="text-sm leading-snug text-ink-900">{r.name}</p>
            <p className="mt-1 text-sm">
              <span className="krw text-ink-500">
                {r.before === null ? "—" : `${krw(r.before)}원`}
              </span>
              <span className="mx-1.5 text-ink-300">→</span>
              <AfterValue row={r} />
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
