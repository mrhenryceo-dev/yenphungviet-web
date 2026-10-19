# PHASE 1S — GIAI ĐOẠN B: MÁY CHẠY VIỆC PHÍA MÁY CHỦ (2026-10-19)

Người thực hiện: Claude Code. Phạm vi: **chỉ code + kiểm thử local**. Không chạy migration thật, không deploy, không gọi API AI trả phí, không bật lịch thật, không tạo dữ liệu thật, không push / merge, không đụng dự án khác ngoài YenPhungViet.

## 1. Kiến trúc đã chọn

```
OWNER (trình duyệt)                 Supabase (bird-farm)                                Nhà cung cấp AI
───────────────────                 ───────────────────────────────────────────         ───────────────
"+ Tạo bài"  ──insert──▶  kt_ai_jobs (status=queued)                                  
             ──kick────▶  Edge Function kt-ai ──202 ngay──▶ (OWNER đóng trình duyệt được)
                              │ waitUntil
                              ▼
                          tick: kt_ai_claim_job()  (khóa thuê 180 s, FOR UPDATE SKIP LOCKED)
                              │  1 bước "nặng" / lần, lưu tiến độ sau MỖI bước
                              ├─ article  ──submit──────────────────────────────────▶ OpenAI background / Anthropic Batches
                              ├─ article_wait ──hỏi lại 15 s → 60 s → 5 phút───────▶  (không request nào chờ bài dài)
                              ├─ compose  → kt_articles (status=draft, CHỈ nháp)
                              ├─ sources  → HEAD/GET từng link nguồn (bỏ link hỏng)
                              ├─ images   → 1 ảnh / tick ─────────────────────────────▶ OpenAI ảnh (WebP nén sẵn)
                              │             → Storage kien-thuc/img/<uuid>-1600.webp
                              ├─ qa       → QA 4 quy tắc chuyên môn + kết quả link
                              └─ notify   → kt_ai_notifications (dry_run mặc định) ──▶ Telegram (chỉ khi KT_NOTIFY_MODE=send)
                          tự gọi lại chính mình (trễ 2–60 s, tối đa 300 lần) cho tới khi hết việc
pg_cron 5 phút (TẮT, OWNER tự bật) ──tick──▶ đánh thức việc kẹt + LỊCH TỰ ĐỘNG (kt_ai_settings, TẮT)
OWNER mở link /quan-tri/#duyet/<id> (đăng nhập + MFA) ──▶ đọc ──▶ [Duyệt xuất bản] (chỉ OWNER, chỉ trên website chính thức)
```

**Lý do chọn:**
| Quyết định | Lý do |
|---|---|
| Chạy trong **chính Edge Function kt-ai** (thêm `tick` / `kick`), không thêm dịch vụ | OWNER chỉ triển khai 1 function; dùng lại toàn bộ lõi AI, QA, dàn trang đã kiểm thử (Phase 1S GĐ2) |
| **Hàng đợi trong Postgres** (`kt_ai_jobs` + hàm claim) | Không cần dịch vụ hàng đợi ngoài, miễn phí; khóa thuê chống chạy trùng; máy chủ sập → hết khóa → máy khác chạy tiếp từ bước đã lưu |
| **Chia nhỏ từng bước** thay vì tăng timeout | Edge Function Free: 150 s / request, 2 s CPU. Bài dài (8–9 nghìn token) có thể mất > 100 s nếu gọi đồng bộ → dùng chế độ **bất đồng bộ** của nhà cung cấp (OpenAI `background`, Anthropic Message Batches) + hỏi lại theo hẹn giờ |
| **1 ảnh / lần chạy**, chỉ bắt đầu khi tick mới chạy < 25 s, timeout ≤ 115 s | Ảnh có thể mất tới ~2 phút; không bao giờ vượt 150 s |
| **Ảnh WebP do OpenAI nén sẵn** (`output_format: webp`, nén 82) | Máy chủ không có canvas và chỉ có 2 s CPU → không tự nén. Ảnh chia sẻ link 1200×630 được tạo **trong trình duyệt** khi OWNER duyệt (dùng lại code Phase 1R) |
| Tự nối tiếp (self-chain) qua `EdgeRuntime.waitUntil` + **pg_cron là lưới an toàn** | Không cần cron vẫn chạy hết bài (OWNER đóng trình duyệt được); cron (khi OWNER bật) đánh thức việc kẹt và chạy lịch tự động |
| `service_role` **chỉ** ở đường máy chủ, **database tự chặn** | Không có phiên OWNER khi chạy nền → cần khóa máy chủ. Trigger `kt_articles_ai_guard`: service_role **không** xuất bản, **không** sửa bài đã công khai / đã ẩn, **không** xóa bài (kể cả khi Supabase cấp quyền mặc định rộng) |
| Thông báo qua **hàng đợi + Telegram**, mặc định **dry-run** | Miễn phí, 2 bước cấu hình (BotFather → token + chat id). Không gửi thật cho tới khi OWNER đặt `KT_NOTIFY_MODE=send`. Tin chỉ có tiêu đề + link duyệt (link cần đăng nhập OWNER) |
| Link xem trước = `/quan-tri/#duyet/<jobId>` | Không có link công khai cho bài nháp; RLS owner-only (+ MFA nếu bật). Sau khi đăng nhập trang tự mở đúng bài |

