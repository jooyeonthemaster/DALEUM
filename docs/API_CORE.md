# DALEUM 코어 커머스 API 명세

프론트 팀은 이 문서만 보고 붙이면 된다. 모든 금액 계산은 **서버가 진실의 원천**이며,
클라이언트가 보낸 금액은 검증용으로만 쓰이고 절대 저장/과금에 사용되지 않는다.

공통 규칙

- 요청/응답 본문은 모두 JSON.
- 에러 응답은 항상 `{ "error": string }` + 적절한 HTTP status. `error` 메시지는 그대로 사용자에게 노출해도 되는 자연스러운 한국어다.
- 금액 단위는 모두 KRW 정수(원).
- 주문 식별자 2종: `orderId`(orders.id, UUID) / `orderNo`(orders.order_no, `DL26070300001` 형식). **토스 위젯에는 orderNo를 넘긴다.**

---

## 1. POST `/api/analytics/track`

익명 이벤트 수집. 클라이언트 `track()`(`@/lib/analytics`)이 sendBeacon으로 호출한다.

### 요청

```json
{
  "event": "page_view",
  "path": "/products/konjac-noodle",
  "product_id": "uuid | null",
  "order_id": "uuid | null",
  "session_id": "uuid-string",
  "meta": {}
}
```

- `event`는 화이트리스트만 허용: `page_view` `product_view` `add_to_cart` `begin_checkout` `purchase` `vip_enter` `vip_campaign_view` `search`
- body 4KB / meta 2KB 초과분, 잘못된 형식, 미허용 이벤트는 **조용히 버려진다**.

### 응답

- 항상 `200 { "ok": true }` — insert 실패 포함 어떤 경우에도. 분석은 UX를 절대 막지 않는다.

---

## 2. `/api/vip/verify-code`

### POST — VIP 입장 코드 검증

```json
{ "code": "FRIENDS2026" }
```

- 코드는 대소문자 무관 (서버가 대문자로 정규화).
- 검증: 코드 존재 + `is_active` + 유효기간 + 사용 한도(`max_uses`) + 소속 그룹 `is_active`.
- 성공 시 httpOnly 쿠키 **`daleum_vip_code`** (30일, path=/, SameSite=Lax) 설정. 이후 상품 목록의 VIP 가격 해석과 주문 생성이 이 쿠키를 자동으로 읽는다.

| status | 응답 |
|---|---|
| 200 | `{ "group": { "name": "패밀리", "discount_rate": 15 } }` |
| 400 | `{ "error": "코드를 입력해 주세요." }` |
| 404 | `{ "error": "유효하지 않은 코드입니다." }` / `"유효 기간이 지난 코드입니다."` / `"사용 가능 횟수가 모두 소진된 코드입니다."` |

- `used_count`는 검증 시점이 아니라 **해당 코드로 결제가 완료될 때** 증가한다.

### DELETE — VIP 로그아웃

- 쿠키 제거. 항상 `200 { "ok": true }`.

---

## 3. POST `/api/orders` — 주문 생성 (pending)

체크아웃 1단계. 상품/수량/배송지만 보내면 서버가 가격·재고·VIP·캠페인·쿠폰·배송비를 전부 재계산해 pending 주문을 만든다. **클라이언트는 금액을 보내지 않는다.**

### 요청

```json
{
  "items": [
    { "productId": "uuid", "variantId": "uuid | 생략", "qty": 2, "campaignId": "uuid | 생략" }
  ],
  "orderer": { "name": "홍길동", "phone": "01012345678", "email": "생략 가능" },
  "recipient": {
    "name": "홍길동", "phone": "01012345678",
    "postcode": "10326", "address1": "경기도 고양시 …",
    "address2": "생략 가능", "memo": "생략 가능"
  },
  "couponCode": "WELCOME10 (생략 가능)"
}
```

- 로그인 상태면 세션에서 `user_id`가 자동 연결된다. **비회원 주문 허용.**
- VIP 코드는 body가 아니라 `daleum_vip_code` 쿠키에서 읽는다.
- `campaignId`: `/vip/s/[token]` 캠페인 페이지 경유 주문일 때 해당 라인에 붙인다.
- 동일 상품+옵션+캠페인 라인은 서버가 병합한다. 라인당 수량 1~99, 최대 30라인.

### 서버 계산 규칙 (금액 의미)

