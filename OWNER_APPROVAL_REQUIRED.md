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
