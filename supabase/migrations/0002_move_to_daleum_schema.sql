-- DALEUM(다름) — site 프로젝트 공유, daleum 전용 스키마 (public 원본에서 자동 변환)
create schema if not exists daleum;

-- ============================================================
-- DALEUM 자사몰 초기 스키마
-- 상품/재고/주문/결제/배송/VIP/쿠폰/팝업/리뷰/분석
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- 공통: updated_at 트리거 ----------
create or replace function daleum.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- 프로필 ----------
create table daleum.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  phone text,
  role text not null default 'customer' check (role in ('customer','admin')),
  marketing_opt_in boolean not null default false,
  memo text, -- 관리자 메모
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_updated before update on daleum.profiles
for each row execute function daleum.set_updated_at();

-- auth.users 생성 시 프로필 자동 생성
create or replace function daleum.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into daleum.profiles (id, email, name, phone)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'phone', '')
  ) on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created_daleum
after insert on auth.users
for each row execute function daleum.handle_new_user();

-- 관리자 판별 (RLS 재귀 방지용 security definer)
create or replace function daleum.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from daleum.profiles where id = auth.uid() and role = 'admin');
$$;

-- ---------- 배송지 ----------
create table daleum.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references daleum.profiles(id) on delete cascade,
  label text not null default '기본 배송지',
  recipient text not null,
  phone text not null,
  postcode text not null,
  address1 text not null,
  address2 text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_addresses_user on daleum.addresses(user_id);

-- ---------- 카테고리 / 상품 ----------
create table daleum.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  image_url text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table daleum.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  subtitle text,
  category_id uuid references daleum.categories(id) on delete set null,
  description text,               -- 상세 설명 (markdown)
  story text,                     -- 에디토리얼 카피
  price int not null,             -- 판매가 (KRW)
  compare_at_price int,           -- 정가 (할인 표시용)
  cost_price int,                 -- 원가 (관리자용)
  sku text unique,
  stock int not null default 0,
  low_stock_threshold int not null default 10,
  status text not null default 'draft' check (status in ('draft','active','sold_out','hidden')),
  storage_type text not null default 'room' check (storage_type in ('room','chilled','frozen')),
  origin text,                    -- 원산지
  weight text,                    -- 중량 표기 (예: 200g × 2입)
  units_per_pack int not null default 1,
  badges text[] not null default '{}',      -- BEST / NEW / 한정 등
  nutrition jsonb not null default '{}',    -- {kcal, sodium_mg, protein_g, fiber_pct ...}
  specs jsonb not null default '{}',        -- {면굵기: '1.4mm', 구성: ...}
  tags text[] not null default '{}',
  is_featured boolean not null default false,
  sort_order int not null default 0,
  view_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_products_category on daleum.products(category_id);
create index idx_products_status on daleum.products(status);
create trigger trg_products_updated before update on daleum.products
for each row execute function daleum.set_updated_at();

create table daleum.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references daleum.products(id) on delete cascade,
  url text not null,
  alt text,
  sort_order int not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_product_images_product on daleum.product_images(product_id);

create table daleum.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references daleum.products(id) on delete cascade,
  name text not null,             -- 예: 소면(2mm) / 국시(4mm)
  price_delta int not null default 0,
  stock int not null default 0,
  sku text,
  is_active boolean not null default true,
  sort_order int not null default 0
);
create index idx_variants_product on daleum.product_variants(product_id);