- 단가 우선순위: **캠페인 지정가 > VIP 개별 지정가 > VIP 그룹 상품 지정가 > 그룹 할인율 > 정상가**
- VIP 컨텍스트: 로그인 멤버십이 우선, 없으면 쿠키의 VIP 코드로 해석.
- `subtotal` = 정상가(옵션 추가금 포함) × 수량 합계
- `discount_total` = VIP/캠페인 할인 + 쿠폰 할인 (쿠폰 할인은 `coupon_discount`에 별도 기록)
- 쿠폰 할인 기준액과 `min_order` 판정은 **VIP 반영 후 상품 합계** 기준. rate 쿠폰은 `max_discount` 캡 적용.
- `shipping_fee` = 할인 반영 후 소계 기준 (`settings.shipping`: 기본 3,500원, 40,000원 이상 무료)
- `total` = subtotal − discount_total + shipping_fee
- 지정가(`custom_price`)는 옵션 추가금과 무관하게 그대로 최종 단가가 된다 (VIP 지정가와 동일 규칙). 단가는 정상가를 초과하지 않는다.
- `order_items`에 `name_snapshot` / `option_snapshot` / `image_url` / `unit_price` / `original_price` 스냅샷 저장 — 이후 상품 정보가 바뀌어도 주문 내역은 불변.

### 응답

| status | 응답 |
|---|---|
| 201 | `{ "orderId": "uuid", "orderNo": "DL26070300001", "amount": 42400 }` |
| 400 | 입력 오류 / 판매 중지 상품 / 옵션 오류 / 쿠폰 조건 미충족 / 캠페인 무효 등 `{ error }` |
| 403 | 지정 고객 전용 캠페인 불일치 `{ "error": "이 캠페인은 지정된 고객만 이용할 수 있습니다." }` |
| 404 | 존재하지 않는 쿠폰 코드 |
| 409 | 재고 부족/품절 `{ "error": "재고가 부족합니다: 곤약면 (소면) — 남은 수량 3개" }` |
| 500 | 서버 오류 |

- **주의: 이 시점에는 재고를 차감하지 않는다.** 재고 차감은 결제 승인(confirm) 시점. 따라서 pending 주문 생성 후 결제 직전 품절될 수 있고, 그 경우도 결제는 승인되며 관리자 메모에 기록된다.
- `amount`를 그대로 토스 위젯 `requestPayment({ orderId: orderNo, amount })`에 넘긴다.

---

## 4. POST `/api/payments/confirm` — 결제 승인

`/checkout/success?paymentKey&orderId&amount` 리다이렉트 후 호출.

### 요청

```json
{ "paymentKey": "toss-payment-key", "orderId": "DL26070300001", "amount": 42400 }
```

`orderId`에는 **orderNo**를 넣는다 (토스 위젯에 넘긴 값 그대로).

### 처리 순서

1. orderNo로 pending 주문 조회
2. **서버 저장 `orders.total` === `amount` 사전 대조** — 불일치면 승인 호출 없이 400
3. 토스 승인 API 호출
4. 승인 응답 금액 재검증 — 불일치 시 즉시 자동 취소 후 400 (취소 실패 시 admin_memo 기록)
5. 확정 처리 (`pending→paid` 조건부 클레임으로 **웹훅과 동시 호출에도 정확히 1회만** 실행):
   - `payments` insert (paid, 토스 raw 응답 보관, payment_key unique upsert)
   - `orders.status = paid` + `paid_at`
   - 라인별 `adjust_stock(-qty, 'order')` — **재고 부족으로 실패해도 결제는 유지**, admin_memo에 "재고 차감 실패" 기록 (관리자 수동 처리)
   - 주문에 vip_code 있으면 `vip_access_codes.used_count + 1`
   - 쿠폰 있으면 `coupon_redemptions` insert + `coupons.used_count + 1`

### 응답

| status | 응답 |
|---|---|
| 200 | `{ "orderId": "uuid", "orderNo": "DL…", "status": "paid", "amount": 42400 }` — **이미 paid인 주문이어도 동일 (멱등, 새로고침/이중 호출 안전)** |
| 400 | 금액 불일치 `{ "error": "결제 금액이 주문 금액과 일치하지 않습니다." }` |
| 404 | 주문 없음 |
| 409 | pending/paid가 아닌 주문 (취소된 주문 등) |
| 502 | 토스 승인 실패 `{ error: 토스 에러 메시지 }` — **주문은 pending 유지, 재시도 가능** |
| 500 | 승인은 됐으나 DB 반영 실패 — 웹훅이 이후 자동 보정 |

---

## 5. POST `/api/payments/webhook` — 토스 웹훅

토스 개발자센터에 등록하는 엔드포인트. 프론트는 신경 쓸 필요 없음.

- `eventType: PAYMENT_STATUS_CHANGED`만 처리, 그 외 무시.
- 토스 웹훅은 서명이 없으므로 **payload를 신뢰하지 않고 항상 토스 결제 조회 API로 재확인** 후 처리.
- `DONE`: 주문이 아직 pending이면 confirm과 동일한 확정 처리 (동일한 멱등 클레임 공유 — 이중 재고 차감 없음). 금액 불일치면 처리 보류 + admin_memo.
- `CANCELED`: payments `refunded` / orders `cancelled` 동기화. paid 이후 취소면 재고 복구, pending 취소면 복구 없음(차감된 적 없음). 이미 취소된 주문이면 무시.
- `PARTIAL_CANCELED`: payments `partial_refunded`로만 동기화 + admin_memo (주문 상태는 관리자 판단).
- **어떤 경우에도 200 반환** (오류는 서버 로그로만).

