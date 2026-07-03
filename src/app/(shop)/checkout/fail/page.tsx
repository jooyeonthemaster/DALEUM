import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY } from "@/lib/constants";
import Reveal from "@/components/shop/Reveal";

export const metadata: Metadata = {
  title: "결제 실패",
  robots: { index: false },
};

/** 토스 에러 코드 → 다듬은 한국어 안내 (그 외는 토스 message 그대로) */
const FAIL_MESSAGES: Record<string, string> = {
  PAY_PROCESS_CANCELED: "결제를 취소하셨습니다.",
  PAY_PROCESS_ABORTED: "결제가 정상적으로 진행되지 않아 중단되었습니다.",
  REJECT_CARD_COMPANY: "카드사에서 결제를 거절했습니다. 카드 정보를 확인해 주세요.",
  INVALID_CARD_EXPIRATION: "카드 유효기간 정보가 올바르지 않습니다.",
  EXCEED_MAX_DAILY_PAYMENT_COUNT: "하루 결제 가능 횟수를 초과했습니다.",
  NOT_SUPPORTED_INSTALLMENT_PLAN_CARD_OR_MERCHANT: "지원하지 않는 할부 개월 수입니다.",
};

interface FailSearchParams {
  code?: string;
  message?: string;
  orderId?: string;
}

/**
 * 결제 실패/이탈 리다이렉트 — 사유를 보여주고 장바구니로 안내.
 * pending 주문은 재고를 차감하지 않으므로 별도 정리가 필요 없다.
 */
export default async function CheckoutFailPage({
  searchParams,
}: {
  searchParams: Promise<FailSearchParams>;
}) {
  const { code, message } = await searchParams;
  const reason =
    (code && FAIL_MESSAGES[code]) ||
    message ||
    "결제 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.";

  return (
    <div className="container-hall flex flex-1 flex-col items-center py-20 text-center md:py-28">
      <Reveal variant="fade" className="flex flex-col items-center">
        <span className="mb-8 block h-10 w-px bg-ink-200" aria-hidden />
        <p className="label-caps text-ink-400">Payment Failed</p>
        <h1 className="headline-serif mt-4 max-w-md text-balance text-2xl text-ink-900 md:text-3xl">
          결제를 완료하지 못했습니다.
        </h1>
        <p className="mt-5 max-w-md text-balance text-sm leading-relaxed text-ink-600">
          {reason}
        </p>
        {code && <p className="label-caps mt-3 text-[10px] text-ink-300">{code}</p>}
      </Reveal>

      <Reveal
        as="p"
        variant="fade"
        delay={0.12}
        className="mt-8 max-w-md text-xs leading-relaxed text-ink-400"
      >
        장바구니에 담아두신 상품은 그대로 남아 있습니다.
        <br />
        같은 문제가 반복되면 고객센터({COMPANY.tel})로 문의해 주세요.
      </Reveal>

      <Reveal
        variant="fade"
        delay={0.2}
        className="mt-12 flex flex-col items-center gap-3 sm:flex-row"
      >
        <Link
          href="/checkout"
          className="label-caps inline-block bg-ink-900 px-9 py-3.5 text-cream-50 transition-colors duration-500 hover:bg-forest-800"
        >
          다시 결제하기
        </Link>
        <Link
          href="/cart"
          className="label-caps inline-block border border-ink-900 px-9 py-3.5 text-ink-900 transition-colors duration-500 hover:bg-ink-900 hover:text-cream-50"
        >
          장바구니로 가기
        </Link>
      </Reveal>
    </div>
  );
}
