/* ============================================================
   사업자 정보 — 보기 전용 카드

   왜 '보기 전용'인가:
   사업자등록번호·통신판매업신고번호·대표자·주소·팩스는 법으로 표시해야 하는 항목이라
   대표가 직접 고칠 수 있어야 한다는 지적이 있었다. 그런데 이 값들은 지금 고객 화면
   (스토어 하단·회사소개·이용약관·개인정보 처리방침)에 **고정된 값으로 박혀** 있고,
   그 화면들을 바꾸는 일은 이 화면의 소관이 아니다.

   그 상태에서 입력칸만 만들면 '고쳤는데 고객 화면은 그대로'인 함정이 여섯 개 더 늘어난다.
   바로 위 스토어 정보에서 이미 한 번 겪는 일이다. 그래서 지금은 **고객이 실제로 보고 있는
   값이 무엇인지**만 정확히 보여 주고, 바꿀 수 없다는 사실을 숨기지 않는다.
   ============================================================ */

import { COMPANY } from "@/lib/constants";

/** 고객 화면에 법정 표기로 나가는 항목 — 표시 순서는 스토어 하단과 맞춘다 */
const ROWS: { label: string; value: string }[] = [
  { label: "상호", value: COMPANY.name },
  { label: "대표자", value: COMPANY.ceo },
  { label: "사업자등록번호", value: COMPANY.bizNo },
  { label: "통신판매업신고번호", value: COMPANY.mailOrderNo },
  { label: "사업장 주소", value: COMPANY.address },
  { label: "대표 전화", value: COMPANY.tel },
  { label: "팩스", value: COMPANY.fax },
  { label: "이메일", value: COMPANY.email },
  { label: "개인정보 보호책임자", value: COMPANY.privacyOfficer.name },
];

export default function CompanyInfoCard() {
  return (
    <section className="border border-ink-200 bg-cream-50">
      <div className="border-b border-ink-100 px-6 py-5">
        <h2 className="headline-serif text-lg text-ink-900">사업자 정보</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-400">
          고객이 스토어 맨 아래와 회사소개·이용약관에서 보게 되는 값입니다.
        </p>
      </div>

      <div className="flex gap-2.5 border-b border-ink-100 px-6 py-4">
        <span aria-hidden className="mt-1 h-2 w-2 shrink-0 rounded-full bg-ink-300" />
        <p className="text-xs leading-relaxed text-ink-500">
          지금은 고정된 값이라 이 화면에서는 고칠 수 없습니다. 바뀐 내용이 있으면 담당자에게
          알려 주세요. 사업자등록번호·통신판매업신고번호는 법으로 표시해야 하는 항목이라
          실제와 다르면 곧바로 문제가 됩니다.
        </p>
      </div>

      <dl className="divide-y divide-ink-100 px-6">
        {ROWS.map((row) => (
          <div key={row.label} className="flex flex-wrap gap-x-6 gap-y-1 py-3.5">
            <dt className="w-40 shrink-0 text-sm text-ink-500">{row.label}</dt>
            <dd className="krw min-w-0 flex-1 text-sm leading-relaxed text-ink-900">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="border-t border-ink-100 px-6 py-4">
        <a
          href="/about"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-ink-500 underline-offset-4 transition-colors hover:text-forest-700 hover:underline"
        >
          고객 화면에서 확인하기 ↗
        </a>
      </div>
    </section>
  );
}
