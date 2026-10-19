# DEPLOYMENT CHECKLIST — đưa Phase 1R + 1S lên Production (chỉ làm sau khi OWNER duyệt từng bước)

Dự án Supabase: **bird-farm `bnumqtjzbyrtavsdlleq`** (dùng chung App trại). Repo: `mrhenryceo-dev/yenphungviet-web`. Production = nhánh `main`.

## A. Trước khi bắt đầu
- [ ] OWNER đã đọc `OWNER_APPROVAL_REQUIRED.md` và duyệt các mục liên quan.
- [ ] `node tools/run-all-tests.mjs` → 11/11 đạt (đặt `KT_PGLITE` để chạy test SQL).
- [ ] Tắt GitHub Pages (Settings → Pages → None).

## B. Phase 1R (mục Kiến thức) lên Preview rồi Production
1. [ ] Claude push: `git push origin feature/phase1r-kien-thuc:feature/phase1r-kien-thuc` (không force).
2. [ ] OWNER mở Preview (đăng nhập Vercel): `/kien-thuc/`, một bài, `/quan-tri/` (thấy dải "BẢN THỬ"), thử trên điện thoại.
3. [ ] OWNER quyết định bài công khai đang có (mục 9 trong OWNER_APPROVAL_REQUIRED).
4. [ ] (Tùy chọn, cần duyệt) thêm link menu trang chủ.
5. [ ] Merge: `git push origin feature/phase1r-kien-thuc:main` chỉ khi là **fast-forward** của `67be669` (kiểm tra `git merge-base --is-ancestor 67be669 feature/phase1r-kien-thuc`).
6. [ ] Kiểm tra Production: `/` 200, `/kien-thuc/` 200, `/sitemap.xml` 200, `/quan-tri/` có header `X-Frame-Options: DENY` + CSP, trang chủ / 3 nhóm chim / form / Zalo như cũ.
7. **Rollback:** Vercel Dashboard → Deployments → bản `67be669` → *Promote to Production* (hoặc `git push origin 67be669:main --force-with-lease` — CHỈ khi OWNER duyệt riêng).

## C. Phase 1S (Xưởng nội dung AI)
### C1. Database (OWNER, SQL Editor)
- [ ] Chạy toàn bộ `supabase/kt_r2_ai_migration.sql` (từ `begin;` đến `commit;`). Lỗi `kt_r2: DỪNG` = không có gì thay đổi.
- [ ] Kiểm tra: số bảng `3`, số policy `4` (câu SQL ở cuối file).
- [ ] **Giai đoạn B:** chạy `supabase/kt_r3_worker_migration.sql` (hàng đợi + máy chạy việc + chốt service_role + lịch TẮT + thông báo). Kiểm tra: `t | f | 3`. Hoàn tác: `kt_r3_worker_rollback.sql` (không xóa bài / việc).

### C2. Edge Function (OWNER, máy có Supabase CLI; hoặc Dashboard → Edge Functions)
- [ ] `node tools/build-edge.mjs --check` → đồng bộ.
- [ ] `supabase login` → `supabase functions deploy kt-ai --project-ref bnumqtjzbyrtavsdlleq`
- [ ] Secrets (Project Settings → Edge Functions → Secrets). `SUPABASE_URL`, `SUPABASE_ANON_KEY` do Supabase tự cấp.

