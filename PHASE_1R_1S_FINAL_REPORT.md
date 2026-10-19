# PHASE 1R + 1S — BÁO CÁO CUỐI (2026-10-14)

> **Cập nhật 2026-10-19 — Giai đoạn B:** quy trình tạo bài đã chuyển sang **chạy phía máy chủ** (hàng đợi, OWNER đóng trình duyệt vẫn chạy, kiểm tra link nguồn, thông báo, lịch tự động mặc định tắt). Xem `PHASE_1S_GIAI_DOAN_B_REPORT.md`. Mã commit đã push: 1R `6a3c64a`, 1S `12e6109` (thay cho `fb7309a` / `7e2ba42` bên dưới).

Người thực hiện: Claude Code. Phạm vi: chỉ máy local + đọc công khai. **Không** push, merge, deploy, ghi Supabase thật, gọi API AI trả phí, hay đụng dự án khác ngoài YenPhungViet.

## 1. Trạng thái Git
| Nhánh | Commit | Trạng thái |
|---|---|---|
| `feature/phase1r-kien-thuc` | `fb7309a` | Đã push tới `7640553` trước đó. **`fb7309a` (GĐ1) CHƯA push.** |
| `feature/phase1s-ai-factory` | `e3ba352` (+ commit tài liệu) | Tạo từ `fb7309a`. **CHƯA push.** |
| `main` | `67be669` | Không đổi. Production không đổi. |

Thư mục làm việc: `D:\AI-Projects\YenPhungViet_phase1r` (worktree).

## 2. Đã hoàn thành THỰC SỰ (đã chạy, đã kiểm thử)
### Giai đoạn 1 — Phase 1R
- Danh sách `/kien-thuc/`: **hết thanh cuộn ngang** (bộ lọc tự xuống dòng; điện thoại = lưới 2 cột), bài nổi bật, thẻ kiểu tạp chí, JSON-LD `ItemList`.
- Trang bài: thiết kế "tạp chí thiên nhiên" — đầu bài căn giữa + byline, ảnh bìa tải ngay (`fetchpriority`), chữ đầu lớn, **mục lục tự động** + thanh tiến độ đọc, nguồn kiểu chú thích, "Đọc tiếp".
- **5 bố cục**: chuẩn · tạp chí · hướng dẫn từng bước (đánh số) · so sánh & phân biệt · hỏi đáp. Lưu ở `cover.layout` → **không cần migration**. Chọn được trong trình soạn.
- Menu hiện trên điện thoại (nhãn ngắn). Kiểm tra 314 / 335 / 341 / 390 px: **không tràn ngang**.
- Quản trị: link / lời nhắn **đúng môi trường** (Preview không còn hứa "lên website trong 1–5 phút"), dải cảnh báo "BẢN THỬ — dữ liệu là THẬT".
- Bảo mật: **CSP** + `nosniff` cho `/quan-tri/`; bỏ cờ tạm `og_stale` khi lưu.

### Giai đoạn 2 — Phase 1S: Xưởng nội dung AI
- Lõi (`assets/kt/ai/`): 7 nhóm chủ đề + 21 ý tưởng hạt giống; **chống trùng** (25 Cẩm nang + bài đã có + việc đang làm, so bằng chữ có dấu); gói bài `yp-kt-ai/1` (chặn khóa yêu cầu quyền / script / SQL / khóa bí mật; bỏ qua `status`); **dàn trang 5 bố cục**; tự xử lý slug / SEO / Alt / mục lục / FAQ / nguồn / liên kết nội bộ; **QA theo 4 quy tắc chuyên môn bắt buộc** + nguồn + ảnh; adapter **mock / OpenAI / Anthropic** (model + khóa chỉ từ biến môi trường); giới hạn token / ảnh / ngân sách / số lần thử / timeout; **pipeline chạy tiếp được** sau lỗi; phiên bản + yêu cầu sửa + khôi phục.
- Trạng thái: Đề xuất → Đang tạo → Chờ kiểm tra → Chờ OWNER duyệt → Cần sửa → Đã xuất bản (+ Lỗi, Đã bỏ).
- **Edge Function `kt-ai`** (`supabase/functions/kt-ai/`): chỉ OWNER (+MFA nếu bật), CORS giới hạn, kiểm tra hạn mức trước khi gọi AI, ghi chi phí bằng JWT của OWNER — **không dùng service_role**, **không ghi bài**.
- **Migration `kt_r2`** (CHƯA CHẠY): `kt_ai_jobs`, `kt_article_versions`, `kt_ai_usage` — owner-only, cài một lần, trigger chặn "đánh dấu xuất bản giả".
- Giao diện `/quan-tri/#ai` (Xưởng) và `#duyet/<id>` (trang duyệt: xem như khách trên điện thoại / máy tính, QA chạy lại trên bài hiện tại, ghi chú biên tập, nguồn, phiên bản, nhật ký). **Duyệt xuất bản chỉ bấm được trên website chính thức** và luôn qua hộp xác nhận 5 mục có sẵn.

