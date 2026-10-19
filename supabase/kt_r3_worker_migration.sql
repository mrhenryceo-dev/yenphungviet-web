-- =====================================================================
-- YẾN PHỤNG PET — Phase 1S / kt_r3: MÁY CHẠY VIỆC PHÍA MÁY CHỦ (Giai đoạn B)
-- - Hàng đợi việc: trạng thái "queued", bước chi tiết, khóa thuê (lease), hẹn giờ chạy lại, đếm lần thử.
-- - Hàm nhận việc nguyên tử kt_ai_claim_job (FOR UPDATE SKIP LOCKED) — CHỈ service_role gọi được.
-- - CHỐT AN TOÀN: service_role (máy chủ AI) KHÔNG được xuất bản, KHÔNG sửa bài đã công khai / đã ẩn, KHÔNG xóa bài.
-- - CHỐNG XÓA NHẦM: không ai xóa được bài đang công khai (phải Ẩn trước). Lý do OWNER loại chủ đề được ghi lại (reject_reason).
-- - Cài đặt lịch tự động kt_ai_settings: MẶC ĐỊNH TẮT; chỉ bật được khi đã đặt ngân sách tháng.
-- - Hàng đợi thông báo kt_ai_notifications (chỉ OWNER đọc).
--
-- ⚠️ CHƯA CHẠY. Chỉ chạy SAU KHI OWNER duyệt. Dự án: bird-farm (bnumqtjzbyrtavsdlleq).
-- Yêu cầu: kt_r1 + kt_r2 đã cài. KHÔNG đụng birds, leads, notify-lead, bảng/policy của App trại, Auth, Storage.
-- File này KHÔNG tạo lịch cron — lịch nằm riêng ở kt_r3_schedule_enable.sql (OWNER tự chạy khi muốn bật).
-- Chỉ cài MỘT lần. Hoàn tác: supabase/kt_r3_worker_rollback.sql (chạy TRƯỚC rollback kt_r2).
-- =====================================================================

begin;

-- 0. CHỐT CHẶN
do $$
begin
  if to_regclass('public.kt_ai_jobs') is null or to_regclass('public.kt_articles') is null then
    raise exception 'kt_r3: DỪNG — chưa cài kt_r1 / kt_r2. Không có gì thay đổi.';
  end if;
  if to_regclass('public.kt_ai_settings') is not null or to_regclass('public.kt_ai_notifications') is not null
     or to_regprocedure('public.kt_ai_claim_job(text,integer)') is not null then
    raise exception 'kt_r3: DỪNG — máy chạy việc đã được cài. Migration chỉ chạy một lần, không có gì thay đổi.';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    raise exception 'kt_r3: DỪNG — không thấy role service_role (không phải database Supabase?).';
  end if;
end $$;

-- 1. Hàng đợi việc: thêm cột + mở rộng trạng thái / bước
alter table public.kt_ai_jobs drop constraint kt_ai_jobs_status_check;
alter table public.kt_ai_jobs add constraint kt_ai_jobs_status_check
  check (status in ('proposed','queued','generating','qa','awaiting_owner','needs_changes','published','failed','rejected'));
alter table public.kt_ai_jobs drop constraint kt_ai_jobs_step_check;
alter table public.kt_ai_jobs add constraint kt_ai_jobs_step_check
  check (step in ('article','article_wait','compose','sources','images','qa','notify','done','revise','revise_wait'));
alter table public.kt_ai_jobs
  add column origin        text not null default 'owner' check (origin in ('owner','auto')),
  add column next_run_at   timestamptz default now(),
  add column lock_owner    text check (lock_owner is null or char_length(lock_owner) <= 40),
  add column run_count     integer not null default 0 check (run_count between 0 and 1000),
  add column step_attempts integer not null default 0 check (step_attempts between 0 and 10),
  add column ai_handle     jsonb check (ai_handle is null or pg_column_size(ai_handle) < 2000),
  add column source_check  jsonb check (source_check is null or pg_column_size(source_check) < 60000),
  add column error_code    text not null default '' check (char_length(error_code) <= 40),
  add column cost_usd      numeric(10,4) not null default 0 check (cost_usd >= 0),
  -- OWNER loại chủ đề / xóa bài: lý do được giữ lại để AI không đề xuất lại chủ đề này
  add column reject_reason text not null default '' check (char_length(reject_reason) <= 500);
