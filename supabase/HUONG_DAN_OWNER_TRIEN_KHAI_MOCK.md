# HƯỚNG DẪN OWNER — TRIỂN KHAI THỬ XƯỞNG NỘI DUNG (CHẾ ĐỘ MOCK, 0đ) TRÊN SUPABASE THẬT

Mục tiêu: chạy thử toàn bộ quy trình **phía máy chủ** (tạo bài → đóng trình duyệt → máy chủ tự làm → bài chờ duyệt) với **AI mô phỏng**, không tốn tiền, trước khi bật AI thật.
Dự án Supabase: **bird-farm** (`bnumqtjzbyrtavsdlleq`). Thời gian: ~45 phút. Làm lần lượt, dừng lại nếu một bước báo lỗi.

**Những thứ KHÔNG bị đụng:** bảng `birds`, `leads`, Edge Function `notify-lead`, bảng / policy của App trại, cài đặt Auth, policy Storage hiện có, trang chủ, website Production.
**Những thứ CHƯA làm trong hướng dẫn này:** khóa AI thật, lịch tự động, cron, Telegram, merge Production.

---

## Bước 0 — Kiểm tra trước (CHỈ ĐỌC, không thay đổi gì)
Supabase Dashboard → **SQL Editor** → New query → dán và **Run**:
```sql
select
  to_regclass('public.kt_articles')        is not null as co_kt_r1,          -- phải: true
  to_regprocedure('public.kt_is_owner()')  is not null as co_ham_owner,      -- phải: true
  to_regclass('public.kt_ai_jobs')         is not null as da_co_kt_r2,       -- phải: false
  to_regclass('public.kt_ai_settings')     is not null as da_co_kt_r3,       -- phải: false
  (select count(*) from pg_roles where rolname = 'service_role') as co_service_role,   -- phải: 1
  (select count(*) from public.kt_articles where status = 'published') as bai_cong_khai; -- hiện: 1
```
Nếu khác "phải" → **dừng**, gửi kết quả cho Claude.

Kiểm tra khóa API: **Project Settings → API Keys** → tab **Legacy API keys** phải còn `anon` và `service_role` (Xưởng dùng hai khóa này). Nếu đã tắt khóa legacy → dừng, báo Claude.

## Bước 1 — Sao lưu bài viết hiện có (khuyến nghị)
SQL Editor → Run → bấm **Copy** kết quả, lưu vào file `.json` trên máy:
```sql
select json_agg(a) from public.kt_articles a;
```

## Bước 2 — Chạy migration kt_r2 (Xưởng nội dung)
1. Mở file `supabase/kt_r2_ai_migration.sql` (Notepad) → **chọn tất cả** → dán vào SQL Editor → **Run**.
2. Kết quả "Success. No rows returned" là đúng. Nếu báo `kt_r2: DỪNG …` → không có gì thay đổi, gửi lỗi cho Claude.
3. Kiểm tra (phải ra `3 | 4`):
```sql
select (select count(*) from pg_tables where tablename in ('kt_ai_jobs','kt_article_versions','kt_ai_usage')) as bang,
       (select count(*) from pg_policies where policyname like 'kt\_ai\_%' or policyname like 'kt\_ver\_%') as so_policy;
```

## Bước 3 — Chạy migration kt_r3 (máy chạy việc)
1. Làm như bước 2 với file `supabase/kt_r3_worker_migration.sql`.
2. Kiểm tra (phải ra `true | false | 3`):
```sql
select to_regprocedure('public.kt_ai_claim_job(text,integer)') is not null as co_ham_nhan_viec,
       (select auto_enabled from public.kt_ai_settings where id = 1) as lich_tu_dong,
       (select count(*) from pg_policies where policyname like 'kt\_ai\_settings%' or policyname like 'kt\_ai\_notif%') as so_policy;
```
> Sau bước 2–3 **không có gì tự chạy**: không cron, không worker, không gọi AI. Trigger chỉ kiểm tra khi có thao tác ghi. Lịch tự động = **false**.

## Bước 4 — Tạo khóa máy chạy việc (KT_WORKER_SECRET)
Trên máy Windows, mở **PowerShell**, dán (tạo chuỗi ngẫu nhiên 48 ký tự, không gửi đi đâu):
```powershell
$b = New-Object byte[] 36; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); ([Convert]::ToBase64String($b) -replace '[+/=]','x')
```
Copy chuỗi vừa hiện. **Không gửi chuỗi này qua chat / email.**

## Bước 5 — Đặt Secrets (chế độ mock)
Dashboard → **Edge Functions → Secrets** → thêm từng dòng → **Save**:

| Key | Value |
|---|---|
| `KT_AI_ENABLED` | `1` |
| `KT_AI_TEXT_PROVIDER` | `mock` |
| `KT_AI_IMAGE_PROVIDER` | `mock` |
| `KT_WORKER_SECRET` | *(chuỗi ở bước 4)* |
| `KT_ALLOWED_ORIGINS` | `https://yenphungviet.vercel.app` |
| `KT_ALLOWED_ORIGIN_SUFFIX` | `-mrhenryceo-2691s-projects.vercel.app` |
| `KT_REVIEW_BASE_URL` | `https://yenphungviet.vercel.app` |
| `KT_NOTIFY_MODE` | `dry-run` |

