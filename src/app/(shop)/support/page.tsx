import type { Metadata } from "next";
import Link from "next/link";
import Reveal from "@/components/shop/Reveal";
import RevealText from "@/components/shop/RevealText";
import SectionTitle from "@/components/shop/SectionTitle";
import Accordion, { type AccordionItem } from "@/components/about/Accordion";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { COMPANY } from "@/lib/constants";
import type { Notice } from "@/lib/types";

export const metadata: Metadata = {
  title: "고객센터",
  description:
    "다름 고객센터 — 공지사항, 자주 묻는 질문, 배송·교환·반품 안내와 상담 연락처를 확인하세요.",
};

/* ---------- 자주 묻는 질문 (정적 8문항) ---------- */

const FAQS: AccordionItem[] = [
  {
    id: "faq-shipping-when",
    overline: "배송",
    title: "주문하면 언제 받아볼 수 있나요?",
    content: (
      <div className="space-y-3">
        <p>
          평일 오후 2시까지 결제가 완료된 주문은 당일 출고되며, 출고 후
          1~2일 안에 도착합니다. 오후 2시 이후 주문은 다음 영업일에
          출고됩니다.
        </p>
        <p>
          냉장·냉동 상품은 배송 중 품질을 지키기 위해 주말과 공휴일 직전에는
          출고하지 않습니다. 금요일 오후 이후의 주문은 월요일에 순차
          출고됩니다. 도서·산간 지역은 1~2일 더 걸릴 수 있습니다.
        </p>
      </div>
    ),
  },
  {
    id: "faq-shipping-fee",
    overline: "배송",
    title: "배송비는 얼마인가요?",
    content: (
      <div className="space-y-3">
        <p>
          기본 배송비는 3,500원이며, 40,000원 이상 주문 시 무료입니다.
          도서·산간 지역은 추가 배송비가 있습니다.
        </p>
        <p>
          냉장·냉동 상품은 보냉 포장과 아이스팩이 기본으로 포함되며, 별도
          비용을 받지 않습니다.
        </p>
      </div>
    ),
  },
  {
    id: "faq-return-simple",
    overline: "교환·반품",
    title: "단순 변심으로 교환·반품이 가능한가요?",
    content: (
      <div className="space-y-3">
        <p>
          냉장·냉동 식품은 재판매가 불가능한 신선식품 특성상, 단순 변심에
          의한 교환·반품이 어렵습니다. 주문 전에 상품 정보와 보관 방법을
          꼭 확인해 주세요.
        </p>
        <p>
          실온 상품은 미개봉 상태에 한해 수령 후 7일 이내 교환·반품이
          가능하며, 이때 왕복 배송비는 고객님 부담입니다. 아직 출고되지 않은
          주문은 마이페이지 또는 고객센터를 통해 즉시 취소할 수 있습니다.
        </p>
      </div>
    ),
  },
  {
    id: "faq-return-defect",
    overline: "교환·반품",
    title: "받은 상품에 문제가 있으면 어떻게 하나요?",
    content: (
      <div className="space-y-3">
        <p>
          파손, 변질, 오배송 등 상품에 문제가 있는 경우 신선식품 특성상
          수령 후 24시간 이내에 사진과 함께 고객센터 전화 또는 이메일로
          접수해 주세요.
        </p>
        <p>
          확인 즉시 재배송 또는 환불로 처리해 드리며, 이 경우 배송비는 전액
          다름이 부담합니다.
        </p>
      </div>
    ),
  },
  {
    id: "faq-storage",
    overline: "보관",
    title: "발효곤약 제품은 어떻게 보관하나요?",
    content: (
      <div className="space-y-3">
        <p>
          상품마다 실온·냉장·냉동 보관 기준이 다르므로, 상품 상세와 포장의
          표기를 따라 주세요. 실온 상품도 직사광선이 없는 서늘한 곳에 두시면
          더 좋습니다.
        </p>
        <p>
          개봉 후에는 남은 곤약을 깨끗한 물과 함께 밀폐 용기에 담아 냉장
          보관하고 2~3일 안에 드시길 권합니다. 다름의 발효곤약은 일반 곤약과
          달리 냉동 보관도 가능하며, 해동 후에도 식감이 그대로 살아납니다.
        </p>
      </div>
    ),
  },
  {
    id: "faq-cooking",
    overline: "조리",
    title: "곤약면은 어떻게 조리하면 맛있나요?",
    content: (
      <div className="space-y-3">
        <p>
          발효곤약은 특유의 곤약 냄새가 없어 데치지 않아도 됩니다. 흐르는
          물에 가볍게 헹군 뒤 바로 요리에 넣으세요. 끓는 물에 30초만 데치면
          탄력이 한층 살아납니다.
        </p>
        <p>
          비빔·볶음 요리는 물기를 충분히 털어낸 뒤 조리하면 양념이 잘
          배어들고, 라면·전골에는 마지막에 넣지 않고 처음부터 함께 끓여도
          퍼지지 않습니다.
        </p>
      </div>
    ),
  },
  {
    id: "faq-guest-order",
    overline: "주문·결제",
    title: "비회원도 주문할 수 있나요?",
    content: (
      <div className="space-y-3">
        <p>
          네, 회원 가입 없이 주문하실 수 있습니다. 비회원 주문의 확인·취소가
          필요하시면 주문번호와 주문 시 입력한 연락처로 고객센터에 문의해
          주세요.
        </p>
        <p>
          회원으로 주문하시면 마이페이지에서 주문 조회, 배송 추적, 리뷰
          작성까지 한 번에 이용하실 수 있습니다.
        </p>
      </div>
    ),
  },
  {
    id: "faq-vip",
    overline: "VIP",
    title: "VIP 라운지는 어떻게 이용하나요?",
    content: (
      <div className="space-y-3">
        <p>
          VIP 라운지는 초대 코드를 받으신 고객님 전용 공간으로, 전용 혜택가로
          상품을 만나보실 수 있습니다. 코드를 받으셨다면{" "}
          <Link href="/vip" className="text-forest-700 underline underline-offset-4">
            VIP 라운지
          </Link>
          에서 입력해 주세요.
        </p>
        <p>
          초대는 구매 이력과 다름과의 인연을 바탕으로 순차적으로 안내드리고
          있으며, 관련 문의는 고객센터로 부탁드립니다.
        </p>
      </div>
    ),
  },
];