| Secret | Giá trị bước đầu (0đ) | Khi dùng AI thật |
|---|---|---|
| `KT_AI_ENABLED` | `1` | `1` (đặt `0` để tắt ngay) |
| `KT_AI_TEXT_PROVIDER` | `mock` | `openai` hoặc `anthropic` |
| `KT_AI_TEXT_MODEL` | — | tên model OWNER chọn (không hardcode) |
| `KT_AI_IMAGE_PROVIDER` | `mock` | `openai` (Anthropic không tạo ảnh) hoặc `none` |
| `KT_AI_IMAGE_MODEL` | — | tên model ảnh OWNER chọn |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | — | khóa thật (chỉ ở Secrets) |
| `KT_ALLOWED_ORIGINS` | `https://yenphungviet.vercel.app` | như cũ |
| `KT_ALLOWED_ORIGIN_SUFFIX` | `-mrhenryceo-2691s-projects.vercel.app` | như cũ (cho Preview) |
| `KT_AI_PRICES` | `{}` | `{"<model>":{"in":<USD/1M>,"out":<USD/1M>,"image":<USD/ảnh>}}` theo bảng giá chính thức |
| `KT_AI_MONTHLY_BUDGET_USD`, `KT_AI_DAILY_ARTICLES`, `KT_AI_DAILY_IMAGES`, `KT_AI_MAX_IMAGES`, `KT_AI_MAX_OUTPUT_TOKENS` | mặc định 15 / 5 / 40 / 8 / 9000 | tùy OWNER (có trần cứng trong code) |
| `KT_WORKER_SECRET` (GĐ B) | chuỗi ngẫu nhiên ≥ 32 ký tự (vd. tạo bằng trình quản lý mật khẩu) | như cũ — đổi nếu nghi lộ (nhớ đổi cả trong Vault nếu đã bật cron) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase **tự cấp** cho Edge Function — không cần đặt | — |
| `KT_REVIEW_BASE_URL` | `https://yenphungviet.vercel.app` | như cũ (link trong thông báo) |
| `KT_AI_IMAGE_QUALITY` | — | `low` / `medium` (khuyến nghị) / `high` |
| `KT_NOTIFY_MODE` | `dry-run` (chỉ ghi lại, KHÔNG gửi) | `send` khi muốn nhận tin |
| `KT_NOTIFY_TELEGRAM_TOKEN`, `KT_NOTIFY_TELEGRAM_CHAT` | — | token bot (@BotFather) + chat id của OWNER |

- [ ] **Chưa kiểm chứng:** nếu trình duyệt báo lỗi CORS ở yêu cầu OPTIONS, triển khai lại với `--no-verify-jwt` (handler vẫn tự xác thực OWNER qua `/auth/v1/user`).

### C2b. Nhịp máy chủ + lịch tự động (GĐ B, TÙY CHỌN — không bắt buộc để máy chạy việc hoạt động)
- [ ] Database → Extensions: bật `pg_cron`, `pg_net`.
- [ ] Sửa 2 chỗ `<WORKER_SECRET>`, `<ANON_KEY>` rồi chạy `supabase/kt_r3_schedule_enable.sql`. Kiểm tra: `select jobname, active from cron.job`.
- [ ] Lịch tự động vẫn **TẮT** cho tới khi OWNER đặt ngân sách + bật trong `/quan-tri/#ai` → "Lịch tạo bài tự động".
- **Tắt:** `kt_r3_schedule_disable.sql`, hoặc nhanh nhất `KT_AI_ENABLED=0`.

### C3. Kiểm thử trên Preview (mock, 0đ)
- [ ] (GĐ B) Tạo bài → **đóng trình duyệt** → 1–2 phút sau mở lại `#ai`: việc đã chạy xong phía máy chủ; `kt_ai_notifications` có 1 dòng `dry_run`.
- [ ] Claude push `feature/phase1s-ai-factory` (sau khi duyệt). OWNER mở `<preview>/quan-tri/#ai`: dải "MÔ PHỎNG (mock)", gợi ý chủ đề, tạo 1 bài → "Chờ kiểm tra" (bài [MÔ PHỎNG] bị chặn xuất bản là ĐÚNG).
- [ ] Trang duyệt: nút "Duyệt xuất bản" **khóa** trên Preview (đúng thiết kế).

### C4. Chuyển AI thật
- [ ] Đặt hạn mức chi tiêu ở trang nhà cung cấp. Đổi Secrets sang provider thật. Tạo 1 bài thử, kiểm tra chi phí trong Xưởng ("Tháng này: … USD") và trang nhà cung cấp.

### C5. Production
- [ ] Merge `feature/phase1s-ai-factory` vào `main` (fast-forward), kiểm tra như B6 + `/quan-tri/#ai`.
- **Rollback Xưởng:** `KT_AI_ENABLED=0` (tắt ngay) → xóa function nếu cần → `supabase/kt_r2_ai_rollback.sql` (xóa lịch sử Xưởng, **không** xóa bài).
