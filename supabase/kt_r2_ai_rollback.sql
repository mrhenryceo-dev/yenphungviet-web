-- Hoàn tác kt_r2_ai_migration.sql (Xưởng nội dung AI).
-- ⚠️ XÓA lịch sử việc tạo bài, phiên bản bài và nhật ký chi phí. BÀI VIẾT (kt_articles) KHÔNG bị xóa.
-- Chạy file này TRƯỚC kt_r1_rollback.sql nếu muốn gỡ toàn bộ (kt_r1 không gỡ được khi còn bảng phụ thuộc).
begin;
drop table if exists public.kt_ai_usage;
drop table if exists public.kt_article_versions;
drop table if exists public.kt_ai_jobs;            -- kéo theo trigger, policy, index
drop function if exists public.kt_ai_jobs_before_write();
commit;