const SECTION_NAV = [
  { href: "#notices", label: "공지사항" },
  { href: "#faq", label: "자주 묻는 질문" },
  { href: "#contact", label: "고객센터" },
];

export default async function SupportPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notices")
    .select("*")
    .eq("is_active", true)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(30);

  const notices = (data ?? []) as Notice[];

  const noticeItems: AccordionItem[] = notices.map((notice) => ({
    id: notice.id,
    overline: notice.is_pinned ? "고정" : "공지",
    title: notice.title,
    meta: formatDate(notice.created_at),
    content: <div className="whitespace-pre-line">{notice.content}</div>,
  }));

  return (
    <div className="container-hall pb-24 md:pb-36">
      {/* ---------- 헤더 ---------- */}
      <div className="py-16 text-center md:py-24">
        <Reveal>
          <p className="label-caps text-forest-600">Customer Support</p>
        </Reveal>
        <RevealText
          as="h1"
          text="무엇을 도와드릴까요"
          delay={0.1}
          className="headline-serif mt-6 block text-3xl text-ink-900 md:text-[2.75rem]"
        />
        <Reveal delay={0.3}>
          <p className="mx-auto mt-6 max-w-md text-[15px] leading-relaxed text-pretty text-ink-500">
            공지사항과 자주 묻는 질문을 먼저 확인해 보세요.
            찾는 답이 없다면 언제든 연락 주시면 됩니다.
          </p>
        </Reveal>
      </div>

      {/* ---------- 섹션 내비 ---------- */}
      <div className="relative">
        <Reveal variant="rule" className="absolute inset-x-0 top-0 h-px bg-ink-200" />
        <Reveal variant="rule" delay={0.12} className="absolute inset-x-0 bottom-0 h-px bg-ink-200" />
        <Reveal delay={0.15}>
          <nav aria-label="고객센터 섹션">
            <ul className="flex items-center justify-center gap-8 py-1.5 md:gap-14">
              {SECTION_NAV.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="group label-caps inline-block py-4 text-ink-600 transition-colors hover:text-ink-900"
                  >
                    <span className="relative after:absolute after:left-0 after:-bottom-[3px] after:h-px after:w-full after:origin-right after:scale-x-0 after:bg-current after:transition-transform after:duration-500 after:[transition-timing-function:var(--ease-hall)] group-hover:after:origin-left group-hover:after:scale-x-100">
                      {item.label}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </Reveal>
      </div>

      {/* ---------- 공지사항 ---------- */}
      <section id="notices" className="scroll-mt-28 pt-20 md:pt-28">
        <Reveal>
          <SectionTitle overline="Notice" title="공지사항" className="mb-10" />
        </Reveal>
        <Reveal delay={0.08}>
          {noticeItems.length > 0 ? (
            <Accordion items={noticeItems} />
          ) : (
            <div className="relative py-16 text-center md:py-20">
              <Reveal variant="rule" className="absolute inset-x-0 top-0 h-px bg-ink-200" />
              <Reveal variant="rule" delay={0.1} className="absolute inset-x-0 bottom-0 h-px bg-ink-200" />
              <p className="label-caps text-ink-400">Notice</p>
              <p className="headline-serif mt-5 text-lg text-ink-900 md:text-xl">
                등록된 공지사항이 아직 없습니다.
              </p>
              <p className="mt-3 text-sm text-pretty text-ink-500">
                새로운 소식이 생기면 이곳에서 가장 먼저 알려드립니다.
              </p>
              <a
                href="#faq"
                className="group label-caps mt-4 inline-block py-3.5 text-ink-600 transition-colors hover:text-ink-900"
              >
                <span className="relative after:absolute after:left-0 after:-bottom-[3px] after:h-px after:w-full after:origin-right after:scale-x-0 after:bg-current after:transition-transform after:duration-500 after:[transition-timing-function:var(--ease-hall)] group-hover:after:origin-left group-hover:after:scale-x-100">
                  자주 묻는 질문 보기
                </span>
              </a>
            </div>
          )}
        </Reveal>
      </section>

      {/* ---------- 자주 묻는 질문 ---------- */}
      <section id="faq" className="scroll-mt-28 pt-20 md:pt-28">
        <Reveal>
          <SectionTitle overline="FAQ" title="자주 묻는 질문" className="mb-10" />
        </Reveal>
        <Reveal delay={0.08}>
          <Accordion items={FAQS} />
        </Reveal>
      </section>

      {/* ---------- 고객센터 ---------- */}
      <section id="contact" className="scroll-mt-28 pt-20 md:pt-28">
        <Reveal>
          <SectionTitle overline="Contact" title="고객센터" className="mb-10" />
        </Reveal>

        <div className="grid border border-ink-200 md:grid-cols-3">
          <Reveal delay={0.05} className="border-b border-ink-200 p-8 md:border-r md:border-b-0 md:p-10">
            <p className="label-caps text-ink-400">Tel</p>
            <a
              href={`tel:${COMPANY.tel.replace(/-/g, "")}`}
              className="krw headline-serif mt-5 block text-2xl text-ink-900 transition-colors hover:text-forest-700 md:text-3xl"
            >
              {COMPANY.tel}
            </a>
            <p className="krw mt-4 text-sm leading-relaxed text-ink-500">
              {COMPANY.csHours}
            </p>
          </Reveal>

          <Reveal delay={0.13} className="border-b border-ink-200 p-8 md:border-r md:border-b-0 md:p-10">
            <p className="label-caps text-ink-400">Email</p>
            <a
              href={`mailto:${COMPANY.email}`}
              className="group mt-2 inline-block py-3 text-[15px] text-ink-900"
            >
              <span className="relative after:absolute after:left-0 after:-bottom-[3px] after:h-px after:w-full after:origin-right after:scale-x-0 after:bg-current after:transition-transform after:duration-500 after:[transition-timing-function:var(--ease-hall)] group-hover:after:origin-left group-hover:after:scale-x-100">
                {COMPANY.email}
              </span>
            </a>
            <p className="mt-4 text-sm leading-relaxed text-pretty text-ink-500">
              교환·반품 접수는 상품 사진을 함께 보내주시면 더 빠르게
              처리됩니다.
            </p>
          </Reveal>

          <Reveal delay={0.21} className="p-8 md:p-10">
            <p className="label-caps text-ink-400">Office</p>
            <p className="mt-5 text-[15px] leading-relaxed text-ink-900">
              {COMPANY.address}
            </p>
            <Link
              href="/about"
              className="group label-caps mt-1 inline-block py-3.5 text-ink-600 transition-colors hover:text-ink-900"
            >
              <span className="relative after:absolute after:left-0 after:-bottom-[3px] after:h-px after:w-full after:origin-right after:scale-x-0 after:bg-current after:transition-transform after:duration-500 after:[transition-timing-function:var(--ease-hall)] group-hover:after:origin-left group-hover:after:scale-x-100">
                오시는 길 보기
              </span>
            </Link>
          </Reveal>
        </div>

        <Reveal variant="zoom" delay={0.1} className="mt-10 bg-cream-100 px-6 py-10 text-center md:py-12">
          <p className="headline-serif text-lg text-ink-900 md:text-xl">
            상담 시간이 지났나요?
          </p>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-500">
            이메일로 문의를 남겨주시면 다음 영업일에 순서대로
            답변드립니다. 주문 관련 문의는 주문번호를 함께 적어주세요.
          </p>
        </Reveal>
      </section>
    </div>
  );
}
