-- YẾN PHỤNG PET — hoàn tác kt_r3 (máy chạy việc). KHÔNG xóa bài viết, việc, phiên bản hay nhật ký chi phí.
-- Chạy TRƯỚC kt_r2_ai_rollback.sql nếu muốn gỡ cả Xưởng. Gỡ lịch cron trước: kt_r3_schedule_disable.sql.
begin;
drop trigger if exists kt_articles_ai_guard on public.kt_articles;
drop function if exists public.kt_articles_ai_guard();
drop function if exists public.kt_ai_claim_job(text, integer);
drop trigger if exists kt_ai_jobs_lock_guard on public.kt_ai_jobs;
drop function if exists public.kt_ai_jobs_lock_guard();
drop table if exists public.kt_ai_notifications;
drop table if exists public.kt_ai_settings;
-- đưa việc về trạng thái / bước mà kt_r2 hiểu
update public.kt_ai_jobs set status = 'failed', error = 'Máy chạy việc đã được gỡ (kt_r3 rollback).' where status in ('queued','generating');
update public.kt_ai_jobs set step = case when step in ('article_wait','revise','revise_wait') then 'article' when step in ('sources','notify') then 'qa' else step end;
alter table public.kt_ai_jobs drop constraint kt_ai_jobs_status_check;
alter table public.kt_ai_jobs add constraint kt_ai_jobs_status_check
  check (status in ('proposed','generating','qa','awaiting_owner','needs_changes','published','failed','rejected'));
alter table public.kt_ai_jobs drop constraint kt_ai_jobs_step_check;
alter table public.kt_ai_jobs add constraint kt_ai_jobs_step_check check (step in ('article','compose','images','qa','done'));
drop index if exists public.kt_ai_jobs_queue_idx;
alter table public.kt_ai_jobs drop column origin, drop column next_run_at, drop column lock_owner, drop column run_count,
  drop column step_attempts, drop column ai_handle, drop column source_check, drop column error_code, drop column cost_usd;
commit;