## 2. Đã chạy thật bằng kiểm thử local
`node tools/run-all-tests.mjs` → **13/13 nhóm đạt** (KT_PGLITE đặt sẵn):

| Nhóm | Kết quả |
|---|---|
| **Máy chạy việc GĐ B** (`tools/kt-worker-test.mjs`) | **37/37** — trọn quy trình tới "Chờ OWNER duyệt"; 2 máy không nhận trùng; máy sập → chạy tiếp từ bước đã lưu (không gọi AI lại); lỗi tạm thời → hẹn giờ thử lại 20 s / 90 s, tối đa 3 lần; ảnh lỗi → tối đa 2 lần / ô rồi bỏ qua; hết hạn mức → dừng ngay; vượt ngân sách → không gọi AI; gói AI hỏng → tạo lại ≤ 3 lần; chặn vòng lặp > 80 tick; chờ AI bất đồng bộ + hết giờ; OWNER xuất bản / "Bỏ" giữa chừng → máy chủ dừng, không ghi đè; gói AI đòi "published" → vẫn nháp; sửa theo góp ý phía máy chủ dùng lại ảnh cũ; giới hạn ảnh / bài; lịch tự động (tắt / thiếu ngân sách / chưa tới giờ / 1 bài/ngày / đang bận / thiếu bảng giá); thông báo dry-run / gửi Telegram / thiếu cấu hình; OpenAI background + Anthropic Batches + ảnh WebP (fetch giả); Edge Function tick (khóa sai 401, thiếu cấu hình 503, tắt 503, tự nối tiếp + trần), cron + lịch, kick 202; kho PostgREST (điều kiện chủ khóa, luôn nháp, sửa chỉ khi nháp, lỗi "chưa cài migration"); tải ảnh (tên UUID, định dạng, ≤ 4,8 MB, không ghi đè); khung xem trước thu nhỏ |
| **SQL kt_r3** (`tools/kt-r3-sql-test.mjs`, PGlite) | **32/32** — cài một lần; lịch mặc định TẮT, không bật được khi chưa có ngân sách; nhận việc nguyên tử + bỏ qua việc hẹn giờ + khóa hết hạn nhận lại; chỉ service_role gọi được hàm nhận việc; OWNER không giả "generating" / không giữ khóa; OWNER "Bỏ" → máy chủ mất khóa; service_role tạo / sửa NHÁP được nhưng **không** xuất bản, **không** đánh dấu đã duyệt, **không** sửa bài công khai / đã ẩn, **không** xóa (kể cả khi có quyền DELETE); OWNER vẫn xuất bản bình thường; thông báo owner-only; rollback giữ nguyên bài + việc |
| Hồi quy | render 18, ảnh 8, dữ liệu 7, Xưởng GĐ2 33, kt_r1 74, kt_r2 26, web_02 15, file website cũ không đổi so với `67be669`, quét khóa, frontend không service_role |

