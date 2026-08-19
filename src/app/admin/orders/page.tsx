import type { Metadata } from "next";
import OrdersClient from "./OrdersClient";
import { isOrderTab } from "./orders-list";

export const metadata: Metadata = { title: "주문 관리" };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/**
 * 탭·검색어·기간을 주소로 받는다.
 * 대시보드가 "결제 대기 8건" 을 보여 주고 주문 관리로 보내는데, 정작 그 8건만 골라 볼
 * 방법이 없었다. 주소에 조건을 실을 수 있어야 화면 사이를 오가도 조건이 유지된다.
 * (useSearchParams 대신 서버에서 읽어 넘긴다 — 클라이언트 훅은 Suspense 경계를 요구한다)
 */
export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tab = first(sp.tab);
  const from = first(sp.from);
  const to = first(sp.to);

  return (
    <OrdersClient
      initialTab={isOrderTab(tab) ? tab : "all"}
      initialSearch={first(sp.q).slice(0, 50)}
      initialFrom={DATE_RE.test(from) ? from : ""}
      initialTo={DATE_RE.test(to) ? to : ""}
    />
  );
}
