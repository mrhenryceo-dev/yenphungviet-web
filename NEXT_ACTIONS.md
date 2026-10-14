# NEXT ACTIONS — khi OWNER trở về

## Ngay (≈ 15 phút, không tốn tiền)
1. Đọc `PHASE_1R_1S_FINAL_REPORT.md` (2 trang).
2. Xem thử ở máy local (Claude có thể bật giúp):
   - http://127.0.0.1:8781/kien-thuc/ — giao diện mới + 3 bài mẫu.
   - http://127.0.0.1:8781/quan-tri/?dev=1#ai → "Nạp 3 bài mẫu" → "Xem & duyệt".
3. Đọc 3 bài mẫu + "Ghi chú biên tập" ở trang duyệt. Ghi lại chỗ cần sửa nội dung.

## Duyệt (trả lời trong chat)
4. Duyệt push 2 nhánh để có Preview (`OWNER_APPROVAL_REQUIRED.md` #2, #3).
5. Chạy migration kt_r2 + triển khai Edge Function ở chế độ **mock** (#4, #5) → thử Xưởng trên Preview, 0đ.
6. Quyết định: bài công khai đang có (#9), link menu trang chủ (#10), tắt GitHub Pages (#8).

## Khi muốn AI thật viết bài
7. Chọn nhà cung cấp (chữ: OpenAI hoặc Anthropic; ảnh: OpenAI), tạo khóa, **đặt hạn mức chi tiêu**, điền Secrets (`DEPLOYMENT_CHECKLIST.md` C2, C4).
8. Tạo 1 bài thử, đọc kỹ, kiểm tra chi phí. Sau đó dùng hằng ngày: Xưởng → "Gợi ý chủ đề" → "Tạo bài" → mở link duyệt → Duyệt / Yêu cầu chỉnh sửa.

## Claude có thể làm tiếp (không cần quyền đặc biệt)
- Thêm bài mẫu theo danh sách ý tưởng; tinh chỉnh bố cục theo góp ý; tự host supabase-js; thêm kiểm thử trình duyệt tự động.
- Cập nhật `supabase/HUONG_DAN_OWNER_R2.md` (đang bị Word khóa — đóng file để Claude sửa).
