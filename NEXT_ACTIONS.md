# NEXT ACTIONS — sau Giai đoạn B (2026-10-19)

## Ngay (≈ 15 phút, không tốn tiền)
1. Đọc `PHASE_1S_GIAI_DOAN_B_REPORT.md` (kiến trúc, đã chạy / còn mock, chi phí) và `PHASE_1R_1S_FINAL_REPORT.md`.
2. Xem thử ở máy local (Claude có thể bật giúp): `http://127.0.0.1:8781/quan-tri/?dev=1#ai` → tự nhập 1 chủ đề → "+ Tạo việc" → xem trang duyệt (📱 / 🖥, thẻ kiểm tra link nguồn).

## Duyệt (trả lời trong chat)
3. Push commit Giai đoạn B lên `feature/phase1s-ai-factory` (`OWNER_APPROVAL_REQUIRED.md` #16) → có Preview mới.
4. Chạy migration kt_r2 rồi kt_r3, triển khai `kt-ai`, đặt Secrets ở chế độ **mock** (#4, #5, #17, #18) → thử "tạo bài rồi đóng trình duyệt" trên Preview, 0đ.
5. Quyết định bài công khai đang có (#9), tắt GitHub Pages (#8), merge lên Production (#11).

## Khi muốn AI thật viết bài
6. Tạo khóa OpenAI, **đặt hạn mức chi tiêu tháng**, điền Secrets (`DEPLOYMENT_CHECKLIST.md` C2, C4). Tạo 1 bài thử, kiểm tra chi phí trong Xưởng.
7. (Tùy chọn) Telegram (#21) → nhận link duyệt trên điện thoại. (Tùy chọn) Nhịp cron (#19) + lịch tự động có ngân sách (#20).

## Claude có thể làm tiếp (không cần quyền đặc biệt)
- Thêm bài mẫu; tinh chỉnh bố cục; tự host supabase-js; kiểm thử trình duyệt tự động.
- Cập nhật `supabase/HUONG_DAN_OWNER_R2.md` thêm phần kt_r3 (đang bị Word khóa — đóng file để Claude sửa).
