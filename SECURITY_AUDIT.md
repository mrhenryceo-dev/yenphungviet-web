# SECURITY AUDIT — Phase 1R + 1S (2026-10-14)

## 1. Kiểm soát đã có (và được kiểm thử)
| Rủi ro | Kiểm soát | Kiểm thử |
|---|---|---|
| AI / người lạ tự xuất bản | Pipeline / máy chạy việc chỉ ghi `status='draft'`, từ chối bài không còn nháp; (GĐ B) máy chạy việc ghi bài NHÁP bằng service_role nhưng **trigger kt_r3 chặn xuất bản**; trigger kt_r1 bắt `reviewed_by_owner`; trigger kt_r2 chặn đánh dấu "Đã xuất bản" giả; nút duyệt chỉ trên website chính thức + hộp xác nhận 5 mục | kt-ai-test (pipeline), kt-r2-sql-test #14–15, kt-sql-test |
| Người ngoài ghi dữ liệu | RLS owner-only (`kt_is_owner()` = `app_metadata.kt_role`, + aal2 nếu `kt_mfa`); anon không có grant | 74 + 26 test SQL; kiểm thử thật bằng anon ngày 13/10 (11/11) |
| Khóa bí mật lộ | Khóa AI chỉ ở Supabase Secrets; frontend chỉ có anon key; service_role **chỉ** trong Edge Function (Supabase tự cấp), không ở trình duyệt / Git | run-all-tests: quét khóa + frontend không service_role |
| (GĐ B) Máy chạy việc nền dùng service_role | Chỉ vào được bằng `x-kt-worker-secret` (so sánh thời gian cố định, ≥ 32 ký tự); **trigger `kt_articles_ai_guard`**: service_role không xuất bản, không đặt `reviewed_by_owner`, không sửa bài công khai / đã ẩn, không xóa (kể cả khi có quyền DELETE mặc định); không có grant DELETE; hàm nhận việc chỉ service_role gọi được; kho máy chủ luôn ghi `status='draft'` + chỉ PATCH khi `status=eq.draft` | kt-r3-sql-test #11–26, kt-worker-test (kho máy chủ, OWNER xuất bản giữa chừng) |
| (GĐ B) Chạy trùng / ghi đè lựa chọn OWNER | Khóa thuê `FOR UPDATE SKIP LOCKED`; mọi lần lưu có điều kiện `lock_owner`; OWNER thay đổi việc → trigger thả khóa → máy chủ dừng | kt-r3-sql-test #13–17, kt-worker-test |
| (GĐ B) SSRF qua link nguồn AI bịa | Chỉ `https`, cổng 443, không IP / localhost / tên miền nội bộ / user:pass; theo chuyển hướng thủ công ≤ 5 lần, kiểm tra từng bước; timeout 8 s; chỉ đọc mã HTTP | kt-worker-test (link nguồn) |
| (GĐ B) Thông báo lộ nội dung | Tin chỉ có tiêu đề + link `/quan-tri/#duyet/<id>` (cần đăng nhập OWNER); mặc định dry-run | kt-worker-test (thông báo) |
| Gọi API vô hạn / chi phí | Hạn mức ngày (bài, ảnh), ngân sách tháng, 60 s giữa 2 bài, trần token, ≤3 lần thử lại có backoff, timeout, ≤3 lần tạo/1 việc, khóa việc 5 phút; trần cứng trong code | kt-ai-test (limits, handler 429, pipeline attempts/lock) |
| Nội dung AI độc hại (XSS) | Gói bài chặn khóa nguy hiểm + `<script`, `javascript:`, `on*=`, SQL, khóa; bộ render escape mọi chữ, link chỉ https / nội bộ, ảnh chỉ bucket / `/assets/`, khối lạ bị bỏ | kt-ai-test, kt-render-test |
| Ký tự ẩn / bidi | Loại ký tự điều khiển, zero-width, U+2028/2029, bidi override | kt-ai-test |
| Prompt injection qua tư liệu | Đầu ra chỉ chấp nhận JSON đúng schema → kiểm tra → bài **nháp** → OWNER đọc trước khi duyệt | thiết kế |
| Clickjacking / index | `/quan-tri/`: `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'`, `noindex`, `no-store` | dev-server + kiểm tra header |
| CSRF | Không áp dụng: xác thực bằng Bearer token (không cookie) | — |
| CORS Edge Function | Chỉ `https://yenphungviet.vercel.app` + Preview `yenphungviet-*-mrhenryceo-2691s-projects.vercel.app` | kt-ai-test |
| Lộ bài nháp | Bài nháp + việc + phiên bản chỉ OWNER đọc (RLS); xem trước dựng trong trang quản trị (không có link công khai cho nháp) | test SQL |
| Cờ dev lọt môi trường thật | `KT_DEV_FAKE_OWNER` chỉ hiệu lực khi `KT_RUNTIME=dev-server`; `index.ts` xóa cả hai biến | kt-ai-test |
| Ảnh độc / EXIF | Chỉ JPEG/PNG/WebP, giải mã + vẽ lại canvas (bỏ EXIF/GPS), WebP, tên UUID | kt-media-test |

