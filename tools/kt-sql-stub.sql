-- Phase 1R — MÔ PHỎNG TỐI THIỂU môi trường Supabase để chạy thử migration trên Postgres local (PGlite).
-- KHÔNG dùng cho Supabase thật. Chỉ dựng đủ: role anon/authenticated, auth.jwt(), auth.users,
-- storage.buckets/objects, và bảng birds/leads giả để kiểm tra migration không đụng tới chúng.

create role anon nologin;
create role authenticated nologin;

create schema auth;
grant usage on schema auth to anon, authenticated;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
grant execute on function auth.jwt() to anon, authenticated;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
-- Như Supabase: người dùng API không có quyền trên auth.users.

create schema storage;
grant usage on schema storage to anon, authenticated;
create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, metadata jsonb);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to anon, authenticated;
insert into storage.buckets (id, name, public) values ('Halan', 'Halan', true);   -- bucket cũ có sẵn

grant usage on schema public to anon, authenticated;
create table public.birds (id serial primary key, code text, published boolean);
alter table public.birds enable row level security;
create policy birds_public_read on public.birds for select to anon using (published);
grant select on public.birds to anon;
insert into public.birds (code, published) values ('YP003', true), ('YP002', true), ('001', true), ('NHAP', false);
create table public.leads (id serial primary key, contact text);
alter table public.leads enable row level security;
create policy leads_insert on public.leads for insert to anon with check (true);
grant insert on public.leads to anon;
insert into public.leads (contact) values ('khach-mau-1'), ('khach-mau-2');

-- Mô phỏng App quản lý trại dùng CHUNG database (bird-farm): bảng riêng + policy Storage riêng cho bucket của App.
create table public.flight_cages (id serial primary key, name text);
alter table public.flight_cages enable row level security;
create policy farm_cages_staff on public.flight_cages for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.flight_cages to authenticated;
grant usage on sequence public.flight_cages_id_seq to authenticated;
insert into public.flight_cages (name) values ('Chuồng bay 1');
create policy farm_halan_read on storage.objects for select to anon, authenticated using (bucket_id = 'Halan');
