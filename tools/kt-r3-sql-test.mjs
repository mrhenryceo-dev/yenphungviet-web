// Phase 1S / Giai đoạn B — chạy thử kt_r3_worker_migration.sql trên Postgres local (PGlite). KHÔNG chạm Supabase thật.
// Chạy: node tools/kt-r3-sql-test.mjs <đường-dẫn-tới-node_modules/@electric-sql/pglite/dist/index.js>
import { readFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const pgliteEntry = process.argv[2];
if (!pgliteEntry) { console.error('Thiếu đường dẫn PGlite'); process.exit(2); }
const { PGlite } = await import(pathToFileURL(pgliteEntry).href);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sql = f => readFile(path.join(ROOT, f), 'utf8');
let n = 0; const ok = (name, cond, extra = '') => { assert.ok(cond, name + ' ' + extra); n++; console.log('✓', name); };

const OWNER = 'aaaaaaaa-0000-4000-8000-000000000001', STRANGER = 'bbbbbbbb-0000-4000-8000-000000000002';
const claims = {
  anon: { role: 'anon' },
  stranger: { role: 'authenticated', sub: STRANGER, aal: 'aal1', app_metadata: {} },
  owner: { role: 'authenticated', sub: OWNER, aal: 'aal1', app_metadata: { kt_role: 'owner' } },
  service: { role: 'service_role' }
};
const roleOf = who => (who === 'service' ? 'service_role' : claims[who].role);
function client(db) {
  const as = async (who, q) => {
    await db.exec(`select set_config('request.jwt.claims', '${JSON.stringify(claims[who]).replace(/'/g, "''")}', false); set role ${roleOf(who)};`);
    try { return await db.query(q); } finally { await db.exec("reset role; select set_config('request.jwt.claims', '', false);"); }
  };
  const denied = async (who, q) => { try { await as(who, q); return ''; } catch (e) { return e.message; } };
  const run = async f => { try { await db.exec(await sql(f)); return ''; } catch (e) { await db.exec('rollback'); return e.message; } };
  return { as, denied, run };
}

// --- chưa có kt_r2 → dừng ---
{
  const g = new PGlite(); await g.exec(await sql('tools/kt-sql-stub.sql')); await g.exec(await sql('supabase/kt_r1_migration.sql'));
  const msg = await client(g).run('supabase/kt_r3_worker_migration.sql');
  ok('1. Chưa cài kt_r2 → kt_r3 DỪNG, không tạo gì', /chưa cài kt_r1 \/ kt_r2/.test(msg) && (await g.query("select to_regclass('public.kt_ai_settings') t")).rows[0].t === null, msg);
  await g.close();
}

const db = new PGlite();
await db.exec(await sql('tools/kt-sql-stub.sql'));
await db.exec(await sql('supabase/kt_r1_migration.sql'));
await db.exec(await sql('supabase/kt_r2_ai_migration.sql'));
const { as, denied, run } = client(db);
const FP0 = JSON.stringify((await db.query(`select 'pol' k, tablename::text a, policyname::text b from pg_policies where tablename in ('birds','leads','flight_cages','objects')
  union all select 'rows', 'birds', count(*)::text from public.birds union all select 'rows', 'leads', count(*)::text from public.leads order by 1,2,3`)).rows);
const oldJob =(await as('owner', `insert into public.kt_ai_jobs (title) values ('Việc cũ trước kt_r3') returning id`)).rows[0].id;
ok('2. Cài kt_r3 thành công (trên dữ liệu kt_r2 có sẵn)', (await run('supabase/kt_r3_worker_migration.sql')) === '');
ok('3. Chạy lại → DỪNG "đã được cài"', /đã được cài/.test(await run('supabase/kt_r3_worker_migration.sql')));
ok('4. Việc cũ vẫn còn, có giá trị mặc định cho cột mới', (await db.query(`select origin, run_count, error_code from public.kt_ai_jobs where id='${oldJob}'`)).rows[0].origin === 'owner');
ok('5. Lịch tự động MẶC ĐỊNH TẮT, chưa có ngân sách', JSON.stringify((await db.query('select auto_enabled, monthly_budget_usd from public.kt_ai_settings')).rows) === JSON.stringify([{ auto_enabled: false, monthly_budget_usd: null }]));

// --- cài đặt lịch ---
ok('6. OWNER KHÔNG bật được lịch khi chưa đặt ngân sách', /auto_needs_budget/.test(await denied('owner', 'update public.kt_ai_settings set auto_enabled = true where id = 1')));
ok('7. OWNER đặt ngân sách rồi bật lịch được', (await as('owner', 'update public.kt_ai_settings set monthly_budget_usd = 10, auto_enabled = true where id = 1 returning auto_enabled')).rows[0].auto_enabled === true);
ok('8. Ngân sách vượt trần 200 USD / số bài ngày > 5 bị chặn', !!(await denied('owner', 'update public.kt_ai_settings set monthly_budget_usd = 500 where id = 1')) && !!(await denied('owner', 'update public.kt_ai_settings set auto_per_day = 9 where id = 1')));
ok('9. Người lạ / khách không đọc, không sửa được cài đặt',
  (await as('stranger', 'select * from public.kt_ai_settings')).rows.length === 0 && (await as('stranger', 'update public.kt_ai_settings set auto_enabled = false returning id')).rows.length === 0
  && /permission denied/.test(await denied('anon', 'select * from public.kt_ai_settings')));
ok('10. Không thêm được dòng cài đặt thứ hai', !!(await denied('owner', 'insert into public.kt_ai_settings (id) values (2)')));
await as('owner', 'update public.kt_ai_settings set auto_enabled = false where id = 1');

// --- nhận việc nguyên tử ---
const q1 = (await as('owner', `insert into public.kt_ai_jobs (title, status, step) values ('Việc hàng đợi một', 'queued', 'article') returning id`)).rows[0].id;
const q2 = (await as('owner', `insert into public.kt_ai_jobs (title, status, step, next_run_at) values ('Việc hẹn giờ sau', 'queued', 'article', now() + interval '1 hour') returning id`)).rows[0].id;
ok('11. OWNER KHÔNG tự đặt "generating" / không giữ khóa được',
  /chỉ máy chạy việc/.test(await denied('owner', `insert into public.kt_ai_jobs (title, status) values ('Giả máy chủ', 'generating')`))
  && (await as('owner', `update public.kt_ai_jobs set lock_owner = 'owner-hack', lock_until = now() + interval '1 hour' where id = '${q1}' returning lock_owner`)).rows[0].lock_owner === null);
ok('12. Khách / người lạ / OWNER KHÔNG gọi được hàm nhận việc',
  /permission denied/.test(await denied('anon', `select * from public.kt_ai_claim_job('w1', 180)`))
  && /permission denied/.test(await denied('stranger', `select * from public.kt_ai_claim_job('w1', 180)`))
  && /permission denied/.test(await denied('owner', `select * from public.kt_ai_claim_job('w1', 180)`)));
const c1 = (await as('service', `select * from public.kt_ai_claim_job('w1', 180)`)).rows;
ok('13. Máy chủ nhận đúng 1 việc đến hạn (bỏ qua việc hẹn giờ sau), khóa + đếm lần chạy', c1.length === 1 && c1[0].id === q1 && c1[0].status === 'generating' && c1[0].lock_owner === 'w1' && c1[0].run_count === 1);
ok('14. Máy thứ hai KHÔNG nhận trùng việc đang khóa', (await as('service', `select * from public.kt_ai_claim_job('w2', 180)`)).rows.length === 0);
await db.exec(`update public.kt_ai_jobs set lock_until = now() - interval '1 second' where id = '${q1}'`);
const c2 = (await as('service', `select * from public.kt_ai_claim_job('w2', 180)`)).rows;
ok('15. Khóa hết hạn (máy trước sập) → máy khác nhận lại, run_count tăng', c2.length === 1 && c2[0].id === q1 && c2[0].lock_owner === 'w2' && c2[0].run_count === 2);
ok('16. Mã máy chạy việc lạ bị từ chối; lease bị kẹp 30–600 s',
  /không hợp lệ/.test(await denied('service', `select * from public.kt_ai_claim_job('x; drop', 180)`))
  && (await db.query(`select extract(epoch from lock_until - now()) <= 181 as ok from public.kt_ai_jobs where id='${q1}'`)).rows[0].ok);
const kept = (await as('service', `update public.kt_ai_jobs set step = 'compose' where id = '${q1}' and lock_owner = 'w2' returning step`)).rows.length;
await as('owner', `update public.kt_ai_jobs set status = 'rejected' where id = '${q1}'`);
const after = (await as('service', `update public.kt_ai_jobs set step = 'images' where id = '${q1}' and lock_owner = 'w2' returning step`)).rows.length;
ok('17. OWNER "Bỏ" việc đang chạy → khóa máy chủ bị thả, máy chủ không ghi đè được nữa', kept === 1 && after === 0
  && (await db.query(`select status, lock_owner from public.kt_ai_jobs where id='${q1}'`)).rows[0].status === 'rejected');
ok('18. Bước / trạng thái lạ bị chặn', !!(await denied('service', `update public.kt_ai_jobs set step = 'publish' where id = '${q2}'`)) && !!(await denied('service', `update public.kt_ai_jobs set status = 'auto_published' where id = '${q2}'`)));

// --- chốt an toàn bài viết cho service_role ---
const draft = (await as('service', `insert into public.kt_articles (slug, title) values ('bai-may-chu-tao', 'Bài máy chủ tạo') returning id, status`)).rows[0];
ok('19. Máy chủ tạo được bài NHÁP', draft.status === 'draft');
ok('20. Máy chủ KHÔNG tạo được bài công khai', /không được xuất bản/.test(await denied('service', `insert into public.kt_articles (slug, title, status, seo_description, cover, sources, reviewed_by_owner) values ('bai-tu-xb', 'Bài tự xuất bản', 'published', 'm', '{"path":"a.webp"}', '["s"]', true)`)));
ok('21. Máy chủ KHÔNG xuất bản / đánh dấu "OWNER đã duyệt" bài nháp',
  /không được xuất bản/.test(await denied('service', `update public.kt_articles set status = 'published', seo_description = 'm', cover = '{"path":"a.webp"}', sources = '["s"]', reviewed_by_owner = true where id = '${draft.id}'`))
  && /không được xuất bản/.test(await denied('service', `update public.kt_articles set reviewed_by_owner = true where id = '${draft.id}'`)));
ok('22. Máy chủ sửa được nội dung bài nháp', (await as('service', `update public.kt_articles set subtitle = 'đã sửa' where id = '${draft.id}' returning subtitle`)).rows[0].subtitle === 'đã sửa');
ok('23. Máy chủ KHÔNG xóa được bài (không có quyền DELETE)', /permission denied|không được xóa/.test(await denied('service', `delete from public.kt_articles where id = '${draft.id}'`)));
await db.exec('grant delete on public.kt_articles to service_role');      // như Supabase thật (quyền mặc định rộng) → trigger vẫn chặn
ok('23b. Kể cả khi service_role có quyền DELETE mặc định của Supabase → trigger vẫn chặn xóa', /không được xóa/.test(await denied('service', `delete from public.kt_articles where id = '${draft.id}'`)));
await as('owner', `update public.kt_articles set status = 'published', seo_description = 'mô tả', cover = '{"path":"a.webp"}', sources = '["s"]', reviewed_by_owner = true where id = '${draft.id}'`);
ok('24. OWNER vẫn xuất bản bình thường (chốt chỉ áp dụng service_role)', (await db.query(`select status from public.kt_articles where id = '${draft.id}'`)).rows[0].status === 'published');
ok('25. Máy chủ KHÔNG sửa được bài đã công khai', /chỉ được sửa bài nháp/.test(await denied('service', `update public.kt_articles set subtitle = 'AI sửa lén' where id = '${draft.id}'`)));
await as('owner', `update public.kt_articles set status = 'hidden' where id = '${draft.id}'`);
ok('26. Máy chủ KHÔNG sửa / xuất bản lại bài đã ẩn', /chỉ được sửa bài nháp/.test(await denied('service', `update public.kt_articles set status = 'draft' where id = '${draft.id}'`)));

// --- thông báo ---
await as('service', `insert into public.kt_ai_notifications (job_id, kind, status, message) values ('${q2}', 'awaiting_owner', 'dry_run', 'thử')`);
ok('27. Thông báo: máy chủ ghi, OWNER đọc, người lạ / khách không đọc',
  (await as('owner', 'select * from public.kt_ai_notifications')).rows.length === 1 && (await as('stranger', 'select * from public.kt_ai_notifications')).rows.length === 0
  && /permission denied/.test(await denied('anon', 'select * from public.kt_ai_notifications')));
ok('28. OWNER không sửa / xóa / giả thông báo', !!(await denied('owner', `insert into public.kt_ai_notifications (kind, status) values ('qa', 'sent')`)) && !!(await denied('owner', 'delete from public.kt_ai_notifications')));
ok('29. Trạng thái thông báo lạ bị chặn', !!(await denied('service', `insert into public.kt_ai_notifications (kind, status) values ('awaiting_owner', 'spam')`)));

// --- hoàn tác ---
ok('30. Rollback kt_r3 thành công, bài + việc còn nguyên, kt_r2 về như cũ', (await run('supabase/kt_r3_worker_rollback.sql')) === ''
  && (await db.query("select to_regclass('public.kt_ai_settings') t")).rows[0].t === null
  && (await db.query(`select count(*)::int n from public.kt_articles`)).rows[0].n === 1
  && (await db.query(`select count(*)::int n from public.kt_ai_jobs`)).rows[0].n === 3
  && /chỉ được đánh dấu/.test(await denied('owner', `update public.kt_ai_jobs set status = 'published' where id = '${q2}'`)));
ok('31. Sau rollback cài lại kt_r3 được', (await run('supabase/kt_r3_worker_migration.sql')) === '');

// --- hoàn tác SAI THỨ TỰ phải an toàn (không mất gì) ---
const count = async () => JSON.stringify((await db.query(`select (select count(*) from public.kt_articles) a, (select count(*) from public.kt_ai_jobs) j,
  (select count(*) from public.kt_ai_settings) s, (select count(*) from public.kt_ai_notifications) n`)).rows);
const snap = await count();
ok('32. Chạy rollback kt_r2 khi CÒN kt_r3 → bị từ chối, không thay đổi gì', !!(await run('supabase/kt_r2_ai_rollback.sql')) && (await count()) === snap);
ok('33. Rollback kt_r1 khi còn kt_r2/kt_r3 → bị từ chối, bài vẫn còn', !!(await run('supabase/kt_r1_rollback.sql')) && (await count()) === snap);
ok('34. Đúng thứ tự kt_r3 → kt_r2 rollback: gỡ sạch Xưởng, bài viết còn nguyên',
  (await run('supabase/kt_r3_worker_rollback.sql')) === '' && (await run('supabase/kt_r2_ai_rollback.sql')) === ''
  && (await db.query("select count(*)::int n from pg_tables where tablename like 'kt\\_ai\\_%' or tablename = 'kt_article_versions'")).rows[0].n === 0
  && (await db.query(`select count(*)::int n from public.kt_articles`)).rows[0].n === 1
  && (await db.query("select count(*)::int n from pg_trigger where tgname = 'kt_articles_ai_guard'")).rows[0].n === 0);
const fp = async () => JSON.stringify((await db.query(`select 'pol' k, tablename::text a, policyname::text b from pg_policies where tablename in ('birds','leads','flight_cages','objects')
  union all select 'rows', 'birds', count(*)::text from public.birds union all select 'rows', 'leads', count(*)::text from public.leads order by 1,2,3`)).rows);
ok('35. Toàn bộ cài / gỡ kt_r3: birds, leads, App trại, policy Storage KHÔNG đổi', (await fp()) === FP0);

console.log(`\n${n} kiểm thử SQL kt_r3 đạt (Postgres ${(await db.query('show server_version')).rows[0].server_version}, PGlite).`);