**Kiểm thử trình duyệt (Chrome, `127.0.0.1:8781/quan-tri/?dev=1`, chỉ localStorage + thư mục tạm):**
- Tạo việc → máy chạy việc (mô phỏng) chạy trọn: viết → dàn trang → kiểm link → 3/3 ảnh → QA → "Chờ kiểm tra" (bài [MÔ PHỎNG] bị chặn xuất bản — đúng thiết kế).
- Trang duyệt: thẻ "Kiểm tra link nguồn (tự động)" + cảnh báo "chưa xác minh nội dung"; lịch tự động hiện **TẮT**.
- **Lỗi khung xem trước bị cắt ở ~1216 px: ĐÃ SỬA** — 🖥 dựng đúng 1200 px rồi thu nhỏ 65 % cho vừa khung, không cắt hai bên; 📱 390 px giữ nguyên.
- Kiểm tra link thật qua dev-server: Wikipedia tồn tại → 200; trang không tồn tại → 404; `https://127.0.0.1`, `http://` → bị chặn.

## 3. Vẫn là MOCK / chưa kiểm chứng
- **Mọi lời gọi AI** (viết, sửa, gợi ý, ảnh): mock provider hoặc fetch giả. Adapter OpenAI background / Anthropic Batches / ảnh WebP kiểm theo tài liệu chính thức, **chưa gọi API thật**.
- **Hành vi thật của Supabase**: `EdgeRuntime.waitUntil` + tự gọi lại với `verify_jwt`, pg_cron + pg_net + Vault, kích thước ảnh WebP thật, độ trễ thật — chưa chạy được vì không được deploy / migration.
- **Telegram**: chưa gửi tin thật (mặc định dry-run).
- Kiểm tra link **chỉ** xác nhận trang mở được — **không** xác minh nội dung chuyên môn. QA 4 quy tắc vẫn chỉ là lưới an toàn; OWNER phải đọc bài.

## 4. Rà soát giới hạn (yêu cầu 8)
Nguồn: tài liệu Supabase "Edge Functions → Limits" (đọc 2026-10-19).
| Giới hạn Supabase | Giá trị | Thiết kế đáp ứng |
|---|---|---|
| Thời gian chạy (wall clock) | 150 s (Free) / 400 s (trả phí), gồm cả việc chạy nền | Ngân sách 1 tick 100 s; bước nặng chỉ bắt đầu trong 25 s đầu; ảnh timeout ≤ 115 s; trễ nối tiếp kẹp theo thời gian còn lại (≤ 140 s) |
| CPU | 2 s / request (không tính chờ mạng) | Không giải mã / nén ảnh trên máy chủ; chỉ base64 → bytes rồi tải lên |
| Bộ nhớ | 256 MB | 1 ảnh / lần (≤ 4,8 MB) |
| Gọi lồng nhau | 30 lần / 60 s / trace | Trễ nối tiếp ≥ 2 s, thực tế mỗi tick + chờ ≫ 2 s; trần 300 lần / chuỗi |
| Request idle timeout | 150 s | `kick` trả 202 ngay; `tick` gọi nội bộ |

Ảnh: WebP 1536×1024 / 1024×1024, nén 82 — **ước tính** 150–400 KB / ảnh (chưa đo trên API thật); bucket giới hạn 5 MB, máy chủ từ chối > 4,8 MB.

## 5. Chi phí dự kiến (giá công bố, đọc 2026-10-19 — OWNER kiểm tra lại trước khi bật)
Nguồn: trang giá OpenAI (developers.openai.com/api/docs/pricing) và bảng giá ảnh trong hướng dẫn tạo ảnh.
| Khoản | Giá | Mỗi bài |
|---|---|---|
| Chữ, ví dụ `gpt-6.1-sol` (2 / 10 USD mỗi 1M token vào / ra) | ~6 nghìn token vào, ~7 nghìn ra | ≈ **0,08 USD** |
| Chữ, model mini `gpt-6-luna` (0,10 / 0,50 USD) | như trên | ≈ 0,004 USD (chất lượng cần OWNER thử) |
| Ảnh GPT Image 2, **medium**, 1536×1024 / 1024×1024 | 0,041 / 0,053 USD | 6 ảnh ≈ **0,25–0,32 USD** |
| Ảnh **low** | 0,005–0,006 USD | 6 ảnh ≈ 0,03 USD |
| Ảnh **high** | 0,165–0,211 USD | 6 ảnh ≈ 1,0–1,3 USD |
| Anthropic (chữ) | xem bảng giá Anthropic; Batches **giảm 50 %** | — (Anthropic không tạo ảnh) |
| Supabase (Edge Function, DB, Storage) | trong gói Free | 15–30 lần gọi / bài; ~1–2 MB ảnh / bài |
| Telegram | miễn phí | 0 |