---

## 6. POST `/api/orders/[id]/cancel` — 주문 취소

`[id]`는 orders.id (UUID).

### 요청

```json
{ "reason": "단순 변심 (생략 시 '고객 요청 취소')", "orderNo": "비회원만", "phone": "비회원만" }
```

### 본인 확인

- **회원 주문**: 로그인 필수 + `user_id` 일치. 아니면 401/403.
- **비회원 주문**: `orderNo` + `phone`(주문자 연락처, 하이픈 무관)이 모두 일치해야 함. 아니면 403.

### 상태별 동작

| 주문 상태 | 동작 |
|---|---|
| `pending` | 결제 전 — 바로 `cancelled` |
| `paid` / `preparing` | **토스 환불 API(전액) 호출 성공 후에만** payments `refunded` → orders `cancelled` → 재고 복구 `adjust_stock(+qty, 'cancel')`. DB만 바꾸는 취소는 없다 |
| `cancelled` / `refunded` | 이미 처리됨 — `200 { status }` (멱등) |
| `shipped` 이후 | `400` — 고객센터 안내 메시지 |

### 응답

| status | 응답 |
|---|---|
| 200 | `{ "orderId": "uuid", "status": "cancelled" }` |
| 400 | 배송 시작 이후 / 비회원 인증 정보 누락 |
| 401/403 | 본인 확인 실패 |
| 404 | 주문 없음 |
| 409 | paid인데 결제 기록이 없는 이상 상태 — 고객센터 안내 |
| 502 | 토스 환불 실패 (주문 상태 변경 없음 — 재시도 가능) |

- 토스에서 이미 취소된 결제(`ALREADY_CANCELED_PAYMENT`)는 성공으로 간주하고 DB 동기화만 진행 (멱등).

---

## 7. POST `/api/coupons/validate` — 쿠폰 사전 확인 (체크아웃 UI용)

입력한 쿠폰이 쓸 수 있는지, 예상 할인액이 얼마인지 즉시 보여주기 위한 API.
**최종 검증과 할인 확정은 주문 생성 시 서버가 다시 수행한다** — 이 응답을 금액 계산의 근거로 삼지 말 것.

### 요청

```json
{ "code": "WELCOME10", "subtotal": 38000 }
```

`subtotal`은 VIP 반영된 상품 합계(배송비 제외). 표시용 예상치 계산에만 쓰인다.

### 응답

| status | 응답 |
|---|---|
| 200 | `{ "coupon": { "code", "name", "discount_type", "value", "min_order", "max_discount" }, "discount": 3800 }` |
| 400 | 조건 미충족 — `"사용이 중지된 쿠폰입니다."` `"아직 사용 기간이 시작되지 않은 쿠폰입니다."` `"유효 기간이 지난 쿠폰입니다."` `"준비된 수량이 모두 소진된 쿠폰입니다."` `"20,000원 이상 주문 시 사용할 수 있는 쿠폰입니다."` `"이미 사용한 쿠폰입니다."` |
| 404 | `"존재하지 않는 쿠폰 코드입니다."` |

- 회원별 사용 한도(`per_user_limit`)는 **로그인 회원만** 검증된다. 비회원은 추적 불가(정책상 허용).

---

## 부록 A. 체크아웃 연동 시퀀스 (결제 팀 참고)

```
[/checkout]
 1. POST /api/orders                      → { orderId, orderNo, amount }
 2. tossWidgets.requestPayment({
      orderId: orderNo,                   ← orderNo! (uuid 아님)
      amount,                             ← 서버가 준 값 그대로
      successUrl: /checkout/success,
      failUrl:    /checkout/fail,
    })

[/checkout/success?paymentKey&orderId&amount]
 3. POST /api/payments/confirm { paymentKey, orderId, amount }
    → 200이면 완료 화면 + 장바구니 클리어
    → 502면 pending 유지 상태 — "결제에 실패했습니다" + 재시도 유도
    → 400(금액 불일치)이면 주문 무효 안내

[결제창 이탈/실패 → /checkout/fail?code&message]
 4. pending 주문은 그대로 두면 됨 (재고 미차감, 별도 정리 불필요)
```

## 부록 B. 알려진 정책적 한계 (의도된 트레이드오프)

- **재고 차감 시점이 결제 승인 시점**이므로, 결제 도중 품절되면 승인 후 재고가 음수가 되는 대신 차감이 실패하고 admin_memo에 기록된다. 관리자가 환불 또는 재입고로 수동 처리한다. (선점 방식 대비 유령 재고 잠금이 없다는 장점을 택함)
- VIP 코드 `used_count`·쿠폰 `used_count` 증가는 read-then-write라 극단적 동시 결제에서 1~2회 어긋날 수 있다. 한도 검증은 주문 생성 시 다시 수행되므로 금액 사고로는 이어지지 않는다.
- 가상계좌(`WAITING_FOR_DEPOSIT`)는 현재 미지원 — 웹훅에서 무시된다.
