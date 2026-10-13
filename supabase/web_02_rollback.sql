-- Hoàn tác web_02_birds_leads.sql trên yenphungpet-web.
-- ⚠️ XÓA LUÔN DỮ LIỆU birds VÀ leads. Xuất CSV (Table Editor → Export) TRƯỚC khi chạy.
-- Không đụng các đối tượng kt_* của Phase 1R.
begin;
drop table if exists public.leads;
drop table if exists public.birds;
drop function if exists public.web_touch_updated_at();
commit;
