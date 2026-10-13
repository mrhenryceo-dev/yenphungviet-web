-- =====================================================================
-- YẾN PHỤNG PET — Phase 1R / R1: "KIẾN THỨC CHUYÊN SÂU"
-- Migration: bảng bài viết, bucket ảnh, RLS cho MỘT OWNER duy nhất.
--
-- ⚠️ CHƯA CHẠY. OWNER đọc và duyệt trước, rồi chạy trong Supabase → SQL Editor.
-- Dự án đích: bird-farm (bnumqtjzbyrtavsdlleq) — DÙNG CHUNG với App quản lý trại.
-- Chỉ TẠO MỚI các đối tượng có tiền tố kt_ và bucket "kien-thuc".
-- KHÔNG sửa birds, leads, notify-lead, bảng của App trại hay bất kỳ policy hiện có nào.
-- KHÔNG đổi cài đặt Auth (không tắt đăng ký — App trại có thể cần).
-- Hoàn tác: supabase/kt_r1_rollback.sql
--
-- CƠ CHẾ CHẠY LẠI: migration CHỈ CÀI MỘT LẦN, KHÔNG ghi đè.
--   - Lần đầu: database phải SẠCH — không có đối tượng kt_* nào, không có bucket "kien-thuc".
--   - Chạy lại khi đã cài: DỪNG ở mục 0, không thay đổi gì (kể cả khi tên/cấu hình giống hệt).
--   - Muốn cài lại: chạy kt_r1_rollback.sql → xóa bucket "kien-thuc" (đã trống) trong Dashboard → chạy file này.
--   - Hai lớp bảo vệ: (1) chốt mục 0; (2) mọi lệnh tạo đều là CREATE thuần (không OR REPLACE /
--     IF NOT EXISTS / DROP IF EXISTS / ON CONFLICT) → nếu vẫn có đối tượng trùng tên, Postgres báo lỗi
--     và cả giao dịch bị hủy.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. CHỐT CHẶN: database phải sạch. Có BẤT KỲ đối tượng kt_* hoặc bucket "kien-thuc" nào → DỪNG.
--    Không phân biệt "của Phase 1R" hay "của App khác": không ghi đè gì cả. Khối này không sửa gì.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.kt_articles') is not null then
    raise exception 'kt: DỪNG — Phase 1R đã được cài (có public.kt_articles). Migration chỉ chạy một lần, không có gì bị thay đổi. Muốn cài lại: chạy kt_r1_rollback.sql trước.';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname like 'kt\_%') then
    raise exception 'kt: DỪNG — đã có hàm public.kt_*. Không chạy tiếp.';
  end if;
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relname like 'kt\_%') then
    raise exception 'kt: DỪNG — đã có bảng/chỉ mục/đối tượng public.kt_*. Không chạy tiếp.';
  end if;
  if exists (select 1 from pg_trigger where tgname like 'kt\_%') then
    raise exception 'kt: DỪNG — đã có trigger tên kt_*. Không chạy tiếp.';
  end if;
  if exists (select 1 from pg_policies where policyname like 'kt\_%') then
    raise exception 'kt: DỪNG — đã có policy tên kt_*. Không chạy tiếp.';
  end if;
  if exists (select 1 from storage.buckets where id = 'kien-thuc' or name = 'kien-thuc') then
    raise exception 'kt: DỪNG — bucket "kien-thuc" đã tồn tại (bất kể cấu hình). Không chạy tiếp.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Hàm xác định OWNER: dựa vào app_metadata (chỉ đổi được từ server / SQL,
--    người dùng KHÔNG tự sửa được qua API). Đăng nhập thôi KHÔNG đủ quyền.
--    - app_metadata.kt_role = 'owner'                → là OWNER
--    - app_metadata.kt_mfa  = 'required' (bật sau khi OWNER đã đăng ký MFA)
--                                                    → bắt buộc phiên đã xác thực 2 lớp (aal2)
-- ---------------------------------------------------------------------
create function public.kt_is_owner()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'kt_role') = 'owner', false)
     and (
       coalesce((auth.jwt() -> 'app_metadata' ->> 'kt_mfa') = 'required', false) = false
       or coalesce((auth.jwt() ->> 'aal') = 'aal2', false)
     );
