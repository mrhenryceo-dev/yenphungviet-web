# HƯỚNG DẪN OWNER — Kiểm tra (CHỈ ĐỌC) bảng leads và notify-lead trên bird-farm

Mục đích: biết website đang gửi khách về đâu và cần sao lưu gì, **trước khi** tạo `yenphungpet-web`.
Chỉ XEM và XUẤT FILE. **Không bấm** Edit, Delete, Deploy, Run trên dữ liệu, không đổi Settings.

> Không gửi qua chat: mật khẩu, khóa `service_role`/`sb_secret_`, giá trị biến bí mật, file CSV khách hàng.

## 1. Xác nhận đúng dự án
Mở dự án **bird-farm**. Thanh địa chỉ phải là `supabase.com/dashboard/project/bnumqtjzbyrtavsdlleq/...`
Nếu ID khác → dừng, báo lại ID thấy được (website đang dùng `bnumqtjzbyrtavsdlleq`).

## 2. Bảng `leads`
1. **Table Editor** → chọn bảng **leads**.
2. Ghi lại: **số dòng** (góc dưới) và **ngày của dòng mới nhất** (cột `created_at`).
3. Chụp màn hình **tên các cột** (chỉ hàng tiêu đề, che/không chụp dữ liệu khách).
4. Sao lưu: nút **Export** (hoặc `...`) → **Export to CSV** → lưu vào máy, thư mục riêng tư. **Không gửi file.**
5. Nếu App quản lý trại cũng dùng bảng này (có cột/dòng không đến từ website) → ghi chú lại.

## 3. Bảng `birds`
1. **Table Editor** → **birds** → ghi lại số dòng và có bao nhiêu dòng `published = true`.
2. App quản lý trại có tạo/sửa dòng trong `birds` không? (OWNER biết qua cách dùng App.)
3. Export CSV giữ trên máy (dữ liệu không nhạy cảm, nhưng vẫn để dự phòng).

## 4. Edge Function `notify-lead`
1. **Edge Functions** → **notify-lead**.
2. Ghi lại: **ngày deploy gần nhất**, số lần gọi gần đây (tab *Invocations*/*Logs*, nếu có).
3. Tab **Code** (hoặc *Details → View source*): copy toàn bộ mã nguồn → gửi cho Claude/GPT.
   Trước khi gửi, kiểm tra trong mã **không có** chuỗi bí mật viết thẳng (dạng `eyJ...`, `sb_secret_`, token Telegram/Zalo, mật khẩu email). Nếu có → che bằng `***` và báo "có bí mật trong mã".
4. **Edge Functions → Secrets** (hoặc *Project Settings → Edge Functions*): chỉ ghi **TÊN** các biến (ví dụ `TELEGRAM_BOT_TOKEN`). **Không** copy giá trị.

## 5. Gửi lại cho Claude/GPT
- ID dự án ở bước 1.
- leads: số dòng, ngày mới nhất, ảnh tiêu đề cột, App trại có dùng không.
- birds: số dòng / số published, App trại có ghi vào không.
- notify-lead: mã nguồn (đã che bí mật), danh sách TÊN biến bí mật, ngày deploy.
