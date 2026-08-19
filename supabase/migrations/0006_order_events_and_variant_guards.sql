-- ============================================================
-- 0006 — 주문 처리 이력 분리 · 환불 누계 컬럼 · 옵션 무결성
--
-- 배경 (관리자 화면 고도화 적대 검수에서 확인된 것)
--
-- (1) 환불 누계가 orders.admin_memo 텍스트 한 칸에 한국어 문장으로 살고 있었다.
--     "이미 얼마를 환불했는가" 를 그 문장에서 되읽어 남은 환불 가능액을 계산했는데,
--     같은 칸을 관리자 메모가 900ms 자동 저장으로 통째로 덮어쓴다.
--     두 요청이 겹치면 환불 이력이 사라지고 → 남은 금액이 원금으로 되살아나
--     **초과 환불이 다시 가능해진다.** 코드 쪽은 낙관적 잠금으로 급히 막았지만,
--     '텍스트가 곧 장부' 인 구조 자체가 위태롭다.
--
-- (2) 같은 칸에 lib/orders.ts 가 기계용 오류 원문(UTC ISO 시각 · Postgres 영문 메시지 ·
--     상품 UUID · paymentKey)도 함께 적는다. 사람이 읽을 메모와 감사 기록과 디버그 로그가
--     한 칸에 뒤섞여 있어 어느 쪽도 제대로 쓸 수 없었다.
--
-- (3) 옵션(product_variants)에 같은 이름이 두 번 들어가도 DB 가 막지 않았다.
--     화면에서는 막았지만 일괄 등록 등 다른 경로는 그대로 통과한다.
--     같은 이름이 둘이면 관리자도 고객도 어느 쪽 재고인지 구분할 수 없다.
--
-- (4) 회사 품목표는 같은 제품의 포장 단위(10입·20입·30입)마다 납품가가 다른데
--     (예: 여주발효곤약밥 10입 14,300 / 20입 25,500 / 30입 36,500),
--     원가를 담을 자리가 상품에만 있어 첫 줄 값만 저장하고 나머지는 버렸다.
--
-- 이 마이그레이션은 **더하기만 한다** — 기존 컬럼·데이터를 지우거나 바꾸지 않는다.
-- admin_memo 는 그대로 두어(사람이 쓰는 자유 메모) 코드가 단계적으로 옮겨갈 수 있게 한다.
-- ============================================================

-- ---------- (1) 환불 누계 ----------
-- 잔액을 텍스트에서 파싱하지 않고 이 숫자 하나로 판정한다.
-- 결제사(토스) 취소 응답의 balanceAmount 를 신뢰하되, 없으면 여기에 더해 간다.
alter table daleum.payments
  add column if not exists refunded_amount int not null default 0;

alter table daleum.payments
  drop constraint if exists payments_refunded_amount_range;
alter table daleum.payments
  add constraint payments_refunded_amount_range
  check (refunded_amount >= 0 and refunded_amount <= amount);

comment on column daleum.payments.refunded_amount is
  '환불 누계(원). 남은 환불 가능액 = amount - refunded_amount. 초과 환불을 DB 차원에서 막는다';

-- ---------- (2) 주문 처리 이력 ----------
-- 사람이 읽을 한 줄(message)과 기계용 원문(debug)을 나눠 담는다.
-- 화면에는 message 만 나가고 debug 는 관리자도 굳이 볼 일이 없다(장애 조사용).
create table if not exists daleum.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references daleum.orders(id) on delete cascade,
  -- 무슨 일이 있었나: 상태변경/환불/운송장/배송지수정/재고/메모/결제
  kind text not null check (kind in (
    'status', 'refund', 'tracking', 'shipping', 'stock', 'memo', 'payment', 'etc'
  )),
  -- 관리자 화면에 그대로 나가는 한국어 한 줄. 코드·UUID·영문 오류를 담지 않는다.
  message text not null,
  -- 돈이 오간 사건이면 금액(원). 환불 누계 검산에 쓴다.
  amount int,
  -- 누가 한 일인가. 시스템이 한 일이면 null.
  actor_id uuid references daleum.profiles(id) on delete set null,
  -- 기계용 원문(Postgres 오류·paymentKey·대상 id 등). 화면에 내보내지 않는다.
  debug jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_events_order
  on daleum.order_events(order_id, created_at desc);
create index if not exists idx_order_events_kind
  on daleum.order_events(kind, created_at desc);

-- 관리자만 읽고 쓴다. 서버 라우트는 service role 로 접근하므로 정책과 무관하게 동작하고,
-- 정책이 없으면 anon/authenticated 의 직접 접근은 전부 거부된다(주문 이력에 금액이 들어간다).
alter table daleum.order_events enable row level security;
drop policy if exists "order_events_admin_all" on daleum.order_events;
create policy "order_events_admin_all" on daleum.order_events
  for all using (daleum.is_admin()) with check (daleum.is_admin());

comment on table daleum.order_events is
  '주문 처리 이력 — 관리자 자유 메모(orders.admin_memo)와 분리된 감사 기록. 사람 말(message)과 기계 원문(debug)을 나눠 담는다';

-- ---------- (3) 옵션 이름 중복 방지 ----------
-- 적용 전 확인: 운영 데이터에 (product_id, name) 중복 0건이었다.
create unique index if not exists uniq_product_variants_name
  on daleum.product_variants(product_id, name);

comment on index daleum.uniq_product_variants_name is
  '한 상품 안에서 같은 옵션명을 두 번 만들 수 없다 — 어느 쪽 재고인지 구분할 수 없어진다';

-- ---------- (4) 옵션별 원가 ----------
-- 포장 단위마다 납품가가 다른 실제 품목표를 손실 없이 담기 위한 자리.
-- 비워 두면 상품 원가(products.cost_price)를 쓰던 기존 동작 그대로다.
alter table daleum.product_variants
  add column if not exists cost_price int;

alter table daleum.product_variants
  drop constraint if exists product_variants_cost_price_range;
alter table daleum.product_variants
  add constraint product_variants_cost_price_range
  check (cost_price is null or (cost_price >= 0 and cost_price <= 100000000));

comment on column daleum.product_variants.cost_price is
  '옵션별 매입 원가(원). 비우면 상품 원가를 따른다. 고객 화면에 절대 나가지 않는다';
