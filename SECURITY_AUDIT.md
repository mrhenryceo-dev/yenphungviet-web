# SECURITY AUDIT — Phase 1R + 1S (2026-10-14)

## 1. Kiểm soát đã có (và được kiểm thử)
| Rủi ro | Kiểm soát | Kiểm thử |
|---|---|---|
| AI / người lạ tự xuất bản | Pipeline chỉ ghi `status='draft'`, từ chối bài không còn nháp; Edge Function **không có quyền ghi bài**; trigger kt_r1 bắt `reviewed_by_owner`; trigger kt_r2 chặn đánh dấu "Đã xuất bản" giả; nút duyệt chỉ trên website chính thức + hộp xác nhận 5 mục | kt-ai-test (pipeline), kt-r2-sql-test #14–15, kt-sql-test |
| Người ngoài ghi dữ liệu | RLS owner-only (`kt_is_owner()` = `app_metadata.kt_role`, + aal2 nếu `kt_mfa`); anon không có grant | 74 + 26 test SQL; kiểm thử thật bằng anon ngày 13/10 (11/11) |
| Khóa bí mật lộ | Khóa AI chỉ ở Supabase Secrets; frontend chỉ có anon key; không service_role ở đâu cả | run-all-tests: quét khóa + frontend không service_role |
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

## 3. Không thay đổi
`birds`, `leads`, `notify-lead`, bảng / policy App trại, Auth settings, Storage policies thật, trang chủ, 3 nhóm chim, Catalogue, Cẩm nang, FAQ, form, Zalo — **không đụng** (kiểm tra bằng diff với `67be669`).
