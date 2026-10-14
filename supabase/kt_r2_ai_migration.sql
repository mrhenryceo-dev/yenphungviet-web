-- =====================================================================
-- YẾN PHỤNG PET — Phase 1S / kt_r2: "XƯỞNG NỘI DUNG AI"
-- Thêm 3 bảng owner-only: việc tạo bài (kt_ai_jobs), phiên bản bài (kt_article_versions),
-- ghi nhận chi phí AI (kt_ai_usage).
--
-- ⚠️ CHƯA CHẠY. Chỉ chạy SAU KHI OWNER duyệt. Dự án: bird-farm (bnumqtjzbyrtavsdlleq).
-- Yêu cầu: kt_r1_migration.sql đã cài (dùng lại public.kt_articles và public.kt_is_owner()).
-- KHÔNG sửa kt_articles, birds, leads, notify-lead, bảng/policy của App trại, cài đặt Auth hay Storage.
-- Chỉ cài MỘT lần: có bất kỳ đối tượng nào trùng tên → DỪNG, không thay đổi gì.
-- Hoàn tác: supabase/kt_r2_ai_rollback.sql (phải chạy TRƯỚC nếu muốn hoàn tác kt_r1).
-- =====================================================================

begin;

-- 0. CHỐT CHẶN
do $$
begin
  if to_regclass('public.kt_articles') is null or to_regprocedure('public.kt_is_owner()') is null then
    raise exception 'kt_r2: DỪNG — chưa cài kt_r1 (thiếu kt_articles / kt_is_owner). Không có gì thay đổi.';
  end if;
  if to_regclass('public.kt_ai_jobs') is not null or to_regclass('public.kt_article_versions') is not null or to_regclass('public.kt_ai_usage') is not null then
    raise exception 'kt_r2: DỪNG — Xưởng nội dung đã được cài. Migration chỉ chạy một lần, không có gì thay đổi.';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('kt_ai_jobs_before_write')) then
    raise exception 'kt_r2: DỪNG — đã có hàm kt_ai_jobs_before_write. Không chạy tiếp.';
  end if;
  if exists (select 1 from pg_policies where policyname like 'kt\_ai\_%' or policyname like 'kt\_ver\_%') then
    raise exception 'kt_r2: DỪNG — đã có policy kt_ai_* / kt_ver_*. Không chạy tiếp.';
  end if;
end $$;

-- 1. Việc tạo bài
create table public.kt_ai_jobs (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  status        text not null default 'proposed'
                check (status in ('proposed','generating','qa','awaiting_owner','needs_changes','published','failed','rejected')),
  title         text not null check (char_length(title) between 3 and 200),
  grp           text not null default 'nguoi-moi' check (grp ~ '^[a-z0-9-]{2,40}$'),
  angle         text not null default '' check (char_length(angle) <= 500),
  notes         text not null default '' check (char_length(notes) <= 20000),
  risk          jsonb not null default '[]'::jsonb check (jsonb_typeof(risk) = 'array'),
  step          text not null default 'article' check (step in ('article','compose','images','qa','done')),
  attempts      integer not null default 0 check (attempts between 0 and 10),
  lock_until    timestamptz,
  article_id    uuid references public.kt_articles(id) on delete set null,
  pkg           jsonb check (pkg is null or pg_column_size(pkg) < 400000),
  pkg_warnings  jsonb not null default '[]'::jsonb,
  qa            jsonb,
  provider      jsonb not null default '{}'::jsonb,
  images_total  integer not null default 0 check (images_total between 0 and 20),
  images_done   integer not null default 0 check (images_done between 0 and 20),
  image_errors  jsonb not null default '[]'::jsonb,
  owner_note    text not null default '' check (char_length(owner_note) <= 4000),
  error         text not null default '' check (char_length(error) <= 2000),
  history       jsonb not null default '[]'::jsonb check (jsonb_typeof(history) = 'array')
);
comment on table public.kt_ai_jobs is 'YẾN PHỤNG PET Phase 1S: việc tạo bài của Xưởng nội dung AI (chỉ OWNER).';
create index kt_ai_jobs_status_idx on public.kt_ai_jobs (status, updated_at desc);

