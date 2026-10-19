-- =====================================================================
-- YẾN PHỤNG PET — BẬT "NHỊP" MÁY CHẠY VIỆC (pg_cron gọi Edge Function kt-ai mỗi 5 phút)
-- ⚠️ CHƯA CHẠY. OWNER chỉ chạy khi đã: cài kt_r3, triển khai kt-ai, đặt Secret KT_WORKER_SECRET, đặt ngân sách.
--
-- Nhịp này làm 2 việc:
--  (a) đánh thức việc đang chờ (ví dụ chờ AI viết xong, lỗi tạm thời cần thử lại) — an toàn, chỉ chạy việc OWNER đã tạo;
--  (b) LỊCH TẠO BÀI TỰ ĐỘNG — CHỈ chạy khi trong /quan-tri/#ai OWNER bật "Lịch tự động" (kt_ai_settings.auto_enabled),
--      mà muốn bật thì phải đặt ngân sách tháng. Mặc định TẮT. AI không bao giờ tự xuất bản.
--
-- Trước khi chạy: Supabase → Database → Extensions: bật pg_cron và pg_net.
-- Thay <WORKER_SECRET> bằng ĐÚNG giá trị Secret KT_WORKER_SECRET (≥ 32 ký tự ngẫu nhiên) và <ANON_KEY> bằng anon key.
-- Khóa được cất trong Supabase Vault (mã hóa), không nằm trong định nghĩa lịch.
-- =====================================================================
select vault.create_secret('<WORKER_SECRET>', 'kt_worker_secret', 'YẾN PHỤNG PET: khóa máy chạy việc kt-ai');
select vault.create_secret('<ANON_KEY>', 'kt_anon_key', 'YẾN PHỤNG PET: anon key (JWT cho verify_jwt)');

select cron.schedule('kt-ai-tick', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://bnumqtjzbyrtavsdlleq.supabase.co/functions/v1/kt-ai',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'kt_anon_key'),
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'kt_anon_key'),
      'x-kt-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'kt_worker_secret')),
    body := '{"action":"tick","source":"cron"}'::jsonb,
    timeout_milliseconds := 5000);
$$);

-- Kiểm tra: select jobname, schedule, active from cron.job where jobname = 'kt-ai-tick';
-- Xem kết quả gọi gần nhất: select status_code, content::text from net._http_response order by created desc limit 5;