## 2. Rủi ro còn lại
1. **bird-farm cho tự đăng ký** (có sẵn, không do Phase 1R/1S). Kiến thức an toàn nhờ `kt_role`, nhưng RLS các bảng App trại chưa được rà.
2. **Ảnh bài nháp xem được nếu biết URL** (bucket public). Không liệt kê được; tên UUID không đoán được.
3. **Edge Function chưa deploy** → verify_jwt/CORS preflight, giới hạn 150 s, phản hồi ảnh base64 lớn: chưa kiểm chứng trên Supabase thật.
4. **MFA chưa bắt buộc** cho tới khi OWNER đặt `kt_mfa=required`.
5. **CSP có `style-src 'unsafe-inline'`** (cần cho thuộc tính style của ảnh / lấy nét). Script không cho inline.
6. **supabase-js tải từ jsDelivr** (đã ghim `@2.45.4`, không SRI vì import ESM). Có thể tự host sau.
7. **Bản tự sao lưu trong trình duyệt** (localStorage) giữ nội dung bài đang soạn trên máy dùng chung.
8. **Nội dung AI có thể sai chuyên môn / nguồn không tồn tại** — QA chỉ là lưới an toàn; OWNER phải đọc và mở link nguồn.
9. **Ảnh AI là minh họa**, có thể sai chi tiết (cere, vằn) — luôn gắn nhãn, không dùng làm bằng chứng.
10. (GĐ B) **service_role nằm trong Edge Function**: nếu mã function bị sửa sai, service_role vẫn ghi được bảng khác của bird-farm. Lớp chặn trong database chỉ bảo vệ `kt_articles` / `kt_ai_*`. Giảm rủi ro: chỉ OWNER deploy function; giữ `KT_WORKER_SECRET` bí mật.
11. (GĐ B) **Kiểm tra link ≠ xác minh nội dung**: link mở được không có nghĩa nguồn nói đúng điều bài viết. Trang chặn bot (403) bị bỏ dù có thể là nguồn tốt — xem danh sách "đã bỏ" ở trang duyệt.
12. (GĐ B) **OpenAI background mode lưu kết quả phía OpenAI** (`store:true`) để máy chủ hỏi lại — nội dung bài (không có dữ liệu cá nhân) nằm theo chính sách lưu trữ của OpenAI.

## 3. Không thay đổi
`birds`, `leads`, `notify-lead`, bảng / policy App trại, Auth settings, Storage policies thật, trang chủ, 3 nhóm chim, Catalogue, Cẩm nang, FAQ, form, Zalo — **không đụng** (kiểm tra bằng diff với `67be669`).
