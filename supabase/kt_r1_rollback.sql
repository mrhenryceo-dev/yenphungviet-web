-- =====================================================================
-- YẾN PHỤNG PET — Phase 1R / R1: HOÀN TÁC migration "Kiến thức chuyên sâu"
-- Chỉ xóa các đối tượng kt_* (bảng, hàm, trigger, 10 policy). Không đụng bảng/policy khác.
--
-- ⚠️ Xóa bảng sẽ XÓA TOÀN BỘ BÀI VIẾT. Hãy "Tải bản sao lưu" trong /quan-tri/ trước.
-- ⚠️ Bucket "kien-thuc" KHÔNG bị xóa ở đây (Supabase có thể chặn xóa trực tiếp bằng SQL).
--    Migration chỉ cài một lần và DỪNG nếu bucket còn tồn tại → muốn cài lại phải xóa bucket:
--    Dashboard → Storage → kien-thuc → xóa hết ảnh → ⋯ → Delete bucket.
-- =====================================================================

begin;

drop policy if exists kt_storage_owner_select on storage.objects;
drop policy if exists kt_storage_owner_insert on storage.objects;
drop policy if exists kt_storage_owner_update on storage.objects;
drop policy if exists kt_storage_owner_delete on storage.objects;
drop policy if exists kt_storage_guard_select on storage.objects;
drop policy if exists kt_storage_guard_insert on storage.objects;
drop policy if exists kt_storage_guard_update on storage.objects;
drop policy if exists kt_storage_guard_delete on storage.objects;

drop table if exists public.kt_articles;          -- kéo theo 2 policy, trigger, index của bảng
drop function if exists public.kt_articles_before_write();
drop function if exists public.kt_is_owner();

commit;

-- Gỡ quyền owner khỏi tài khoản (tùy chọn):
--   update auth.users set raw_app_meta_data = raw_app_meta_data - 'kt_role' - 'kt_mfa'
--    where raw_app_meta_data ->> 'kt_role' = 'owner';
