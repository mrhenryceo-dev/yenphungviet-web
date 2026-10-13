// Phase 1R — chạy thử migration + kiểm thử RLS trên Postgres local (PGlite, WASM). KHÔNG chạm Supabase thật.
// Chạy: node tools/kt-sql-test.mjs <đường-dẫn-tới-node_modules/@electric-sql/pglite/dist/index.js>
import { readFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const pgliteEntry = process.argv[2];
if (!pgliteEntry) { console.error('Thiếu đường dẫn PGlite'); process.exit(2); }
const { PGlite } = await import(pathToFileURL(pgliteEntry).href);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sql = f => readFile(path.join(ROOT, f), 'utf8');

const db = new PGlite();
await db.exec(await sql('tools/kt-sql-stub.sql'));

// Ảnh chụp trạng thái birds/leads TRƯỚC migration
const snap = async () => ({
  birds: (await db.query('select count(*)::int n from public.birds')).rows[0].n,
  leads: (await db.query('select count(*)::int n from public.leads')).rows[0].n,
  policies: (await db.query("select tablename, policyname, cmd, roles::text, qual, with_check from pg_policies where tablename in ('birds','leads') order by 1,2")).rows,
  grants: (await db.query("select table_name, grantee, privilege_type from information_schema.role_table_grants where table_name in ('birds','leads') order by 1,2,3")).rows,
  oldBucket: (await db.query("select * from storage.buckets where id='Halan'")).rows
});
const before = await snap();

await db.exec(await sql('supabase/kt_r1_migration.sql'));
await db.exec(await sql('supabase/kt_r1_migration.sql'));   // chạy lại lần 2: phải không lỗi (idempotent)

const OWNER = 'aaaaaaaa-0000-4000-8000-000000000001', STRANGER = 'bbbbbbbb-0000-4000-8000-000000000002';
const claims = {
  anon: { role: 'anon' },
  stranger: { role: 'authenticated', sub: STRANGER, aal: 'aal1', app_metadata: { provider: 'email' }, user_metadata: { kt_role: 'owner' } },
  owner: { role: 'authenticated', sub: OWNER, aal: 'aal1', app_metadata: { provider: 'email', kt_role: 'owner' } },
  ownerMfaAal1: { role: 'authenticated', sub: OWNER, aal: 'aal1', app_metadata: { kt_role: 'owner', kt_mfa: 'required' } },
  ownerMfaAal2: { role: 'authenticated', sub: OWNER, aal: 'aal2', app_metadata: { kt_role: 'owner', kt_mfa: 'required' } }
};
async function as(who, q, params = []) {
  const c = claims[who];
  await db.exec(`select set_config('request.jwt.claims', '${JSON.stringify(c).replace(/'/g, "''")}', false); set role ${c.role};`);
  try { return await db.query(q, params); }
  finally { await db.exec('reset role; select set_config(\'request.jwt.claims\', \'\', false);'); }
}
async function denied(who, q, params) { try { await as(who, q, params); return false; } catch (e) { return e.message; } }

let n = 0; const ok = (name, cond, extra = '') => { assert.ok(cond, name + ' ' + extra); n++; console.log('✓', name); };

// Dữ liệu: 1 bài nháp + 1 bài công khai (tạo bằng quyền OWNER)
const full = `'{"path":"x/a-1600.webp"}'::jsonb, '["Nguồn A"]'::jsonb, true`;
await as('owner', `insert into public.kt_articles (slug,title,status) values ('bai-nhap','Bài nháp','draft')`);
await as('owner', `insert into public.kt_articles (slug,title,seo_description,cover,sources,reviewed_by_owner,status) values ('bai-cong-khai','Bài công khai','Mô tả', ${full}, 'published')`);

// 1–3 KHÁCH
ok('1. Khách chỉ thấy bài published', (await as('anon', 'select slug from public.kt_articles')).rows.map(r => r.slug).join() === 'bai-cong-khai');
ok('2. Khách không insert được', !!(await denied('anon', `insert into public.kt_articles (slug,title) values ('xx-khach','Khách')`)));
ok('3a. Khách không update được', !!(await denied('anon', `update public.kt_articles set title='hack'`)));
ok('3b. Khách không delete được', !!(await denied('anon', `delete from public.kt_articles`)));
// 4–6 NGƯỜI ĐÃ ĐĂNG NHẬP NHƯNG KHÔNG PHẢI OWNER (kể cả tự ghi kt_role vào user_metadata)
ok('4. Người lạ chỉ thấy bài published', (await as('stranger', 'select slug from public.kt_articles')).rows.length === 1);
ok('5. Người lạ insert bị RLS chặn', /row-level security/i.test(await denied('stranger', `insert into public.kt_articles (slug,title) values ('nguoi-la','Người lạ')`) || ''));
const upd = await as('stranger', `update public.kt_articles set title='hack' returning id`);
ok('6a. Người lạ update: 0 dòng bị sửa', upd.rows.length === 0);
const del = await as('stranger', `delete from public.kt_articles returning id`);
ok('6b. Người lạ delete: 0 dòng bị xóa', del.rows.length === 0);
ok('6c. user_metadata.kt_role=owner KHÔNG có tác dụng', (await as('stranger', 'select public.kt_is_owner() v')).rows[0].v === false);
ok('6d. Người dùng API không sửa được auth.users (tự cấp quyền)', !!(await denied('stranger', `update auth.users set raw_app_meta_data = '{"kt_role":"owner"}'`)));
// 7–9 OWNER
ok('7. OWNER thấy cả bài nháp', (await as('owner', 'select count(*)::int n from public.kt_articles')).rows[0].n === 2);
ok('8a. Xuất bản thiếu mô tả SEO bị chặn', /seo_description/.test(await denied('owner', `update public.kt_articles set status='published' where slug='bai-nhap'`) || ''));
ok('8b. Xuất bản thiếu ảnh bìa bị chặn', /cover/.test(await denied('owner', `update public.kt_articles set status='published', seo_description='m' where slug='bai-nhap'`) || ''));
ok('8c. Xuất bản thiếu nguồn bị chặn', /sources/.test(await denied('owner', `update public.kt_articles set status='published', seo_description='m', cover='{"path":"a.webp"}' where slug='bai-nhap'`) || ''));
ok('8d. Xuất bản chưa tick checklist bị chặn', /reviewed_by_owner/.test(await denied('owner', `update public.kt_articles set status='published', seo_description='m', cover='{"path":"a.webp"}', sources='["s"]' where slug='bai-nhap'`) || ''));
const pub = await as('owner', `update public.kt_articles set status='published', seo_description='m', cover='{"path":"a.webp"}', sources='["s"]', reviewed_by_owner=true where slug='bai-nhap' returning published_at`);
ok('9. Xuất bản đủ điều kiện + tự điền published_at', pub.rows.length === 1 && !!pub.rows[0].published_at);
await as('owner', `update public.kt_articles set status='hidden' where slug='bai-nhap'`);
ok('10. Ẩn bài → khách không còn thấy', (await as('anon', `select 1 from public.kt_articles where slug='bai-nhap'`)).rows.length === 0);
ok('10b. Slug sai định dạng bị chặn', !!(await denied('owner', `insert into public.kt_articles (slug,title) values ('Sai Slug!','Tiêu đề hợp lệ')`)));
// MFA
ok('11a. kt_mfa=required + aal1 → KHÔNG ghi được', /row-level security/i.test(await denied('ownerMfaAal1', `insert into public.kt_articles (slug,title) values ('mfa-aal1','Bài MFA 1')`) || ''));
ok('11b. kt_mfa=required + aal2 → ghi được', (await as('ownerMfaAal2', `insert into public.kt_articles (slug,title) values ('mfa-aal2','Bài MFA 2') returning id`)).rows.length === 1);
// STORAGE
const bk = (await db.query("select public, file_size_limit, allowed_mime_types from storage.buckets where id='kien-thuc'")).rows[0];
ok('12a. Bucket kien-thuc: công khai, 5 MB, chỉ ảnh', bk.public === true && Number(bk.file_size_limit) === 5242880 && bk.allowed_mime_types.join() === 'image/webp,image/jpeg,image/png');
ok('12b. Khách không upload được', !!(await denied('anon', `insert into storage.objects (bucket_id,name) values ('kien-thuc','a.webp')`)));
ok('12c. Người lạ không upload được', /row-level security/i.test(await denied('stranger', `insert into storage.objects (bucket_id,name) values ('kien-thuc','a.webp')`) || ''));
ok('12d. OWNER upload được vào kien-thuc', (await as('owner', `insert into storage.objects (bucket_id,name) values ('kien-thuc','x/a.webp') returning id`)).rows.length === 1);
ok('12e. OWNER KHÔNG ghi được vào bucket khác (Halan)', /row-level security/i.test(await denied('owner', `insert into storage.objects (bucket_id,name) values ('Halan','hack.jpg')`) || ''));
ok('12f. Người lạ không xóa được ảnh', (await as('stranger', `delete from storage.objects returning id`)).rows.length === 0);
// birds / leads KHÔNG đổi
const after = await snap();
ok('13. birds/leads/policy/grant/bucket cũ giữ nguyên sau migration', JSON.stringify(before) === JSON.stringify(after));
// ROLLBACK
await db.exec(await sql('supabase/kt_r1_rollback.sql'));
const left = (await db.query("select (select count(*) from pg_tables where tablename like 'kt_%')::int t, (select count(*) from pg_proc where proname like 'kt_%')::int f, (select count(*) from pg_policies where policyname like 'kt_%')::int p")).rows[0];
ok('14. Rollback xóa sạch kt_* (bảng, hàm, policy)', left.t === 0 && left.f === 0 && left.p === 0, JSON.stringify(left));
ok('15. Sau rollback birds/leads vẫn nguyên', JSON.stringify(await snap()) === JSON.stringify(before));
await db.exec(await sql('supabase/kt_r1_migration.sql'));
ok('16. Chạy lại migration sau rollback không lỗi', (await db.query("select count(*)::int n from pg_tables where tablename='kt_articles'")).rows[0].n === 1);

console.log(`\n${n} kiểm thử SQL đạt (Postgres ${(await db.query('show server_version')).rows[0].server_version}, PGlite).`);