Không đặt bất kỳ khóa OpenAI / Anthropic / Telegram nào ở bước này. `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` do Supabase **tự cấp** (không tạo được tên bắt đầu bằng `SUPABASE_`).

## Bước 6 — Triển khai Edge Function kt-ai
Cần Node.js (máy đã có). Mở PowerShell:
```powershell
cd D:\AI-Projects\YenPhungViet_phase1r
node tools/build-edge.mjs --check          # phải báo: ✓ Edge Function đồng bộ (14 file)
npx supabase@latest login                  # mở trình duyệt để đăng nhập Supabase
npx supabase@latest functions deploy kt-ai --project-ref bnumqtjzbyrtavsdlleq --use-api
```
- `--use-api`: đóng gói trên máy chủ Supabase, **không cần Docker**.
- **Không** thêm `--no-verify-jwt` (giữ kiểm tra đăng nhập mặc định).
- Kiểm tra: Dashboard → Edge Functions → thấy `kt-ai`; `notify-lead` vẫn còn nguyên.
- Nếu CLI báo thiếu `supabase/config.toml` hoặc lỗi khác → **dừng**, chụp màn hình gửi Claude (không tự chạy `supabase init` trong thư mục dự án).

## Bước 7 — Chạy thử trên Preview (mock, 0đ)
1. Mở Preview mới nhất của nhánh `feature/phase1s-ai-factory` (Claude gửi link) → đăng nhập Vercel → `/quan-tri/` → đăng nhập OWNER → `#ai`.
2. Phải thấy: chip **"MÔ PHỎNG (mock)"** và dòng **"Máy chạy việc: sẵn sàng (chạy phía máy chủ)"**.
3. Mở "Hoặc tự nhập chủ đề" → nhập `Thử máy chủ: chuẩn bị chuồng mùa mưa` → **+ Tạo việc** → thấy thông báo "Đã giao việc cho máy chủ".
4. **Đóng tab trình duyệt.** Đợi 2 phút. Mở lại `/quan-tri/#ai`.
5. Đúng khi: việc ở mục **"Cần chú ý"**, trạng thái **"Chờ kiểm tra"**, QA báo *"Đây là bài MÔ PHỎNG … không được xuất bản"* (mock **bị chặn duyệt là ĐÚNG**), ảnh 3/3 là ảnh sọc giữ chỗ.
6. Bấm **Xem & duyệt**: thấy thẻ "Kiểm tra link nguồn (tự động)"; nút **Duyệt xuất bản bị khóa** trên Preview (đúng thiết kế).
7. Kiểm tra thông báo chỉ được ghi lại, KHÔNG gửi:
```sql
select kind, status, created_at from public.kt_ai_notifications order by created_at desc limit 5;   -- status = dry_run
```
8. Nếu việc vẫn "Đang chờ máy chủ" sau 5 phút: Dashboard → Edge Functions → kt-ai → **Logs** → chụp màn hình gửi Claude.

## Bước 8 — Dọn dữ liệu thử (sau khi đã xem xong)
Bài mô phỏng là **nháp** (khách không thấy). Muốn xóa: SQL Editor →
```sql
delete from public.kt_ai_jobs where title like 'Thử máy chủ%';
delete from public.kt_articles where status = 'draft' and title like '[MÔ PHỎNG]%';
```
Ảnh giữ chỗ (PNG) nằm trong Storage → bucket `kien-thuc` → `img/` (file `…-1600.png`); xóa tay nếu muốn, không ảnh hưởng website.

## Dừng khẩn cấp / hoàn tác
| Muốn | Làm |
|---|---|
| Tắt ngay mọi hoạt động của Xưởng | Secret `KT_AI_ENABLED` = `0` (có hiệu lực ngay, không cần deploy lại) |
| Gỡ function | Dashboard → Edge Functions → kt-ai → Delete (không đụng `notify-lead`) |
| Gỡ database | Chạy `kt_r3_worker_rollback.sql` **rồi** `kt_r2_ai_rollback.sql` (sai thứ tự → bị từ chối, không mất gì). Bài viết `kt_articles` **không** bị xóa |

## Ghi chú giới hạn gói Free
- Edge Function: tối đa 150 giây / lần chạy, 2 giây CPU, 500.000 lần gọi / tháng. Chế độ mock: 1 bài ≈ 2–3 lần gọi.
- Máy chạy việc tự gọi lại chính mình (không cần cron). Nếu chuỗi tự gọi bị đứt, việc sẽ được đánh thức lại khi OWNER mở `/quan-tri/#ai` (hoặc khi bật cron sau này).
- Dự án Free bị **tạm dừng sau 1 tuần không hoạt động** — website đang đọc database hằng ngày nên không bị ảnh hưởng.
