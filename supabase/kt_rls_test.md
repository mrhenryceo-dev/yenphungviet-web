# Phase 1R — Kiểm thử RLS sau khi chạy migration (R2)

Chạy **sau** khi OWNER đã duyệt và chạy `kt_r1_migration.sql`, tạo tài khoản OWNER, gán `kt_role`, tắt tự đăng ký.
Chỉ dùng anon key công khai và tài khoản thật. **Không dùng service_role.**

| # | Vai | Thao tác | Kết quả mong đợi |
|---|---|---|---|
| 1 | Khách (anon) | `GET /rest/v1/kt_articles?select=id` | Chỉ thấy bài `published` |
| 2 | Khách | `POST /rest/v1/kt_articles` | 401/403 (không có quyền insert) |
| 3 | Khách | `PATCH`, `DELETE` một bài | 401/403 |
| 4 | Khách | Upload vào bucket `kien-thuc` | Bị từ chối |
| 5 | Khách | Mở URL công khai ảnh trong bucket | 200 (bucket công khai) |
| 6 | Tài khoản đã đăng nhập nhưng **không** có `kt_role` | Đọc bài nháp / insert / update / delete / upload | Chỉ đọc được bài `published`, mọi thao tác ghi bị từ chối |
| 7 | OWNER | Tạo bài nháp, sửa, xem bài nháp | Thành công |
| 8 | OWNER | Xuất bản bài thiếu `seo_description`, `cover.path`, `sources` hoặc chưa tick checklist | Bị trigger chặn, kèm thông báo `kt: …` |
| 9 | OWNER | Xuất bản bài đủ điều kiện | `status='published'`, `published_at` được tự điền |
| 10 | OWNER | Ẩn bài, rồi kiểm tra bằng anon | Anon không còn thấy bài. URL công khai trả 404 |
| 11 | OWNER | Upload ảnh `.webp` ≤ 5 MB / file `.svg` / file 6 MB | Thành công / bị từ chối / bị từ chối |
| 12 | Bất kỳ | Kiểm tra `birds`, `leads` sau migration | Hành vi giữ nguyên như trước (anon thấy 3 bé `published`, `leads` 0 dòng) |
| 13 | Bất kỳ | Đăng ký tài khoản mới qua `/auth/v1/signup` | Bị từ chối (tự đăng ký đã tắt) |
