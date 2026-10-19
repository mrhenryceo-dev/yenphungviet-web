-- YẾN PHỤNG PET — TẮT nhịp máy chạy việc (gỡ lịch pg_cron) + xóa khóa trong Vault. Không xóa bài / việc.
-- Tắt nhanh hơn nữa (không cần SQL): đặt Secret KT_AI_ENABLED=0 → Edge Function từ chối mọi lần chạy.
select cron.unschedule('kt-ai-tick') where exists (select 1 from cron.job where jobname = 'kt-ai-tick');
delete from vault.secrets where name in ('kt_worker_secret', 'kt_anon_key');
