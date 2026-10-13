-- =====================================================================
-- YẾN PHỤNG PET — Phase 1R / R1: "KIẾN THỨC CHUYÊN SÂU"
-- Migration: bảng bài viết, bucket ảnh, RLS cho MỘT OWNER duy nhất.
--
-- ⚠️ CHƯA CHẠY. OWNER đọc và duyệt trước, rồi chạy trong Supabase → SQL Editor.
-- Chỉ TẠO MỚI các đối tượng có tiền tố kt_ và bucket "kien-thuc".
-- KHÔNG sửa birds, leads, notify-lead hay bất kỳ policy hiện có nào.
-- Hoàn tác: supabase/kt_r1_rollback.sql
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Hàm xác định OWNER: dựa vào app_metadata (chỉ đổi được từ server).
--    Đăng nhập thôi KHÔNG đủ quyền; phải có app_metadata.kt_role = 'owner'.
-- ---------------------------------------------------------------------
create or replace function public.kt_is_owner()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'kt_role') = 'owner', false);
$$;

comment on function public.kt_is_owner() is
  'YẾN PHỤNG PET Phase 1R: true khi JWT có app_metadata.kt_role = owner.';

-- ---------------------------------------------------------------------
-- 2. Bảng bài viết
-- ---------------------------------------------------------------------
create table if not exists public.kt_articles (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique
                    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 80),
  topic             text not null default 'co-ban'
                    check (topic in ('co-ban','gioi-tinh-nhan-dang','dinh-duong',
                                     'cham-soc-suc-khoe','sinh-san-genetics','avi-moi-truong')),
  title             text not null check (char_length(title) between 3 and 140),
  subtitle          text not null default '' check (char_length(subtitle) <= 220),
  excerpt           text not null default '' check (char_length(excerpt) <= 300),
  seo_title         text not null default '' check (char_length(seo_title) <= 70),
  seo_description   text not null default '' check (char_length(seo_description) <= 170),
  cover             jsonb not null default '{}'::jsonb check (jsonb_typeof(cover) = 'object'),
  blocks            jsonb not null default '[]'::jsonb
                    check (jsonb_typeof(blocks) = 'array' and jsonb_array_length(blocks) <= 200),
  sources           jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  reviewed_by_owner boolean not null default false,
  status            text not null default 'draft' check (status in ('draft','published','hidden')),
  published_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.kt_articles is
  'YẾN PHỤNG PET Phase 1R: bài viết Kiến thức chuyên sâu. Nội dung lưu dạng JSON blocks.';

create index if not exists kt_articles_public_idx
  on public.kt_articles (status, topic, published_at desc);

-- ---------------------------------------------------------------------
-- 3. Trigger: tự cập nhật updated_at, chặn xuất bản khi thiếu thông tin
-- ---------------------------------------------------------------------
create or replace function public.kt_articles_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.status = 'published' then
    if coalesce(new.seo_description, '') = '' then
      raise exception 'kt: thiếu mô tả SEO (seo_description)';
    end if;
    if coalesce(new.cover ->> 'path', '') = '' then
      raise exception 'kt: thiếu ảnh bìa (cover.path)';
    end if;
    if jsonb_array_length(new.sources) < 1 then
      raise exception 'kt: cần ít nhất 1 nguồn tham khảo (sources)';
    end if;
    if not new.reviewed_by_owner then
      raise exception 'kt: OWNER chưa xác nhận checklist chuyên môn (reviewed_by_owner)';
    end if;
    if new.published_at is null then
      new.published_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists kt_articles_before_write on public.kt_articles;
create trigger kt_articles_before_write
  before insert or update on public.kt_articles
  for each row execute function public.kt_articles_before_write();

-- ---------------------------------------------------------------------
-- 4. RLS: khách chỉ đọc bài đã xuất bản; OWNER toàn quyền
-- ---------------------------------------------------------------------
alter table public.kt_articles enable row level security;

drop policy if exists kt_articles_public_read on public.kt_articles;
create policy kt_articles_public_read on public.kt_articles
  for select to anon, authenticated
  using (status = 'published');

drop policy if exists kt_articles_owner_all on public.kt_articles;
create policy kt_articles_owner_all on public.kt_articles
  for all to authenticated
  using (public.kt_is_owner())
  with check (public.kt_is_owner());

revoke all on public.kt_articles from anon, authenticated;
grant select on public.kt_articles to anon;
grant select, insert, update, delete on public.kt_articles to authenticated;

-- ---------------------------------------------------------------------
-- 5. Bucket ảnh "kien-thuc": đọc công khai, chỉ OWNER được ghi/xóa
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kien-thuc', 'kien-thuc', true, 5242880,
        array['image/webp','image/jpeg','image/png'])
on conflict (id) do nothing;

drop policy if exists kt_storage_owner_select on storage.objects;
create policy kt_storage_owner_select on storage.objects
  for select to authenticated
  using (bucket_id = 'kien-thuc' and public.kt_is_owner());

drop policy if exists kt_storage_owner_insert on storage.objects;
create policy kt_storage_owner_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'kien-thuc' and public.kt_is_owner());

drop policy if exists kt_storage_owner_update on storage.objects;
create policy kt_storage_owner_update on storage.objects
  for update to authenticated
  using (bucket_id = 'kien-thuc' and public.kt_is_owner())
  with check (bucket_id = 'kien-thuc' and public.kt_is_owner());

drop policy if exists kt_storage_owner_delete on storage.objects;
create policy kt_storage_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'kien-thuc' and public.kt_is_owner());

commit;

-- =====================================================================
-- BƯỚC 2 — CHẠY RIÊNG, SAU KHI OWNER ĐÃ TẠO TÀI KHOẢN
-- (Supabase → Authentication → Users → Add user, dùng email của OWNER)
-- Thay <EMAIL_OWNER> bằng email thật rồi chạy:
--
--   update auth.users
--      set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"kt_role":"owner"}'::jsonb
--    where email = '<EMAIL_OWNER>';
--
-- Kiểm tra (phải trả về đúng 1 dòng):
--   select id, email, raw_app_meta_data ->> 'kt_role' as kt_role
--     from auth.users where raw_app_meta_data ->> 'kt_role' = 'owner';
--
-- Sau khi gán quyền, OWNER đăng xuất rồi đăng nhập lại /quan-tri/ để nhận JWT mới.
--
-- BƯỚC 3 — TRONG DASHBOARD (không phải SQL):
--   Authentication → Sign In / Providers → TẮT "Allow new users to sign up".
--   (Khuyến nghị) bật MFA TOTP cho tài khoản OWNER.
-- =====================================================================
