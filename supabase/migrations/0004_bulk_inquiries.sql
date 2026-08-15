-- ============================================================
-- 0004 — 업소용·OEM 견적 문의 창구
--
-- 배경: 4kg 벌크·페이스트 7종은 소비자가 카드로 결제하는 물건이 아니라
-- 거래처와 견적으로 오가는 B2B 원료다. 그래서 판매(0원 결제)를 닫고
-- 대신 문의를 받는 창구를 둔다.
--
-- 기존 product_inquiries 는 회원(user_id NOT NULL) + 특정 상품 전제라
-- 회원가입을 하지 않는 거래처 담당자가 쓸 수 없다. 별도 테이블로 둔다.
-- ============================================================

create table if not exists daleum.bulk_inquiries (
  id uuid primary key default gen_random_uuid(),
  -- 문의자
  company text not null,                    -- 회사/상호
  contact_name text not null,               -- 담당자명
  phone text not null,
  email text not null,
  biz_no text,                              -- 사업자등록번호 (선택)
  -- 문의 내용
  purpose text,                             -- 용도: oem / raw_material / wholesale / etc
  product_slugs text[] not null default '{}',  -- 관심 품목 (products.slug)
  volume text,                              -- 예상 물량/주기 (자유 입력)
  message text not null,
  -- 처리
  status text not null default 'new'
    check (status in ('new', 'contacted', 'quoted', 'closed', 'spam')),
  admin_memo text,
  handled_by uuid references daleum.profiles(id) on delete set null,
  handled_at timestamptz,
  -- 접수 메타 (스팸 대응용)
  source_ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_bulk_inquiries_status on daleum.bulk_inquiries(status, created_at desc);
create index if not exists idx_bulk_inquiries_created on daleum.bulk_inquiries(created_at desc);

drop trigger if exists trg_bulk_inquiries_updated on daleum.bulk_inquiries;
create trigger trg_bulk_inquiries_updated before update on daleum.bulk_inquiries
for each row execute function daleum.set_updated_at();

-- RLS: 정책을 admin 읽기/쓰기만 둔다.
-- 접수는 /api/bulk-inquiries 서버 라우트가 service role 로 처리하므로 정책이 필요 없고,
-- 정책이 없으면 anon/authenticated 의 직접 접근은 전부 거부된다 (문의 내용에 연락처가 들어가므로 의도한 동작).
alter table daleum.bulk_inquiries enable row level security;
drop policy if exists "bulk_inquiries_admin_all" on daleum.bulk_inquiries;
create policy "bulk_inquiries_admin_all" on daleum.bulk_inquiries
  for all using (daleum.is_admin()) with check (daleum.is_admin());

comment on table daleum.bulk_inquiries is '업소용·OEM 견적 문의 — 비회원 접수, 관리자만 열람';

-- 벌크 7종은 /products 판매 목록이 아니라 /b2b 안내 페이지에서 다룬다.
-- 카테고리를 비활성화해 스토어 탭에서 '대용량·업소용 0' 이 뜨지 않게 한다.
-- (상품 자체는 draft 로 남아 있고, /b2b 는 service role 로 읽는다)
update daleum.categories set is_active = false where slug = 'bulk';