**Ước tính:** ~**0,35 USD / bài** (chữ thường + ảnh medium); **1 bài / ngày ≈ 10–11 USD / tháng**; ảnh low ≈ 3–4 USD / tháng. Nhịp cron 5 phút ≈ 8.640 lần gọi / tháng (Free: 500.000). Chi phí phát sinh trong Giai đoạn B: **0đ**.

## 6. Thao tác OWNER phải làm MỘT LẦN (chi tiết: `DEPLOYMENT_CHECKLIST.md` mục C)
1. Duyệt + chạy `supabase/kt_r2_ai_migration.sql`, rồi `supabase/kt_r3_worker_migration.sql` (SQL Editor). Kiểm tra theo câu SQL cuối mỗi file.
2. Triển khai Edge Function: `supabase functions deploy kt-ai --project-ref bnumqtjzbyrtavsdlleq`.
3. Đặt Secrets: `KT_AI_ENABLED=1`, `KT_WORKER_SECRET=<chuỗi ngẫu nhiên ≥ 32 ký tự>`, `KT_AI_TEXT_PROVIDER=mock`, `KT_REVIEW_BASE_URL=https://yenphungviet.vercel.app`, `KT_NOTIFY_MODE=dry-run` (`SUPABASE_SERVICE_ROLE_KEY` Supabase tự cấp).
4. Thử trên Preview với mock (0đ): tạo bài → đóng trình duyệt → mở lại thấy bài "Chờ kiểm tra" ([MÔ PHỎNG] bị chặn duyệt là đúng).
5. (Tùy chọn) Thông báo Telegram: tạo bot bằng @BotFather, lấy chat id, đặt `KT_NOTIFY_TELEGRAM_TOKEN`, `KT_NOTIFY_TELEGRAM_CHAT`, `KT_NOTIFY_MODE=send`.
6. (Tùy chọn) Nhịp máy chủ + lịch: bật extension pg_cron + pg_net, chạy `supabase/kt_r3_schedule_enable.sql`. Lịch tự động vẫn TẮT cho tới khi OWNER đặt ngân sách và bật trong `/quan-tri/#ai`.
7. AI thật: tạo khóa OpenAI **có hạn mức chi tiêu tháng**, đặt `KT_AI_TEXT_PROVIDER=openai`, `KT_AI_TEXT_MODEL`, `KT_AI_IMAGE_PROVIDER=openai`, `KT_AI_IMAGE_MODEL=gpt-image-2`, `KT_AI_IMAGE_QUALITY=medium`, `KT_AI_PRICES`.
8. Merge lên Production (duyệt riêng) — nút "Duyệt xuất bản" chỉ bật trên website chính thức.

## 7. File thay đổi
- Mới: `assets/kt/ai/worker.mjs`, `sources.mjs`, `notify.mjs`; `supabase/functions/kt-ai/server-store.mjs`; `supabase/kt_r3_worker_migration.sql`, `kt_r3_worker_rollback.sql`, `kt_r3_schedule_enable.sql`, `kt_r3_schedule_disable.sql`; `quan-tri/fit.mjs`; `tools/kt-worker-test.mjs`, `tools/kt-r3-sql-test.mjs`; báo cáo này.
- Sửa: `assets/kt/ai/providers.mjs` (submit/poll bất đồng bộ, ảnh WebP), `pipeline.mjs` (trạng thái "Đang chờ máy chủ"); `supabase/functions/kt-ai/handler.mjs` (tick, kick, status), `index.ts` (waitUntil); `quan-tri/factory.mjs` (hàng đợi, lịch, thông báo, link nguồn, khung xem trước), `admin.mjs` (ảnh chia sẻ cho ảnh bìa AI), `assets/css/quan-tri.css`; `tools/dev-server.mjs` (ảnh PNG mock, kiểm tra link local), `tools/kt-sql-stub.sql` (role service_role), `tools/run-all-tests.mjs`; bản sao `supabase/functions/kt-ai/ai/*` (build-edge).
- Không đổi: trang chủ, 3 nhóm chim, Catalogue, Cẩm nang, form, Zalo, `birds`, `leads`, `notify-lead`, App trại.
