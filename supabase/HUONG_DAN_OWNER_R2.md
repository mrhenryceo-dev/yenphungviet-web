# HƯỚNG DẪN OWNER — Bật chuyên mục "Kiến thức chuyên sâu" trên Supabase

Làm **theo đúng thứ tự**. Mỗi bước chỉ thao tác trên Supabase Dashboard của dự án **`yenphungpet-web`** (dự án RIÊNG cho website, OWNER tạo mới).
Tên menu trên Dashboard có thể khác đôi chút giữa các phiên bản Supabase. Nếu không thấy, tìm theo từ khóa trong ngoặc.

> ⛔ **KHÔNG làm các bước dưới trên `bird-farm` (`bnumqtjzbyrtavsdlleq`) hay `yenphungpet-v2-staging` (`cynpwmjkflhlrdqxoyhx`).**
> Đó là App quản lý trại: tắt đăng ký hoặc sửa `auth.users` ở đó có thể làm hỏng App.
> Trước mỗi bước, kiểm tra thanh địa chỉ có ID của `yenphungpet-web`.

## BƯỚC −1 — Tạo dự án và gửi thông tin CÔNG KHAI

1. **New project** → Name: `yenphungpet-web` → Region: **Southeast Asia (Singapore)** → đặt mật khẩu database mạnh (lưu vào trình quản lý mật khẩu, **không gửi**).
2. Khi dự án chạy xong: **Project Settings → API** (hoặc *API Keys*). Gửi cho Claude:
   - **Project ID** (20 chữ cái, cũng nằm trên thanh địa chỉ),
   - khóa **anon / publishable** (khóa công khai, bắt đầu bằng `eyJ…` loại *anon*, hoặc `sb_publishable_…`).
   - **Không gửi** khóa `service_role` / `sb_secret_…`. Công cụ của Claude cũng tự từ chối các khóa này.
3. Claude chạy `tools/kt-set-project.mjs` để trỏ riêng phần Kiến thức chuyên sâu sang dự án mới. Trang chủ, chim, form vẫn dùng dự án cũ.

> Không ai cần biết mật khẩu của OWNER, kể cả Claude. Không gửi mật khẩu, mã OTP hay khóa `service_role` qua chat.

---

## BƯỚC 0 — Kiểm tra trước (chỉ đọc, không thay đổi gì)

**Vì sao cần:** policy của Storage là loại "cộng dồn". Nếu dự án đang có sẵn một policy cho phép mọi người đã đăng nhập upload vào **mọi** bucket, người lạ vẫn có thể upload vào bucket mới. Cần xem trước.

1. Vào **SQL Editor** → **New query**.
2. Dán và bấm **Run**:
   ```sql
   select policyname, cmd, roles::text, qual, with_check
     from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
    order by policyname;
   ```
3. Chụp màn hình kết quả gửi cho Claude/GPT.
   - **Không có dòng nào**, hoặc chỉ có policy gắn với bucket cụ thể (có `bucket_id = '…'`): an toàn, làm tiếp.
   - Có policy **không** giới hạn `bucket_id` cho `authenticated` hoặc `public`: **dừng lại**, báo trước khi chạy migration.
4. (Tùy chọn) Kiểm tra chưa có bảng trùng tên:
   ```sql
   select to_regclass('public.kt_articles') as bang_da_co;   -- phải là NULL
   ```

## BƯỚC 1 — Tạo tài khoản OWNER

1. **Authentication** → **Users** → **Add user** → **Create new user**.
2. Nhập **email** của OWNER và một **mật khẩu mạnh**: tối thiểu 14 ký tự, có chữ hoa, chữ thường, số và ký tự đặc biệt. Lưu mật khẩu vào trình quản lý mật khẩu.
3. Tick **Auto Confirm User** (để không cần bấm link xác nhận email) → **Create user**.

## BƯỚC 2 — Tắt tự đăng ký

