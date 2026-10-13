# HƯỚNG DẪN OWNER — Bật "Kiến thức chuyên sâu" trên Supabase **bird-farm**

Dự án đích: **bird-farm** — Project ID **`bnumqtjzbyrtavsdlleq`** (đúng dự án website đang dùng).
Database này DÙNG CHUNG với App quản lý trại. Migration chỉ THÊM các đối tượng `kt_*` + bucket `kien-thuc`,
không sửa bảng, policy, cài đặt Auth hay dữ liệu nào đang có.

> ⛔ Trước MỖI bước: thanh địa chỉ phải là `supabase.com/dashboard/project/bnumqtjzbyrtavsdlleq/...`
> ⛔ KHÔNG làm trên `yenphungpet-v2-staging` (`cynpwmjkflhlrdqxoyhx`).
> Không gửi qua chat: mật khẩu, mã OTP, khóa `service_role` / `sb_secret_`.

---

## BƯỚC 0 — Kiểm tra trước (CHỈ ĐỌC)

**SQL Editor → New query**, dán cả 2 câu, bấm **Run**, chụp kết quả gửi Claude/GPT:

```sql
-- (A) Có đối tượng trùng tên Phase 1R không? Mong đợi: KHÔNG CÓ DÒNG NÀO.
select 'ham' as loai, p.proname::text as ten from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname like 'kt\_%'
union all
select 'bang', c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname like 'kt\_%'
union all
select 'policy', policyname::text from pg_policies where policyname like 'kt\_%'
union all
select 'bucket', id from storage.buckets where id = 'kien-thuc';
```

```sql
-- (B) Policy hiện có trên Storage (của App trại).
select policyname, permissive, cmd, roles::text, qual, with_check
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
 order by policyname;
```

**Đọc kết quả:**
- (A) **không có dòng nào** → làm tiếp. Có dòng → **dừng**, gửi ảnh. (Migration cũng tự dừng trong trường hợp này.)
- (B) cột `permissive` toàn là **PERMISSIVE** → làm tiếp, kể cả khi có policy rộng: migration có chốt RESTRICTIVE chặn người lạ ghi vào `kien-thuc`.
- (B) có dòng **RESTRICTIVE** → **dừng**, gửi ảnh (có thể chặn cả OWNER upload ảnh bài viết).

## BƯỚC 1 — Tạo tài khoản quản trị Kiến thức (RIÊNG, không dùng tài khoản App trại)

Lý do: bật MFA và gán quyền trên một tài khoản riêng sẽ không ảnh hưởng cách đăng nhập App quản lý trại.

1. **Authentication → Users → Add user → Create new user**.
2. Email: dùng một email riêng của OWNER. Với Gmail có thể dùng dạng `ten+kienthuc@gmail.com` (thư vẫn về hộp thư chính).
3. Mật khẩu mạnh ≥ 14 ký tự, lưu vào trình quản lý mật khẩu. Tick **Auto Confirm User** → **Create user**.

> **KHÔNG tắt "Allow new users to sign up"** trên bird-farm: App trại có thể cần.
> Quyền quản trị bài viết không phụ thuộc cài đặt này — người tự đăng ký không tự gán được quyền OWNER.

## BƯỚC 2 — Chạy migration

1. **SQL Editor → New query**.
2. Mở `supabase/kt_r1_migration.sql`, copy **từ `begin;` tới `commit;`**, dán → **Run**.
3. Mong đợi: *Success. No rows returned*.
   Nếu thấy `kt: DỪNG — ...` hoặc lỗi khác: **không có gì bị tạo** (cả giao dịch được hủy). Chụp màn hình gửi lại, không sửa tay.
4. Kiểm tra:
   ```sql
   select to_regclass('public.kt_articles') as bang,
          (select count(*) from storage.buckets where id = 'kien-thuc') as bucket,
          (select count(*) from pg_policies where policyname like 'kt\_%') as so_policy;
   -- mong đợi: kt_articles | 1 | 10
   ```

## BƯỚC 3 — Gán quyền OWNER cho tài khoản ở BƯỚC 1

Thay `email-quan-tri@vi-du.com` bằng email ở BƯỚC 1:
```sql
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"kt_role":"owner"}'::jsonb
 where email = 'email-quan-tri@vi-du.com';

select email, raw_app_meta_data ->> 'kt_role' as kt_role
  from auth.users where raw_app_meta_data ->> 'kt_role' = 'owner';   -- phải ra ĐÚNG 1 dòng
```
Câu `update` chỉ thêm khóa `kt_role` vào đúng 1 tài khoản; các tài khoản App trại không bị đổi.

## BƯỚC 4 — Báo lại để kiểm thử

Gửi: "Đã xong BƯỚC 0–3" + ảnh kết quả BƯỚC 0 và BƯỚC 2.4.
Claude chạy các kiểm thử phân quyền phía khách bằng anon key công khai (không cần mật khẩu).

## BƯỚC 5 — MFA (làm SAU, khi `/quan-tri/` đã có trên Preview)

1. Cài **Google Authenticator** / **Microsoft Authenticator**.
2. Vào `/quan-tri/` → đăng nhập tài khoản BƯỚC 1 → **Bảo mật** → quét QR → nhập mã 6 số.
3. Đăng xuất, đăng nhập lại: trang hỏi mã 6 số là đạt.
4. Bắt buộc MFA cho thao tác ghi:
   ```sql
   update auth.users set raw_app_meta_data = raw_app_meta_data || '{"kt_mfa":"required"}'::jsonb
    where email = 'email-quan-tri@vi-du.com';
   ```
5. Mất điện thoại: `update auth.users set raw_app_meta_data = raw_app_meta_data - 'kt_mfa' where email = 'email-quan-tri@vi-du.com';`
   rồi xóa thiết bị cũ ở **Authentication → Users → (tài khoản) → MFA factors**.

---

## HOÀN TÁC

1. (Khi đã có bài) tải bản sao lưu trong `/quan-tri/`.
2. SQL Editor → chạy `supabase/kt_r1_rollback.sql`.
3. Chỉ đối tượng `kt_*` bị xóa. `birds`, `leads`, `notify-lead`, bảng và policy của App trại không bị ảnh hưởng.
   Bucket `kien-thuc` được giữ (xóa thủ công khi đã trống).
