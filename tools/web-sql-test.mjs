// yenphungpet-web — chạy thử kt_r1_migration.sql + web_02_birds_leads.sql trên Postgres local (PGlite). KHÔNG chạm Supabase thật.
// Chạy: node tools/web-sql-test.mjs <đường-dẫn-tới-node_modules/@electric-sql/pglite/dist/index.js>
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
await db.exec('drop table public.birds, public.leads cascade;');   // dự án mới: chưa có birds/leads
await db.exec(await sql('supabase/kt_r1_migration.sql'));
await db.exec(await sql('supabase/web_02_birds_leads.sql'));
await db.exec(await sql('supabase/web_02_birds_leads.sql'));       // chạy lại lần 2: không lỗi

const OWNER = 'aaaaaaaa-0000-4000-8000-000000000001', STRANGER = 'bbbbbbbb-0000-4000-8000-000000000002';
const claims = {
  anon: { role: 'anon' },
  stranger: { role: 'authenticated', sub: STRANGER, aal: 'aal1', app_metadata: { provider: 'email' }, user_metadata: { kt_role: 'owner' } },
  owner: { role: 'authenticated', sub: OWNER, aal: 'aal1', app_metadata: { kt_role: 'owner' } }
};
async function as(who, q) {
  const c = claims[who];
  await db.exec(`select set_config('request.jwt.claims', '${JSON.stringify(c).replace(/'/g, "''")}', false); set role ${c.role};`);
  try { return await db.query(q); }
  finally { await db.exec("reset role; select set_config('request.jwt.claims', '', false);"); }
}
async function denied(who, q) { try { await as(who, q); return false; } catch (e) { return e.message; } }
let n = 0; const ok = (name, cond) => { assert.ok(cond, name); n++; console.log('✓', name); };

// Dữ liệu mẫu: service_role (Edge Function / Dashboard) bỏ qua RLS — mô phỏng bằng superuser
await db.exec(`insert into public.birds (code, color_name, price, status, published) values ('T01','Xanh lá',500000,'available',true), ('NHAP','Vàng',null,'available',false);`);
await db.exec(`insert into public.leads (full_name, contact, customer_note, source) values ('Khách mẫu','0900000000','ghi chú','Zalo');`);

// birds
const cols = (await db.query(`select column_name from information_schema.columns where table_schema='public' and table_name='birds'`)).rows.map(r => r.column_name);
const OLD = 'id,code,name,bird_line,color_name,age_text,sex_text,self_feeding_text,tame_level,price,short_description,image_url,gallery_urls,video_url,status,featured,display_order,published,created_at'.split(',');
ok('1. birds có đủ 19 cột website đang đọc', OLD.every(c => cols.includes(c)));
ok('2. Khách chỉ thấy chim published (đúng truy vấn của birds.js)',
  (await as('anon', `select code from public.birds where published = true order by display_order, created_at desc`)).rows.map(r => r.code).join() === 'T01'
  && (await as('anon', `select code from public.birds`)).rows.length === 1);
ok('3. Khách không thêm/sửa chim được', !!(await denied('anon', `insert into public.birds (code) values ('X')`)) && !!(await denied('anon', `update public.birds set price=1`)));
ok('4. Người lạ đã đăng nhập không thêm chim được', /row-level security/i.test(await denied('stranger', `insert into public.birds (code) values ('X')`) || ''));
ok('5. Người lạ sửa/xóa chim: 0 dòng', (await as('stranger', `update public.birds set price=1 returning id`)).rows.length === 0 && (await as('stranger', `delete from public.birds returning id`)).rows.length === 0);
ok('6. OWNER thêm, sửa chim và thấy cả chim chưa đăng',
  (await as('owner', `insert into public.birds (code, published) values ('T02', false) returning id`)).rows.length === 1
  && (await as('owner', `select count(*)::int n from public.birds`)).rows[0].n === 3);
ok('7. Trạng thái sai bị chặn', !!(await denied('owner', `update public.birds set status='ban-roi' where code='T01'`)));
// leads
ok('8. Khách không đọc được leads', !!(await denied('anon', `select * from public.leads`)));
ok('9. Khách không ghi thẳng vào leads (phải qua Edge Function)', !!(await denied('anon', `insert into public.leads (full_name, contact) values ('a','0900000000')`)));
ok('10. Người lạ đọc leads: 0 dòng', (await as('stranger', `select * from public.leads`)).rows.length === 0);
ok('11. Kể cả OWNER cũng không INSERT trực tiếp leads', !!(await denied('owner', `insert into public.leads (full_name, contact) values ('a','0900000000')`)));
ok('12. OWNER đọc và cập nhật trạng thái leads',
  (await as('owner', `update public.leads set status='contacted' returning id`)).rows.length === 1);
ok('13. Lead thiếu họ tên bị chặn', !!(await denied('owner', `update public.leads set full_name=''`)));
// rollback
await db.exec(await sql('supabase/web_02_rollback.sql'));
const left = (await db.query(`select to_regclass('public.birds') b, to_regclass('public.leads') l, to_regclass('public.kt_articles') k`)).rows[0];
ok('14. Rollback web_02 xóa birds/leads, giữ nguyên Phase 1R', left.b === null && left.l === null && left.k !== null);
await db.exec(await sql('supabase/web_02_birds_leads.sql'));
ok('15. Chạy lại sau rollback không lỗi', (await db.query(`select to_regclass('public.birds') b`)).rows[0].b !== null);

console.log(`\n${n} kiểm thử SQL yenphungpet-web đạt.`);
