"use client";

/* ============================================================
   고객 상세 우측 패널 — 프로필 / VIP / 배송지
   (메모는 저장 규칙이 따로 있어 CustomerMemoCard 로 뺐다)
   ============================================================ */

import Link from "next/link";
import { formatDate, formatPhone } from "@/lib/format";
import { Section, type AddressRow, type CustomerDetail, type VipInfo } from "./customer-detail-ui";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-ink-400">{label}</dt>
      <dd className="text-right text-ink-900">{value}</dd>
    </div>
  );
}

export function ProfilePanel({ customer }: { customer: CustomerDetail }) {
  return (
    <Section title="프로필">
      <dl className="space-y-2.5 text-sm">
        <Row label="이메일" value={customer.email ?? "—"} />
        <Row
          label="연락처"
          value={
            customer.phone ? (
              <span className="krw">{formatPhone(customer.phone)}</span>
            ) : (
              "—"
            )
          }
        />
        <Row label="가입일" value={<span className="krw">{formatDate(customer.created_at)}</span>} />
        <Row
          label="마케팅 수신"
          value={customer.marketing_opt_in ? "동의함" : "동의하지 않음"}
        />
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-ink-400">
        마케팅 수신에 동의하지 않은 고객에게는 광고성 문자·메일을 보낼 수 없습니다.
      </p>
    </Section>
  );
}

export function VipPanel({ vip }: { vip: VipInfo | null }) {
  return (
    <Section
      title="VIP"
      action={
        <Link href="/admin/vip" className="link-line text-xs text-forest-700">
          VIP 관리
        </Link>
      }
    >
      {vip ? (
        <dl className="space-y-2.5 text-sm">
          <Row
            label="그룹"
            value={<span className="font-medium text-brass-700">{vip.group_name}</span>}
          />
          <Row
            label="그룹 할인율"
            value={<span className="krw">{vip.discount_rate}%</span>}
          />
          <Row
            label="개별 지정가"
            value={
              <span className="krw">
                {vip.custom_price_count > 0 ? `${vip.custom_price_count}건` : "없음"}
              </span>
            }
          />
          {vip.note && <p className="pt-1 text-xs text-ink-500">{vip.note}</p>}
        </dl>
      ) : (
        <p className="text-sm text-ink-400">VIP 멤버십이 없습니다.</p>
      )}
    </Section>
  );
}

export function AddressPanel({ addresses }: { addresses: AddressRow[] }) {
  return (
    <Section title="배송지">
      {addresses.length === 0 ? (
        <p className="text-sm text-ink-400">등록된 배송지가 없습니다.</p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {addresses.map((a) => (
            <li key={a.id} className="py-3.5 first:pt-0 last:pb-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-ink-900">{a.label}</span>
                {a.is_default && (
                  <span className="rounded-full bg-forest-100 px-2 py-0.5 text-[11px] text-forest-700">
                    기본
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-ink-600">
                {a.recipient} · <span className="krw">{formatPhone(a.phone)}</span>
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink-500">
                ({a.postcode}) {a.address1}
                {a.address2 && ` ${a.address2}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