1. **Authentication** → **Sign In / Providers** (hoặc *Providers* / *Auth settings*).
2. Tìm **Allow new users to sign up** (mục *User Signups*) → **tắt** → **Save**.
3. Website hiện tại không dùng đăng ký tài khoản, nên tắt mục này không ảnh hưởng gì khác.

## BƯỚC 3 — Chạy migration

1. **SQL Editor** → **New query**.
2. Mở file `supabase/kt_r1_migration.sql`, copy **toàn bộ phần từ `begin;` tới `commit;`** (không cần các dòng comment phía dưới), dán vào → **Run**.
3. Kết quả mong đợi: *Success. No rows returned*. Nếu báo lỗi: **chụp màn hình gửi lại, không sửa tay**.
4. Kiểm tra:
   ```sql
   select to_regclass('public.kt_articles') as bang,
          (select count(*) from storage.buckets where id = 'kien-thuc') as bucket,
          (select count(*) from pg_policies where policyname like 'kt_%') as so_policy;  -- mong đợi: kt_articles | 1 | 6
   ```

## BƯỚC 4 — Gán quyền OWNER cho tài khoản

Thay `email-cua-owner@vi-du.com` bằng email ở BƯỚC 1, rồi chạy:
```sql
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"kt_role":"owner"}'::jsonb
 where email = 'email-cua-owner@vi-du.com';

select email, raw_app_meta_data ->> 'kt_role' as kt_role
  from auth.users where raw_app_meta_data ->> 'kt_role' = 'owner';   -- phải ra ĐÚNG 1 dòng
```

## BƯỚC 5 — Đăng nhập và bật xác thực 2 lớp (MFA)

> Trang `/quan-tri/` chỉ có trên website **sau khi** nhánh Phase 1R được đưa lên Preview hoặc Production. Bước này làm vào lúc đó.

1. Cài một ứng dụng xác thực trên điện thoại: **Google Authenticator** hoặc **Microsoft Authenticator**.
2. Mở `/quan-tri/` → đăng nhập bằng email và mật khẩu ở BƯỚC 1.
3. Bấm **Bảo mật** (góc trên bên phải) → quét **mã QR** bằng ứng dụng → nhập **mã 6 số** → **Xác nhận và bật**.
4. Đăng xuất rồi đăng nhập lại: trang sẽ hỏi mã 6 số. Như vậy là MFA đã chạy.
5. **Bắt buộc MFA cho mọi thao tác ghi** (khuyến nghị). Chạy trong SQL Editor:
   ```sql
   update auth.users
      set raw_app_meta_data = raw_app_meta_data || '{"kt_mfa":"required"}'::jsonb
    where email = 'email-cua-owner@vi-du.com';
   ```
   Sau đó đăng xuất rồi đăng nhập lại `/quan-tri/`.
6. **Nếu mất điện thoại:** chạy lệnh sau để tạm gỡ yêu cầu MFA, rồi đăng ký lại ở mục Bảo mật:
   ```sql
   update auth.users set raw_app_meta_data = raw_app_meta_data - 'kt_mfa' where email = 'email-cua-owner@vi-du.com';
   ```
   Có thể xóa thiết bị cũ tại **Authentication → Users → (tài khoản) → MFA factors**.

## BƯỚC 6 — Báo lại để kiểm thử

Báo cho Claude/GPT: "Đã làm xong BƯỚC 0–4". Claude sẽ chạy 13 bài kiểm thử phân quyền (`supabase/kt_rls_test.md`) bằng anon key công khai, **không cần mật khẩu**. Các bài kiểm thử cần đăng nhập OWNER, OWNER tự thao tác trên `/quan-tri/`.

---

## HOÀN TÁC (nếu cần)

1. Trong `/quan-tri/` bấm **Tải bản sao lưu** (sẽ có ở R3–R4), hoặc bỏ qua nếu chưa có bài.
2. SQL Editor → chạy nội dung `supabase/kt_r1_rollback.sql`.
3. Chỉ các đối tượng `kt_*` bị xóa. `birds`, `leads`, `notify-lead` không bị ảnh hưởng. Bucket `kien-thuc` được giữ lại (xóa thủ công khi đã trống).
