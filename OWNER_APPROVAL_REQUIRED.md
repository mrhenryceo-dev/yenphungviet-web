# OWNER APPROVAL REQUIRED — các việc Claude KHÔNG tự làm

Mỗi mục cần OWNER trả lời "Duyệt" / "Không" (hoặc tự thao tác). Sắp theo thứ tự nên làm.

| # | Việc | Ảnh hưởng | Ai làm | Ghi chú |
|---|---|---|---|---|
| 1 | Đọc 3 bài mẫu + "Ghi chú biên tập" (điểm chưa xác minh) | Nội dung chuyên môn | OWNER | Xem local hoặc Preview. Đối chiếu Knowledge / MASTER LIST 4.2 |
| 2 | Push `feature/phase1r-kien-thuc` (`fb7309a`: giao diện tạp chí, mục lục, link đúng môi trường, CSP) | GitHub (repo PUBLIC) + Preview mới | Claude sau khi duyệt | Không đụng `main` |
| 3 | Push `feature/phase1s-ai-factory` để có Preview Xưởng | GitHub + Preview | Claude sau khi duyệt | Trên Preview, Xưởng chỉ chạy khi có #4 + #5 |
| 4 | Chạy migration **kt_r2** (`supabase/kt_r2_ai_migration.sql`) trên bird-farm | Thêm 3 bảng owner-only | OWNER (SQL Editor) | 26 test PGlite đạt. Kiểm tra sau chạy: `3 | 4`. Hoàn tác: `kt_r2_ai_rollback.sql` |
| 5 | Triển khai Edge Function **kt-ai** + Secrets (bắt đầu với `KT_AI_TEXT_PROVIDER=mock`) | Thêm 1 function, không đụng `notify-lead` | OWNER (Supabase CLI / Dashboard) | Mock = 0đ, kiểm thử trọn quy trình trên Preview |
| 6 | Tạo tài khoản API (OpenAI và/hoặc Anthropic), **đặt hạn mức chi tiêu tháng** | **Chi phí** | OWNER | Xem `COST_ESTIMATE.md`. Không gửi khóa qua chat |
| 7 | Chuyển Secrets sang AI thật (`openai` / `anthropic` + model) | Chi phí theo lượt | OWNER | Giới hạn mặc định: 5 bài/ngày, 40 ảnh/ngày, 15 USD/tháng |
| 8 | Tắt **GitHub Pages** trước khi merge | Tránh lộ `/quan-tri/` không có header bảo vệ | OWNER (GitHub Settings → Pages) | |
| 9 | Quyết định bài đang công khai "Vòng đời của chim Yến Phụng" (tạo từ Preview ngày 13/10) | Sẽ hiện ngay khi lên Production | OWNER | Giữ / ẩn / thay bằng bài mẫu mới |
| 10 | Thêm mục "Kiến thức chuyên sâu" vào **menu trang chủ** | Sửa file trang chủ (chưa làm) | Claude sau khi duyệt | Đang không đổi trang chủ theo yêu cầu |
| 11 | Merge vào `main` → **Production** | Website thật | Claude sau khi duyệt | Quy trình + rollback: `DEPLOYMENT_CHECKLIST.md` |
| 12 | Bật bắt buộc MFA (`kt_mfa`) cho tài khoản `+kienthuc` | Bảo mật | OWNER | Sau khi đăng ký MFA trong `/quan-tri/#bao-mat` |
| 13 | Vercel Pro (website bán hàng) | 20 USD/tháng | OWNER | Điều khoản Hobby: phi thương mại |
| 14 | Duyệt thêm tên miền nguồn tin cậy (`TRUSTED_DOMAINS` trong `assets/kt/ai/qa.mjs`) | QA nguồn | OWNER | Hiện: australian.museum, merckvetmanual.com, en.wikipedia.org |
| 15 | Rà RLS các bảng App trại (bird-farm đang cho tự đăng ký) | Rủi ro có sẵn, không do Phase 1R/1S | OWNER + bên App trại | Xem `SECURITY_AUDIT.md` |
| 16 | **GĐ B:** push commit Giai đoạn B lên `feature/phase1s-ai-factory` | GitHub (PUBLIC) + Preview | Claude sau khi duyệt | Đã quét khóa bí mật |
| 17 | **GĐ B:** chạy migration **kt_r3** (sau kt_r2) | Hàng đợi + máy chạy việc; máy chủ dùng service_role nhưng database CHẶN xuất bản / sửa bài công khai / xóa | OWNER (SQL Editor) | 32 test PGlite đạt. Hoàn tác: `kt_r3_worker_rollback.sql` |
| 18 | **GĐ B:** đặt Secret `KT_WORKER_SECRET` (≥ 32 ký tự) | Bật máy chạy việc phía máy chủ | OWNER | Không gửi khóa qua chat |
| 19 | **GĐ B:** (tùy chọn) bật nhịp pg_cron (`kt_r3_schedule_enable.sql`) | ~8.600 lần gọi function / tháng (trong gói Free) | OWNER | Lịch tạo bài tự động vẫn TẮT |
| 20 | **GĐ B:** (tùy chọn) bật lịch tạo bài tự động + ngân sách tháng | **Chi phí** ~0,35 USD / bài | OWNER (trong `/quan-tri/#ai`) | Bắt buộc có ngân sách; AI không tự xuất bản |
| 21 | **GĐ B:** (tùy chọn) Telegram bot + `KT_NOTIFY_MODE=send` | Nhận tin khi có bài chờ duyệt | OWNER | Mặc định chỉ ghi lại (dry-run) |
| 22 | **Xóa bài AI:** chấp nhận quy tắc mới "không xóa được bài đang công khai — phải Ẩn trước" (trigger trong kt_r3, áp dụng cả trình soạn bài cũ) | Thay đổi thao tác xóa bài công khai: 2 bước (Ẩn → Xóa) | OWNER | 42 test SQL; kt_r3 đổi hash `781baf74…` |
| 23 | Push commit "Xóa bài AI / chủ đề đã loại / tạo lại" lên `feature/phase1s-ai-factory` | GitHub (PUBLIC) + Preview | Claude sau khi duyệt | Đã quét khóa bí mật |
