import Reveal from "@/components/shop/Reveal";

interface ContrastRow {
  no: string;
  theme: string;
  limit: string;
  overcome: string;
}

const ROWS: ContrastRow[] = [
  {
    no: "01",
    theme: "냄새",
    limit:
      "특유의 비릿한 곤약 냄새. 아무리 헹구고 데쳐도 요리 끝까지 따라옵니다.",
    overcome:
      "효모와 유산균이 냄새의 원인 물질을 발효 과정에서 분해합니다. 데치지 않고 바로 조리해도 잡내가 없습니다.",
  },
  {
    no: "02",
    theme: "식감",
    limit: "탱글하지만 겉도는, 뚝뚝 끊기는 고무 같은 식감.",
    overcome:
      "발효 숙성으로 조직이 치밀해져 진짜 면처럼 탄력 있고 쫄깃합니다. 젓가락 끝에서 차이가 느껴집니다.",
  },
  {
    no: "03",
    theme: "열",
    limit: "오래 끓이면 부풀고 물러져 국물 요리에 쓰기 어렵습니다.",
    overcome:
      "고온에서도 형태와 탄력을 유지합니다. 라면과 전골처럼 팔팔 끓이는 요리에도 마지막 한 젓가락까지.",
  },
  {
    no: "04",
    theme: "냉동",
    limit: "얼리면 수분이 빠져나가 스펀지처럼 변해 냉동 유통이 불가능합니다.",
    overcome:
      "냉동 후 해동해도 본래의 식감으로 돌아옵니다. 냉동 간편식 OEM이 가능한 이유입니다.",
  },
  {
    no: "05",
    theme: "산",
    limit: "산성 소스와 만나면 녹거나 풀어져 비빔 요리에 쓸 수 없습니다.",
    overcome:
      "산에 강한 안정된 조직으로 완성했습니다. 새콤한 비빔장부터 샐러드 드레싱까지 자유롭게.",
  },
];

/**
 * 일반 곤약의 5가지 한계 vs 발효곤약의 극복 — 2열 대비 레이아웃.
 * 세리프 넘버링(01~05) + 헤어라인 행 구분. (서버 컴포넌트)
 */
export default function FermentContrast({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      {/* 데스크톱 컬럼 헤더 */}
      <div className="hidden gap-10 pb-5 md:grid md:grid-cols-[7rem_1fr_1fr]">
        <span aria-hidden />
        <p className="label-caps text-ink-400">일반 곤약의 한계</p>
        <p className="label-caps text-forest-600">다름 발효곤약의 극복</p>
      </div>

      <ul>
        {ROWS.map((row, i) => (
          <Reveal
            key={row.no}
            as="li"
            delay={i * 0.05}
            className="hairline-t grid gap-5 py-8 md:grid-cols-[7rem_1fr_1fr] md:gap-10 md:py-10"
          >
            <div className="flex items-baseline gap-4 md:block">
              <span className="krw headline-serif text-3xl leading-none text-ink-300 md:text-4xl">
                {row.no}
              </span>
              <span className="label-caps text-forest-600 md:mt-3.5 md:block">
                {row.theme}
              </span>
            </div>

            <div>
              <p className="label-caps mb-2 text-ink-400 md:hidden">일반 곤약</p>
              <p className="max-w-md text-[15px] leading-relaxed text-ink-500">
                {row.limit}
              </p>
            </div>

            <div>
              <p className="label-caps mb-2 text-forest-600 md:hidden">
                다름 발효곤약
              </p>
              <p className="max-w-md text-[15px] font-medium leading-relaxed text-ink-900">
                {row.overcome}
              </p>
            </div>
          </Reveal>
        ))}
      </ul>
    </div>
  );
}