$$;

comment on function public.kt_is_owner() is
  'YẾN PHỤNG PET Phase 1R: true khi JWT có app_metadata.kt_role = owner (và aal2 nếu app_metadata.kt_mfa = required).';

-- ---------------------------------------------------------------------
-- 2. Bảng bài viết
-- ---------------------------------------------------------------------
create table public.kt_articles (
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

create index kt_articles_public_idx
  on public.kt_articles (status, topic, published_at desc);

-- ---------------------------------------------------------------------
-- 3. Trigger: tự cập nhật updated_at, chặn xuất bản khi thiếu thông tin
-- ---------------------------------------------------------------------
create function public.kt_articles_before_write()
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

comment on function public.kt_articles_before_write() is
  'YẾN PHỤNG PET Phase 1R: cập nhật updated_at, chặn xuất bản khi thiếu thông tin.';

create trigger kt_articles_before_write
  before insert or update on public.kt_articles
  for each row execute function public.kt_articles_before_write();

-- ---------------------------------------------------------------------
-- 4. RLS: khách chỉ đọc bài đã xuất bản; OWNER toàn quyền
-- ---------------------------------------------------------------------
alter table public.kt_articles enable row level security;

create policy kt_articles_public_read on public.kt_articles
  for select to anon, authenticated
  using (status = 'published');

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
        array['image/webp','image/jpeg','image/png']);

create policy kt_storage_owner_select on storage.objects
  for select to authenticated
  using (bucket_id = 'kien-thuc' and public.kt_is_owner());

create policy kt_storage_owner_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'kien-thuc' and public.kt_is_owner());

create policy kt_storage_owner_update on storage.objects
  for update to authenticated
  using (bucket_id = 'kien-thuc' and public.kt_is_owner())
  with check (bucket_id = 'kien-thuc' and public.kt_is_owner());

create policy kt_storage_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'kien-thuc' and public.kt_is_owner());

-- ---------------------------------------------------------------------
-- 6. CHỐT RESTRICTIVE cho bucket "kien-thuc" (database dùng chung với App trại)
--    Policy permissive được CỘNG DỒN: nếu App trại có policy rộng (vd. authenticated ghi mọi bucket),
--    người lạ vẫn có thể ghi vào kien-thuc. Policy RESTRICTIVE được AND với mọi policy khác,
--    nên ở bucket kien-thuc chỉ OWNER qua được. Bucket khác: điều kiện luôn đúng → App trại KHÔNG bị ảnh hưởng.
-- ---------------------------------------------------------------------
create policy kt_storage_guard_select on storage.objects
  as restrictive for select to public
  using (bucket_id <> 'kien-thuc' or public.kt_is_owner());

create policy kt_storage_guard_insert on storage.objects
  as restrictive for insert to public
  with check (bucket_id <> 'kien-thuc' or public.kt_is_owner());

create policy kt_storage_guard_update on storage.objects
  as restrictive for update to public
  using (bucket_id <> 'kien-thuc' or public.kt_is_owner())
  with check (bucket_id <> 'kien-thuc' or public.kt_is_owner());

create policy kt_storage_guard_delete on storage.objects
  as restrictive for delete to public
  using (bucket_id <> 'kien-thuc' or public.kt_is_owner());

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
-- BƯỚC 3 — KHÔNG tắt "Allow new users to sign up" trên bird-farm (App quản lý trại có thể cần).
--   Quyền OWNER không phụ thuộc cài đặt này: người tự đăng ký KHÔNG tự gán được app_metadata.kt_role.
--
-- BƯỚC 4 — (Khuyến nghị) SAU KHI OWNER đã đăng ký MFA trong /quan-tri/ và đăng nhập được bằng mã OTP:
--   update auth.users
--      set raw_app_meta_data = raw_app_meta_data || '{"kt_mfa":"required"}'::jsonb
--    where email = '<EMAIL_OWNER>';
--   → Từ đây mọi thao tác ghi bài/ảnh đều phải có phiên xác thực 2 lớp (aal2).
--   Gỡ (nếu mất điện thoại):  set raw_app_meta_data = raw_app_meta_data - 'kt_mfa'
-- =====================================================================