-- Trigger: cập nhật updated_at; chỉ cho trạng thái "published" khi bài liên kết ĐÃ được xuất bản thật.
create function public.kt_ai_jobs_before_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  -- chỉ kiểm tra khi CHUYỂN sang "published" (không chặn việc xóa bài → article_id tự về null)
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published')
     and not exists (select 1 from public.kt_articles a where a.id = new.article_id and a.status = 'published') then
    raise exception 'kt_r2: việc chỉ được đánh dấu "Đã xuất bản" khi OWNER đã xuất bản bài.';
  end if;
  return new;
end; $$;
comment on function public.kt_ai_jobs_before_write() is 'YẾN PHỤNG PET Phase 1S: updated_at + chặn đánh dấu xuất bản giả.';
create trigger kt_ai_jobs_before_write before insert or update on public.kt_ai_jobs
  for each row execute function public.kt_ai_jobs_before_write();

-- 2. Phiên bản bài (mỗi lần AI tạo / AI sửa / OWNER yêu cầu sửa / khôi phục)
create table public.kt_article_versions (
  id          uuid primary key default gen_random_uuid(),
  article_id  uuid not null references public.kt_articles(id) on delete cascade,
  version     integer not null check (version > 0),
  author      text not null check (author in ('ai','owner')),
  note        text not null default '' check (char_length(note) <= 4000),
  snapshot    jsonb not null check (jsonb_typeof(snapshot) = 'object' and pg_column_size(snapshot) < 600000),
  created_at  timestamptz not null default now(),
  unique (article_id, version)
);
comment on table public.kt_article_versions is 'YẾN PHỤNG PET Phase 1S: lịch sử phiên bản bài Kiến thức (chỉ OWNER).';

-- 3. Ghi nhận chi phí AI (Edge Function ghi bằng JWT của OWNER — không cần service_role)
create table public.kt_ai_usage (
  id          uuid primary key default gen_random_uuid(),
  at          timestamptz not null default now(),
  task        text not null check (task in ('suggest','article','revise','image')),
  kind        text not null check (kind in ('text','image')),
  provider    text not null default '' check (char_length(provider) <= 40),
  model       text not null default '' check (char_length(model) <= 80),
  tokens_in   integer not null default 0 check (tokens_in >= 0),
  tokens_out  integer not null default 0 check (tokens_out >= 0),
  images      integer not null default 0 check (images between 0 and 20),
  cost_usd    numeric(10,4) check (cost_usd is null or cost_usd >= 0),
  ok          boolean not null default false,
  error       text check (error is null or char_length(error) <= 500),
  job_id      uuid
);
comment on table public.kt_ai_usage is 'YẾN PHỤNG PET Phase 1S: nhật ký gọi AI + chi phí ước tính (chỉ OWNER).';
create index kt_ai_usage_at_idx on public.kt_ai_usage (at desc);

-- 4. RLS: CHỈ OWNER (kt_is_owner(): app_metadata.kt_role = owner, + aal2 nếu kt_mfa = required)
alter table public.kt_ai_jobs enable row level security;
alter table public.kt_article_versions enable row level security;
alter table public.kt_ai_usage enable row level security;

create policy kt_ai_jobs_owner_all on public.kt_ai_jobs for all to authenticated
  using (public.kt_is_owner()) with check (public.kt_is_owner());
create policy kt_ver_owner_all on public.kt_article_versions for all to authenticated
  using (public.kt_is_owner()) with check (public.kt_is_owner());
create policy kt_ai_usage_owner_read on public.kt_ai_usage for select to authenticated using (public.kt_is_owner());
create policy kt_ai_usage_owner_insert on public.kt_ai_usage for insert to authenticated with check (public.kt_is_owner());

revoke all on public.kt_ai_jobs, public.kt_article_versions, public.kt_ai_usage from anon, authenticated;
grant select, insert, update, delete on public.kt_ai_jobs, public.kt_article_versions to authenticated;
grant select, insert on public.kt_ai_usage to authenticated;      -- nhật ký chi phí: không sửa / xóa qua API

commit;

-- Kiểm tra sau khi chạy (mong đợi: 3 | 4):
--   select (select count(*) from pg_tables where tablename in ('kt_ai_jobs','kt_article_versions','kt_ai_usage')) as bang,
--          (select count(*) from pg_policies where policyname like 'kt\_ai\_%' or policyname like 'kt\_ver\_%') as so_policy;
