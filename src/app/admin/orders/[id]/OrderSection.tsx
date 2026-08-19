import type { ReactNode } from "react";

/**
 * 주문 상세의 카드 한 칸.
 * 머리글에 label-caps(대문자 변환) 대신 자간만 주는 스타일을 쓴다 —
 * 한글에 uppercase 는 아무 일도 하지 않으면서 영문 머리글만 대문자로 튀게 만든다.
 */
export default function OrderSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border border-ink-200 bg-cream-50">
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 hairline-b">
        <h2 className="text-[13px] font-semibold tracking-wide text-ink-500">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}