create index kt_ai_jobs_queue_idx on public.kt_ai_jobs (status, next_run_at) where status in ('queued','generating');

-- Người dùng (OWNER qua trình duyệt) KHÔNG giữ khóa: mọi thay đổi của OWNER thả khóa → máy chủ đang chạy việc đó sẽ dừng,
-- không ghi đè lựa chọn của OWNER (vd. "Bỏ" việc). Chỉ máy chủ được đặt trạng thái "generating".
create function public.kt_ai_jobs_lock_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user <> 'service_role' then
    new.lock_owner := null;
    new.lock_until := null;
    if new.status = 'generating' and (tg_op = 'INSERT' or old.status is distinct from 'generating') then
      raise exception 'kt_r3: chỉ máy chạy việc được đặt trạng thái "generating".';
    end if;
  end if;
  return new;
end; $$;
comment on function public.kt_ai_jobs_lock_guard() is 'YẾN PHỤNG PET Phase 1S/kt_r3: OWNER thay đổi việc → thả khóa máy chủ.';
create trigger kt_ai_jobs_lock_guard before insert or update on public.kt_ai_jobs
  for each row execute function public.kt_ai_jobs_lock_guard();

-- 2. Nhận việc nguyên tử: 1 việc đến hạn, chưa bị khóa; khóa thuê p_lease_seconds (30–600 s).
create function public.kt_ai_claim_job(p_worker text, p_lease_seconds integer default 180)
returns setof public.kt_ai_jobs
language plpgsql set search_path = '' as $$
begin
  if p_worker is null or p_worker !~ '^[A-Za-z0-9_-]{1,40}$' then
    raise exception 'kt_r3: mã máy chạy việc không hợp lệ';
  end if;
  return query
  update public.kt_ai_jobs j
     set lock_owner = p_worker,
         lock_until = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 180), 600))),
         run_count  = j.run_count + 1,
         status     = 'generating'
   where j.id = (
     select q.id from public.kt_ai_jobs q
      where q.status in ('queued','generating')
        and (q.next_run_at is null or q.next_run_at <= now())
        and (q.lock_until is null or q.lock_until < now())
      order by q.next_run_at nulls first, q.created_at
      for update skip locked
      limit 1)
  returning j.*;
end; $$;
comment on function public.kt_ai_claim_job(text, integer) is 'YẾN PHỤNG PET Phase 1S/kt_r3: máy chạy việc nhận 1 việc (khóa thuê). Chỉ service_role.';
revoke all on function public.kt_ai_claim_job(text, integer) from public, anon, authenticated;
grant execute on function public.kt_ai_claim_job(text, integer) to service_role;

-- 3. CHỐT AN TOÀN cho bài viết: máy chủ AI (service_role) chỉ được tạo / sửa bài NHÁP.
--    Xuất bản vẫn chỉ OWNER làm được (RLS kt_is_owner + trigger kt_r1 bắt reviewed_by_owner).
create function public.kt_articles_ai_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user <> 'service_role' then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception 'kt_r3: máy chủ AI không được xóa bài.';
  end if;
  if tg_op = 'UPDATE' and old.status <> 'draft' then
    raise exception 'kt_r3: máy chủ AI chỉ được sửa bài nháp (bài này đang "%").', old.status;
  end if;
  if new.status <> 'draft' or new.reviewed_by_owner or new.published_at is not null then
    raise exception 'kt_r3: máy chủ AI không được xuất bản — chỉ OWNER duyệt xuất bản.';
  end if;
  return new;
end; $$;
comment on function public.kt_articles_ai_guard() is 'YẾN PHỤNG PET Phase 1S/kt_r3: service_role chỉ ghi bài nháp, không xuất bản / xóa.';
create trigger kt_articles_ai_guard before insert or update or delete on public.kt_articles
  for each row execute function public.kt_articles_ai_guard();