### Giai đoạn 3 — 3 bài mẫu (local, không ghi DB)
| Bài | Bố cục | Từ | Nguồn đã mở đọc |
|---|---|---|---|
| Vòng đời của chim Yến Phụng – Từ trứng đến trưởng thành | tạp chí | ~1060 | Australian Museum, Wikipedia |
| 7 sai lầm khi mới nuôi Yến Phụng và cách phòng tránh | hướng dẫn | ~920 | Merck Vet Manual (3 trang), Wikipedia (PTFE) |
| Phân biệt Yến Phụng trống mái theo độ tuổi và mutation | so sánh | ~900 | Wikipedia, Australian Museum |

Mỗi bài có mục lục, SEO, vị trí ảnh + chú thích + Alt, FAQ, **ghi chú biên tập liệt kê điểm chưa xác minh**. Ảnh bìa = ảnh minh họa có sẵn của website; ảnh trong bài = **ô giữ chỗ ghi rõ** (không có công cụ tạo ảnh).

### Giai đoạn 4 — Kiểm thử: `node tools/run-all-tests.mjs` → **11/11 nhóm đạt**
| Nhóm | Kết quả |
|---|---|
| Render trang công khai (XSS, SEO, mục lục, bố cục) | 18/18 |
| Xử lý ảnh | 8/8 |
| Vercel Function ↔ Supabase REST (fetch giả) | 7/7 |
| Xưởng AI + Edge Function (gói bài, 5 bố cục, QA, chống trùng, giới hạn, provider, pipeline, handler) | 33/33 |
| SQL kt_r1 / kt_r2 / web_02 (PGlite, Postgres 18.3) | 74 / 26 / 15 |
| Edge Function đồng bộ · hồi quy file cũ · quét khóa bí mật · frontend không service_role | đạt |

Kiểm thử trình duyệt (Chrome, dev local): toàn bộ vòng nạp mẫu → tạo bài → ảnh → QA → góp ý → AI sửa → duyệt xuất bản (dev) → đồng bộ trạng thái; CSP không chặn gì; Xưởng + trang duyệt không tràn ngang ở 375 px.

**Lỗi thật đã tìm và sửa nhờ kiểm thử:** bỏ dấu làm "ẩn"/"ăn", "trống"/"trong" trùng nhau (chống trùng + QA); trigger kt_r2 chặn nhầm việc xóa bài; pipeline không chạy tiếp bước ảnh; bài MÔ PHỎNG lọt qua QA; khối "Các bước chính" gây hiểu nhầm; menu mobile tràn ngang.

## 3. Chỉ là MOCK (chưa phải AI thật)
- Mọi lần "tạo bài" / "sửa" / "gợi ý" / "tạo ảnh" trong kiểm thử dùng **mock provider**. Chủ đề ngoài 3 bài mẫu → nội dung **[MÔ PHỎNG]** (QA chặn xuất bản). Ảnh mock = PNG sọc giữ chỗ.
- **Chưa có bài nào do AI thật tạo.** 3 bài mẫu do Claude Code soạn tay, đối chiếu nguồn.
- Adapter OpenAI / Anthropic mới kiểm bằng **fetch giả** (đúng endpoint, header, xử lý lỗi) — **chưa gọi API thật**.

## 4. Chưa kiểm chứng được
- Edge Function chưa deploy: hành vi thật của Supabase (verify_jwt + CORS preflight, giới hạn thời gian 150 s, kích thước phản hồi ảnh base64).
- Migration kt_r2 chưa chạy trên Supabase thật (chỉ PGlite).
- Vercel Functions mới chạy local; Preview được bảo vệ nên Claude không xem được nội dung.
- Nội dung chuyên môn chưa đối chiếu **Knowledge / MASTER LIST FINAL 4.2** (không có trên máy) — xem "Ghi chú biên tập" từng bài.
- Chưa thử trên điện thoại thật; MFA với tài khoản thật.

## 5. Chi phí phát sinh trong thời gian OWNER vắng: **0đ**
Không gọi API trả phí. Chỉ có yêu cầu đọc công khai miễn phí (Supabase anon, 4 trang nguồn tham khảo). Chi tiết dự kiến: `COST_ESTIMATE.md`.

## 6. Xem ở máy local
```
cd D:\AI-Projects\YenPhungViet_phase1r
node --watch-path=assets --watch-path=api --watch-path=quan-tri --watch-path=tools tools/dev-server.mjs 8781
```
- Trang công khai (dữ liệu mẫu): http://127.0.0.1:8781/kien-thuc/
- Xưởng (thử, mock, lưu trong trình duyệt): http://127.0.0.1:8781/quan-tri/?dev=1#ai → "Nạp 3 bài mẫu"
- Toàn bộ test: `set KT_PGLITE=<đường dẫn PGlite>` rồi `node tools/run-all-tests.mjs`

Tài liệu liên quan: `OWNER_APPROVAL_REQUIRED.md`, `DEPLOYMENT_CHECKLIST.md`, `SECURITY_AUDIT.md`, `COST_ESTIMATE.md`, `NEXT_ACTIONS.md`, `PROGRESS.md`.
