-- =====================================================================
-- YẾN PHỤNG PET — Supabase RIÊNG CHO WEBSITE (yenphungpet-web)
-- web_02: bảng birds (chim đăng bán) + leads (khách để lại thông tin)
--
-- ⚠️ CHƯA CHẠY. Dành cho GIAI ĐOẠN 3 (chuyển chim + form) — KHÔNG cần cho Phase 1R.
-- Chạy SAU kt_r1_migration.sql (dùng lại hàm public.kt_is_owner()).
-- CHỈ chạy trên dự án yenphungpet-web. KHÔNG chạy trên bird-farm hay yenphungpet-v2-staging.
-- Cấu trúc leads cần đối chiếu lại với bảng leads cũ + mã notify-lead trước khi chạy.
-- Hoàn tác: supabase/web_02_rollback.sql
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. birds — giữ đúng 19 cột website đang đọc (assets/js/birds.js), thêm price_unit + updated_at
-- ---------------------------------------------------------------------
create table if not exists public.birds (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique check (char_length(code) between 1 and 30),
  name              text,
  bird_line         text,
  color_name        text,
  age_text          text,
  sex_text          text,
  self_feeding_text text,
  tame_level        text,
  price             numeric(12,0) check (price >= 0),
  price_unit        text check (price_unit in ('con','cap')),
  short_description text check (char_length(short_description) <= 1000),
  image_url         text,
  gallery_urls      text[] not null default '{}',
  video_url         text,
  status            text not null default 'available' check (status in ('available','held','sold','watch')),
  featured          boolean not null default false,
  display_order     integer not null default 0,
  published         boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table public.birds is 'YẾN PHỤNG PET website: chim đăng bán. Khách chỉ đọc dòng published = true.';
create index if not exists birds_public_idx on public.birds (published, display_order, created_at desc);

create or replace function public.web_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end; $$;

drop trigger if exists birds_touch on public.birds;
create trigger birds_touch before update on public.birds
  for each row execute function public.web_touch_updated_at();

alter table public.birds enable row level security;
drop policy if exists birds_public_read on public.birds;
create policy birds_public_read on public.birds
  for select to anon, authenticated using (published);
drop policy if exists birds_owner_all on public.birds;
create policy birds_owner_all on public.birds
  for all to authenticated using (public.kt_is_owner()) with check (public.kt_is_owner());

revoke all on public.birds from anon, authenticated;
grant select on public.birds to anon;
grant select, insert, update, delete on public.birds to authenticated;

-- ---------------------------------------------------------------------
-- 2. leads — khách KHÔNG đọc/ghi trực tiếp. Chỉ Edge Function notify-lead (service_role) được thêm dòng.
--    OWNER đọc/cập nhật trạng thái qua trang quản trị.
-- ---------------------------------------------------------------------
create table if not exists public.leads (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  full_name        text not null check (char_length(full_name) between 1 and 120),
  contact          text not null check (char_length(contact) between 3 and 120),
  province         text not null default '' check (char_length(province) <= 120),
  bird_code        text not null default '' check (char_length(bird_code) <= 60),
  interest_type    text not null default '' check (char_length(interest_type) <= 120),
  budget_range     text not null default '' check (char_length(budget_range) <= 120),
  experience_level text not null default '' check (char_length(experience_level) <= 120),
  customer_note    text not null default '' check (char_length(customer_note) <= 2000),
  source_page      text not null default '' check (char_length(source_page) <= 500),
  source           text not null default '' check (char_length(source) <= 60),
  status           text not null default 'new' check (status in ('new','contacted','closed','spam')),
  owner_note       text not null default '' check (char_length(owner_note) <= 2000)
);
comment on table public.leads is 'YẾN PHỤNG PET website: khách để lại thông tin. Dữ liệu cá nhân — chỉ OWNER đọc.';
create index if not exists leads_created_idx on public.leads (created_at desc);

alter table public.leads enable row level security;
drop policy if exists leads_owner_read on public.leads;
create policy leads_owner_read on public.leads
  for select to authenticated using (public.kt_is_owner());
drop policy if exists leads_owner_update on public.leads;
create policy leads_owner_update on public.leads
  for update to authenticated using (public.kt_is_owner()) with check (public.kt_is_owner());
drop policy if exists leads_owner_delete on public.leads;
create policy leads_owner_delete on public.leads
  for delete to authenticated using (public.kt_is_owner());

revoke all on public.leads from anon, authenticated;
grant select, update, delete on public.leads to authenticated;   -- không có INSERT: chỉ service_role (Edge Function)

commit;