-- ---------- 재고 이력 ----------
create table daleum.inventory_logs (
  id bigint generated always as identity primary key,
  product_id uuid not null references daleum.products(id) on delete cascade,
  variant_id uuid references daleum.product_variants(id) on delete set null,
  delta int not null,             -- +입고 / -출고
  reason text not null check (reason in ('order','cancel','restock','adjust','initial')),
  ref_order_id uuid,
  memo text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index idx_inventory_logs_product on daleum.inventory_logs(product_id, created_at desc);

-- ---------- 장바구니 / 위시리스트 ----------
create table daleum.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references daleum.profiles(id) on delete cascade,
  updated_at timestamptz not null default now()
);
create table daleum.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references daleum.carts(id) on delete cascade,
  product_id uuid not null references daleum.products(id) on delete cascade,
  variant_id uuid references daleum.product_variants(id) on delete cascade,
  qty int not null default 1 check (qty > 0),
  created_at timestamptz not null default now()
);
create unique index uq_cart_item on daleum.cart_items(cart_id, product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table daleum.wishlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references daleum.profiles(id) on delete cascade,
  product_id uuid not null references daleum.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

-- ---------- 주문 ----------
create sequence daleum.order_no_seq;
create or replace function daleum.generate_order_no()
returns text language sql volatile as $$
  select 'DL' || to_char(now() at time zone 'Asia/Seoul', 'YYMMDD') || lpad(nextval('daleum.order_no_seq')::text, 5, '0');
$$;

create table daleum.orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique default daleum.generate_order_no(),
  user_id uuid references daleum.profiles(id) on delete set null,
  status text not null default 'pending' check (status in
    ('pending','paid','preparing','shipped','delivered','confirmed','cancelled','refund_requested','refunded')),
  subtotal int not null default 0,
  discount_total int not null default 0,
  shipping_fee int not null default 0,
  total int not null default 0,
  -- 할인 컨텍스트
  vip_campaign_id uuid,
  vip_code text,
  coupon_id uuid,
  coupon_discount int not null default 0,
  -- 스냅샷
  orderer jsonb not null default '{}',    -- {name, phone, email}
  recipient jsonb not null default '{}',  -- {name, phone, postcode, address1, address2, memo}
  paid_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  admin_memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_orders_user on daleum.orders(user_id, created_at desc);
create index idx_orders_status on daleum.orders(status, created_at desc);
create trigger trg_orders_updated before update on daleum.orders
for each row execute function daleum.set_updated_at();

create table daleum.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references daleum.orders(id) on delete cascade,
  product_id uuid references daleum.products(id) on delete set null,
  variant_id uuid,
  name_snapshot text not null,
  option_snapshot text,
  image_url text,
  unit_price int not null,        -- 실제 판매 단가 (VIP/쿠폰 반영)
  original_price int not null,    -- 당시 정상가
  qty int not null check (qty > 0),
  created_at timestamptz not null default now()
);
create index idx_order_items_order on daleum.order_items(order_id);
create index idx_order_items_product on daleum.order_items(product_id);

-- ---------- 결제 ----------
create table daleum.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references daleum.orders(id) on delete cascade,
  provider text not null default 'toss',
  payment_key text unique,
  method text,                    -- 카드/가상계좌/간편결제 등
  amount int not null,
  status text not null default 'ready' check (status in ('ready','paid','cancelled','partial_refunded','refunded','failed')),
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  receipt_url text,
  card_info jsonb,
  failure jsonb,
  raw jsonb
);
create index idx_payments_order on daleum.payments(order_id);

-- ---------- 배송(운송장) ----------
create table daleum.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references daleum.orders(id) on delete cascade,
  carrier_code text not null,     -- kr.cjlogistics 등
  carrier_name text not null,     -- CJ대한통운 등
  tracking_no text not null,
  status text not null default 'ready' check (status in ('ready','in_transit','delivered')),
  shipped_at timestamptz,
  delivered_at timestamptz,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_shipments_order on daleum.shipments(order_id);
create trigger trg_shipments_updated before update on daleum.shipments
for each row execute function daleum.set_updated_at();

