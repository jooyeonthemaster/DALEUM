/** 토스페이먼츠 서버 API 래퍼 */

const TOSS_API = "https://api.tosspayments.com/v1";

function authHeader(): string {
  const secret = process.env.TOSS_SECRET_KEY ?? "";
  return `Basic ${Buffer.from(`${secret}:`).toString("base64")}`;
}

export interface TossPayment {
  paymentKey: string;
  orderId: string;
  status: string;
  method?: string;
  totalAmount: number;
  approvedAt?: string;
  receipt?: { url: string };
  card?: Record<string, unknown>;
  easyPay?: Record<string, unknown>;
  virtualAccount?: Record<string, unknown>;
  cancels?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export class TossError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function tossFetch(path: string, init?: RequestInit): Promise<TossPayment> {
  const res = await fetch(`${TOSS_API}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) {
    throw new TossError(json.code ?? "UNKNOWN", json.message ?? "결제 처리 오류", res.status);
  }
  return json as TossPayment;
}

/** 결제 승인 (클라이언트 successUrl 리다이렉트 후 서버에서 호출) */
export function confirmPayment(params: { paymentKey: string; orderId: string; amount: number }) {
  return tossFetch("/payments/confirm", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

/** 결제 조회 */
export function getPayment(paymentKey: string) {
  return tossFetch(`/payments/${paymentKey}`);
}

/** 결제 취소 (전액/부분) */
export function cancelPayment(
  paymentKey: string,
  cancelReason: string,
  cancelAmount?: number
) {
  return tossFetch(`/payments/${paymentKey}/cancel`, {
    method: "POST",
    body: JSON.stringify({ cancelReason, ...(cancelAmount ? { cancelAmount } : {}) }),
  });
}
