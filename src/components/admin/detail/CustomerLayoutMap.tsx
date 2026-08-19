/* ============================================================
   이 탭에 넣은 내용이 고객 상품 페이지의 '어느 자리'에 실리는지 보여 주는 그림.

   왜 필요한가:
   관리자가 쓴 순서와 고객이 보는 순서가 다르다. 상세페이지에 글과 사진을 번갈아
   넣어도, 고객 화면은 글만 모아 가격 위 구매 영역에 앞 7줄만 접어 보여 주고
   사진은 전부 페이지 한참 아래 「상품 상세」 구역에 편다.
   이 사실이 화면 어디에도 없어서, 대표는 '이미지 → 설명 → 이미지' 배치가
   왜 그대로 안 나오는지 영원히 알 수 없고 같은 시도를 반복하게 된다.
   구조를 바꾸면 운영 중인 상품 27개가 전부 깨지므로, 대신 사실을 그림으로 알린다.
   ============================================================ */

const SECTIONS: { title: string; note: string }[] = [
  { title: "상품 상세", note: "상세페이지에 넣은 사진이 전체 폭으로 펼쳐집니다" },
  { title: "다름이 빚은 이야기", note: "브랜드 스토리" },
  { title: "영양 정보", note: "영양 항목이 두 칸짜리 표로" },
  { title: "상세 정보", note: "상품 스펙이 표로 (보관 방법·원산지·중량 뒤에 이어집니다)" },
];

export default function CustomerLayoutMap() {
  return (
    <div className="border border-ink-200 bg-cream-100 p-4">
      <p className="label-caps text-ink-400">이 탭의 내용이 고객 화면에 실리는 자리</p>

      {/* 첫 화면 — 사진과 구매 영역 */}
      <div className="mt-3 flex gap-3">
        <div
          aria-hidden
          className="flex h-24 w-20 shrink-0 items-center justify-center border border-ink-200 bg-cream-50 text-[10px] text-ink-300"
        >
          상품 사진
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div aria-hidden className="h-2 w-2/5 bg-ink-200" />
          <p className="border border-forest-600 bg-forest-50 px-2 py-1.5 text-[11px] leading-relaxed text-forest-800">
            상세페이지에 넣은 <strong className="font-medium">글</strong>이 여기 요약으로 실립니다 —
            앞 7줄만 보이고 나머지는 「자세히 보기」로 접힙니다.
          </p>
          <div aria-hidden className="h-2 w-1/4 bg-ink-200" />
        </div>
      </div>

      {/* 아래로 이어지는 구역들 */}
      <ul className="mt-3 space-y-1">
        {SECTIONS.map((section) => (
          <li
            key={section.title}
            className="flex flex-wrap items-baseline gap-x-2 border-t border-ink-200 pt-1.5 text-[11px] leading-relaxed text-ink-500"
          >
            <span className="font-medium text-ink-700">「{section.title}」</span>
            {section.note}
          </li>
        ))}
      </ul>
    </div>
  );
}