-- 3b. CHỐNG XÓA NHẦM BÀI ĐANG CÔNG KHAI (áp dụng cho MỌI người, kể cả OWNER): phải "Ẩn bài" trước rồi mới xóa được.
create function public.kt_articles_delete_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = 'published' then
    raise exception 'kt_r3: không xóa được bài đang công khai — hãy Ẩn bài trước rồi mới xóa.';
  end if;
  return old;
end; $$;
comment on function public.kt_articles_delete_guard() is 'YẾN PHỤNG PET Phase 1S/kt_r3: chặn xóa bài đang công khai (phải ẩn trước).';
create trigger kt_articles_delete_guard before delete on public.kt_articles
  for each row execute function public.kt_articles_delete_guard();

-- 4. Cài đặt lịch tạo bài tự động (một dòng duy nhất). MẶC ĐỊNH TẮT.
create table public.kt_ai_settings (
  id                 integer primary key default 1 check (id = 1),
  auto_enabled       boolean not null default false,
  auto_per_day       integer not null default 1 check (auto_per_day between 0 and 5),
  auto_hour          integer not null default 7 check (auto_hour between 0 and 23),
  auto_groups        jsonb not null default '[]'::jsonb check (jsonb_typeof(auto_groups) = 'array'),
  monthly_budget_usd numeric(10,2) check (monthly_budget_usd is null or (monthly_budget_usd > 0 and monthly_budget_usd <= 200)),
  updated_at         timestamptz not null default now(),
  -- không bật được lịch khi chưa đặt ngân sách tháng
  constraint kt_ai_settings_auto_needs_budget check (not auto_enabled or monthly_budget_usd is not null)
);
comment on table public.kt_ai_settings is 'YẾN PHỤNG PET Phase 1S/kt_r3: lịch tạo bài tự động (mặc định tắt) + ngân sách tháng.';
insert into public.kt_ai_settings (id) values (1);

-- 5. Hàng đợi thông báo (máy chủ ghi; OWNER đọc). Mặc định trạng thái "dry_run" — không gửi thật.
create table public.kt_ai_notifications (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  job_id     uuid references public.kt_ai_jobs(id) on delete set null,
  kind       text not null check (kind in ('awaiting_owner','qa','failed')),
  channel    text not null default 'none' check (channel in ('none','telegram')),
  status     text not null check (status in ('dry_run','sent','skipped','failed')),
  message    text not null default '' check (char_length(message) <= 4000),
  detail     text not null default '' check (char_length(detail) <= 500)
);
comment on table public.kt_ai_notifications is 'YẾN PHỤNG PET Phase 1S/kt_r3: thông báo OWNER (bài chờ duyệt / lỗi).';
create index kt_ai_notifications_at_idx on public.kt_ai_notifications (created_at desc);

-- 6. RLS + quyền
alter table public.kt_ai_settings enable row level security;
alter table public.kt_ai_notifications enable row level security;
create policy kt_ai_settings_owner_read on public.kt_ai_settings for select to authenticated using (public.kt_is_owner());
create policy kt_ai_settings_owner_update on public.kt_ai_settings for update to authenticated using (public.kt_is_owner()) with check (public.kt_is_owner());
create policy kt_ai_notif_owner_read on public.kt_ai_notifications for select to authenticated using (public.kt_is_owner());
revoke all on public.kt_ai_settings, public.kt_ai_notifications from anon, authenticated;
grant select, update on public.kt_ai_settings to authenticated;
grant select on public.kt_ai_notifications to authenticated;
-- máy chủ (service_role): ghi việc / bài nháp / phiên bản / chi phí / thông báo; đọc cài đặt. Không có quyền xóa bài.
grant select, insert, update on public.kt_ai_jobs, public.kt_article_versions to service_role;
grant select, insert on public.kt_ai_usage, public.kt_ai_notifications to service_role;
grant select on public.kt_ai_settings to service_role;
grant select, insert, update on public.kt_articles to service_role;

commit;

-- Kiểm tra sau khi chạy (mong đợi: t | f | 3):
--   select to_regprocedure('public.kt_ai_claim_job(text,integer)') is not null as co_ham_nhan_viec,
--          (select auto_enabled from public.kt_ai_settings where id = 1) as lich_tu_dong,
--          (select count(*) from pg_policies where policyname like 'kt\_ai\_settings%' or policyname like 'kt\_ai\_notif%') as so_policy;