-- ---------- VIP 시스템 ----------
create table daleum.vip_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  discount_rate numeric(5,2) not null default 0 check (discount_rate >= 0 and discount_rate <= 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table daleum.vip_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references daleum.profiles(id) on delete cascade,
  group_id uuid not null references daleum.vip_groups(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);
create index idx_vip_members_group on daleum.vip_members(group_id);

-- 상품별 VIP 가격 오버라이드 (그룹 단위 또는 개별 고객 단위)
create table daleum.vip_product_prices (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references daleum.vip_groups(id) on delete cascade,
  user_id uuid references daleum.profiles(id) on delete cascade,
  product_id uuid not null references daleum.products(id) on delete cascade,
  custom_price int,               -- 지정가 (우선)
  discount_rate numeric(5,2),     -- 또는 할인율
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (group_id is not null or user_id is not null),
  check (custom_price is not null or discount_rate is not null)
);
create index idx_vip_prices_product on daleum.vip_product_prices(product_id);
create index idx_vip_prices_group on daleum.vip_product_prices(group_id);
create index idx_vip_prices_user on daleum.vip_product_prices(user_id);

-- VIP 입장 코드 (/vip 에서 코드 입력 → 그룹 가격 적용)
create table daleum.vip_access_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  group_id uuid not null references daleum.vip_groups(id) on delete cascade,
  label text,
  max_uses int,
  used_count int not null default 0,
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- VIP 캠페인: 특정 고객/그룹에게 보내는 전용 할인 상품 페이지 (시크릿 스토어)
create table daleum.vip_campaigns (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,     -- URL: /vip/s/{token}
  title text not null,
  message text,                   -- 고객에게 보여줄 인사말
  group_id uuid references daleum.vip_groups(id) on delete set null,
  target_user_id uuid references daleum.profiles(id) on delete set null,
  require_code text,              -- 페이지 진입 시 추가 코드 잠금 (선택)
  hero_image_url text,
  expires_at timestamptz,
  is_active boolean not null default true,
  view_count int not null default 0,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table daleum.vip_campaign_items (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references daleum.vip_campaigns(id) on delete cascade,
  product_id uuid not null references daleum.products(id) on delete cascade,
  custom_price int not null,
  sort_order int not null default 0,
  unique (campaign_id, product_id)
);

-- ---------- 쿠폰 ----------
create table daleum.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  discount_type text not null check (discount_type in ('rate','fixed')),
  value int not null,             -- rate면 %, fixed면 원
  min_order int not null default 0,
  max_discount int,
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit int,
  used_count int not null default 0,
  per_user_limit int not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table daleum.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references daleum.coupons(id) on delete cascade,
  user_id uuid references daleum.profiles(id) on delete set null,
  order_id uuid references daleum.orders(id) on delete set null,
  redeemed_at timestamptz not null default now()
);
create index idx_coupon_redemptions on daleum.coupon_redemptions(coupon_id, user_id);

-- ---------- 팝업 / 배너 ----------
create table daleum.popups (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  image_url text,
  content text,
  link_url text,
  position text not null default 'center' check (position in ('center','bottom-left','bottom')),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table daleum.banners (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  image_url text,
  link_url text,
  placement text not null default 'hero' check (placement in ('hero','strip','mid','footer')),
  text_theme text not null default 'dark' check (text_theme in ('dark','light')),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- 리뷰 / 문의 / 공지 ----------
create table daleum.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references daleum.products(id) on delete cascade,
  user_id uuid not null references daleum.profiles(id) on delete cascade,
  order_item_id uuid references daleum.order_items(id) on delete set null,
  rating int not null check (rating between 1 and 5),
  content text not null,
  image_urls text[] not null default '{}',
  is_hidden boolean not null default false,
  admin_reply text,
  admin_replied_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_reviews_product on daleum.reviews(product_id, created_at desc);

create table daleum.product_inquiries (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references daleum.products(id) on delete cascade,
  user_id uuid not null references daleum.profiles(id) on delete cascade,
  question text not null,
  answer text,
  is_private boolean not null default false,
  answered_at timestamptz,
  created_at timestamptz not null default now()
);

create table daleum.notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  is_pinned boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- 분석 ----------
create table daleum.analytics_events (
  id bigint generated always as identity primary key,
  event text not null,            -- page_view / product_view / add_to_cart / begin_checkout / purchase ...
  path text,
  product_id uuid,
  order_id uuid,
  user_id uuid,
  session_id text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index idx_analytics_event_time on daleum.analytics_events(event, created_at desc);
create index idx_analytics_created on daleum.analytics_events(created_at desc);

-- ---------- 설정 (배송비 등) ----------
create table daleum.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into daleum.settings (key, value) values
  ('shipping', '{"base_fee": 3500, "free_threshold": 40000, "island_extra": 3000}'),
  ('store', '{"name": "다름", "cs_phone": "", "cs_hours": "평일 10:00 ~ 17:00"}');

-- ---------- 재고 차감/복구 RPC ----------
create or replace function daleum.adjust_stock(
  p_product_id uuid,
  p_variant_id uuid,
  p_delta int,
  p_reason text,
  p_ref_order_id uuid default null,
  p_memo text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_stock int;
begin
  if p_variant_id is not null then
    update daleum.product_variants set stock = stock + p_delta
    where id = p_variant_id returning stock into v_stock;
  else
    update daleum.products set stock = stock + p_delta
    where id = p_product_id returning stock into v_stock;
  end if;
  if v_stock is null then
    raise exception 'product/variant not found';
  end if;
  if v_stock < 0 then
    raise exception 'insufficient stock';
  end if;
  insert into daleum.inventory_logs (product_id, variant_id, delta, reason, ref_order_id, memo)
  values (p_product_id, p_variant_id, p_delta, p_reason, p_ref_order_id, p_memo);
end $$;

-- ============================================================
-- RLS
-- ============================================================
alter table daleum.profiles enable row level security;
alter table daleum.addresses enable row level security;
alter table daleum.categories enable row level security;
alter table daleum.products enable row level security;
alter table daleum.product_images enable row level security;
alter table daleum.product_variants enable row level security;
alter table daleum.inventory_logs enable row level security;
alter table daleum.carts enable row level security;
alter table daleum.cart_items enable row level security;
alter table daleum.wishlists enable row level security;
alter table daleum.orders enable row level security;
alter table daleum.order_items enable row level security;
alter table daleum.payments enable row level security;
alter table daleum.shipments enable row level security;
alter table daleum.vip_groups enable row level security;
alter table daleum.vip_members enable row level security;
alter table daleum.vip_product_prices enable row level security;
alter table daleum.vip_access_codes enable row level security;
alter table daleum.vip_campaigns enable row level security;
alter table daleum.vip_campaign_items enable row level security;
alter table daleum.coupons enable row level security;
alter table daleum.coupon_redemptions enable row level security;
alter table daleum.popups enable row level security;
alter table daleum.banners enable row level security;
alter table daleum.reviews enable row level security;
alter table daleum.product_inquiries enable row level security;
alter table daleum.notices enable row level security;
alter table daleum.analytics_events enable row level security;
alter table daleum.settings enable row level security;

-- 프로필: 본인 조회/수정, 관리자 전체
create policy "profiles_select_own" on daleum.profiles for select using (auth.uid() = id or daleum.is_admin());
create policy "profiles_update_own" on daleum.profiles for update using (auth.uid() = id) with check (auth.uid() = id and role = 'customer');
create policy "profiles_admin_all" on daleum.profiles for all using (daleum.is_admin());

-- 배송지: 본인 CRUD
create policy "addresses_own" on daleum.addresses for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 카탈로그: 공개 읽기 (active만; 관리자는 서버(service role) 경유)
create policy "categories_public_read" on daleum.categories for select using (is_active = true or daleum.is_admin());
create policy "products_public_read" on daleum.products for select using (status in ('active','sold_out') or daleum.is_admin());
create policy "product_images_public_read" on daleum.product_images for select using (true);
create policy "variants_public_read" on daleum.product_variants for select using (is_active = true or daleum.is_admin());

-- 장바구니/위시리스트: 본인
create policy "carts_own" on daleum.carts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "cart_items_own" on daleum.cart_items for all
  using (exists (select 1 from daleum.carts c where c.id = cart_id and c.user_id = auth.uid()))
  with check (exists (select 1 from daleum.carts c where c.id = cart_id and c.user_id = auth.uid()));
create policy "wishlists_own" on daleum.wishlists for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 주문/결제/배송: 본인 조회 (생성·수정은 서버 service role 전용)
create policy "orders_select_own" on daleum.orders for select using (auth.uid() = user_id or daleum.is_admin());
create policy "order_items_select_own" on daleum.order_items for select
  using (exists (select 1 from daleum.orders o where o.id = order_id and (o.user_id = auth.uid() or daleum.is_admin())));
create policy "payments_select_own" on daleum.payments for select
  using (exists (select 1 from daleum.orders o where o.id = order_id and (o.user_id = auth.uid() or daleum.is_admin())));
create policy "shipments_select_own" on daleum.shipments for select
  using (exists (select 1 from daleum.orders o where o.id = order_id and (o.user_id = auth.uid() or daleum.is_admin())));

-- 리뷰: 공개 읽기, 본인 작성/수정
create policy "reviews_public_read" on daleum.reviews for select using (is_hidden = false or auth.uid() = user_id or daleum.is_admin());
create policy "reviews_insert_own" on daleum.reviews for insert with check (auth.uid() = user_id);
create policy "reviews_update_own" on daleum.reviews for update using (auth.uid() = user_id);
create policy "reviews_delete_own" on daleum.reviews for delete using (auth.uid() = user_id or daleum.is_admin());

-- 문의: 작성자/관리자 + 공개글
create policy "inquiries_read" on daleum.product_inquiries for select using (is_private = false or auth.uid() = user_id or daleum.is_admin());
create policy "inquiries_insert_own" on daleum.product_inquiries for insert with check (auth.uid() = user_id);

-- 공지/배너/팝업: 공개 읽기
create policy "notices_public_read" on daleum.notices for select using (is_active = true or daleum.is_admin());
create policy "banners_public_read" on daleum.banners for select using (is_active = true or daleum.is_admin());
create policy "popups_public_read" on daleum.popups for select using (is_active = true or daleum.is_admin());

-- 설정: 공개 읽기 (배송비 계산용)
create policy "settings_public_read" on daleum.settings for select using (true);

-- 분석: 누구나 insert, 조회는 관리자
create policy "analytics_insert_any" on daleum.analytics_events for insert with check (true);
create policy "analytics_admin_read" on daleum.analytics_events for select using (daleum.is_admin());

-- VIP: 본인 멤버십 조회만 허용 (가격 계산은 서버 경유)
create policy "vip_members_select_own" on daleum.vip_members for select using (auth.uid() = user_id or daleum.is_admin());
create policy "vip_groups_member_read" on daleum.vip_groups for select
  using (exists (select 1 from daleum.vip_members m where m.group_id = id and m.user_id = auth.uid()) or daleum.is_admin());

-- 재고 이력: 관리자만
create policy "inventory_admin" on daleum.inventory_logs for select using (daleum.is_admin());

-- ---------- 스토리지 버킷 ----------
insert into storage.buckets (id, name, public) values
  ('products', 'products', true),
  ('banners', 'banners', true),
  ('reviews', 'reviews', true)
on conflict (id) do nothing;

-- ---------- PostgREST 접근 권한 (신규 스키마 필수) ----------
grant usage on schema daleum to anon, authenticated, service_role;
grant all on all tables in schema daleum to anon, authenticated, service_role;
grant all on all sequences in schema daleum to anon, authenticated, service_role;
grant all on all functions in schema daleum to anon, authenticated, service_role;
alter default privileges in schema daleum grant all on tables to anon, authenticated, service_role;
alter default privileges in schema daleum grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema daleum grant all on functions to anon, authenticated, service_role;
