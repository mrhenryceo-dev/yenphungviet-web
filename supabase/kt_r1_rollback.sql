-- =====================================================================
-- YẾN PHỤNG PET — Phase 1R / R1: HOÀN TÁC migration "Kiến thức chuyên sâu"
-- Chỉ xóa các đối tượng kt_* và bucket "kien-thuc". Không đụng bảng/policy khác.
--
-- ⚠️ Xóa bảng sẽ XÓA TOÀN BỘ BÀI VIẾT. Hãy "Tải bản sao lưu" trong /quan-tri/ trước.
-- ⚠️ Bucket chỉ xóa được khi đã trống: xóa ảnh trong Storage → kien-thuc trước,
--    hoặc bỏ qua bước xóa bucket (giữ bucket không gây hại).
-- =====================================================================

begin;

drop policy if exists kt_storage_owner_select on storage.objects;
drop policy if exists kt_storage_owner_insert on storage.objects;
drop policy if exists kt_storage_owner_update on storage.objects;
drop policy if exists kt_storage_owner_delete on storage.objects;

drop table if exists public.kt_articles;          -- kéo theo policy, trigger, index của bảng
drop function if exists public.kt_articles_before_write();
drop function if exists public.kt_is_owner();

-- Bỏ dấu "--" ở dòng dưới khi bucket đã trống:
-- delete from storage.buckets where id = 'kien-thuc';

commit;

-- Gỡ quyền owner khỏi tài khoản (tùy chọn):
--   update auth.users set raw_app_meta_data = raw_app_meta_data - 'kt_role'
--    where raw_app_meta_data ->> 'kt_role' = 'owner';
