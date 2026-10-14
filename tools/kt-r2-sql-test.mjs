// Phase 1S — chạy thử kt_r2_ai_migration.sql trên Postgres local (PGlite). KHÔNG chạm Supabase thật.
// Chạy: node tools/kt-r2-sql-test.mjs <đường-dẫn-tới-node_modules/@electric-sql/pglite/dist/index.js>
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
  stranger: { role: 'authenticated', sub: STRANGER, aal: 'aal1', app_metadata: {}, user_metadata: { kt_role: 'owner' } },
  owner: { role: 'authenticated', sub: OWNER, aal: 'aal1', app_metadata: { kt_role: 'owner' } },
  ownerMfaAal1: { role: 'authenticated', sub: OWNER, aal: 'aal1', app_metadata: { kt_role: 'owner', kt_mfa: 'required' } }
};
function client(db) {
  const as = async (who, q) => {
    await db.exec(`select set_config('request.jwt.claims', '${JSON.stringify(claims[who]).replace(/'/g, "''")}', false); set role ${claims[who].role};`);
    try { return await db.query(q); } finally { await db.exec("reset role; select set_config('request.jwt.claims', '', false);"); }
  };
  const denied = async (who, q) => { try { await as(who, q); return ''; } catch (e) { return e.message; } };
  const run = async f => { try { await db.exec(await sql(f)); return ''; } catch (e) { await db.exec('rollback'); return e.message; } };
  return { as, denied, run };
}
const fingerprint = async db => JSON.stringify((await db.query(`
  select 'pol' k, tablename::text a, policyname::text b from pg_policies where tablename in ('birds','leads','flight_cages','kt_articles','objects')
  union all select 'grant', table_name::text, grantee || ':' || privilege_type from information_schema.role_table_grants where table_name in ('birds','leads','flight_cages','kt_articles')
  union all select 'rows', 'birds', count(*)::text from public.birds union all select 'rows', 'leads', count(*)::text from public.leads
  order by 1, 2, 3`)).rows);

// --- Cài kt_r2 khi chưa có kt_r1 → phải dừng ---
{
  const g = new PGlite(); await g.exec(await sql('tools/kt-sql-stub.sql'));
  const msg = await client(g).run('supabase/kt_r2_ai_migration.sql');
  ok('1. Chưa cài kt_r1 → kt_r2 DỪNG, không tạo gì', /chưa cài kt_r1/.test(msg) && (await g.query("select to_regclass('public.kt_ai_jobs') t")).rows[0].t === null, msg);
  await g.close();
}

const db = new PGlite();
await db.exec(await sql('tools/kt-sql-stub.sql'));
await db.exec(await sql('supabase/kt_r1_migration.sql'));
const { as, denied, run } = client(db);
const before = await fingerprint(db);
ok('2. Cài kt_r2 thành công', (await run('supabase/kt_r2_ai_migration.sql')) === '');
ok('3. Có 3 bảng + 4 policy kt_ai_* / kt_ver_*',
  (await db.query("select count(*)::int n from pg_tables where tablename in ('kt_ai_jobs','kt_article_versions','kt_ai_usage')")).rows[0].n === 3
  && (await db.query("select count(*)::int n from pg_policies where policyname like 'kt\\_ai\\_%' or policyname like 'kt\\_ver\\_%'")).rows[0].n === 4);
ok('4. Chạy lại → DỪNG "đã được cài"', /đã được cài/.test(await run('supabase/kt_r2_ai_migration.sql')));
ok('5. birds / leads / App trại / kt_articles / Storage: policy, grant, dữ liệu không đổi', before === await fingerprint(db));

// --- dữ liệu thử ---
const art = (await as('owner', `insert into public.kt_articles (slug,title) values ('bai-ai-thu','Bài AI thử nghiệm') returning id`)).rows[0].id;
const job = (await as('owner', `insert into public.kt_ai_jobs (title, grp, article_id) values ('Bài AI thử nghiệm','nguoi-moi','${art}') returning id`)).rows[0].id;
ok('6. OWNER tạo việc + phiên bản + ghi chi phí',
  !!job && (await as('owner', `insert into public.kt_article_versions (article_id, version, author, snapshot) values ('${art}', 1, 'ai', '{"title":"x"}') returning id`)).rows.length === 1
  && (await as('owner', `insert into public.kt_ai_usage (task, kind, provider, model, ok) values ('article','text','mock','mock', true) returning id`)).rows.length === 1);
ok('7. OWNER đọc được cả 3 bảng', (await as('owner', 'select (select count(*) from public.kt_ai_jobs) + (select count(*) from public.kt_article_versions) + (select count(*) from public.kt_ai_usage) n')).rows[0].n == 3);
ok('8. Nhật ký chi phí: OWNER KHÔNG sửa / xóa được', !!(await denied('owner', `update public.kt_ai_usage set cost_usd = 0`)) && !!(await denied('owner', `delete from public.kt_ai_usage`)));
for (const t of ['kt_ai_jobs', 'kt_article_versions', 'kt_ai_usage']) {
  ok(`9. Khách không đọc được ${t}`, /permission denied/.test(await denied('anon', `select * from public.${t}`)));
  ok(`10. Người lạ đọc ${t}: 0 dòng`, (await as('stranger', `select * from public.${t}`)).rows.length === 0);
}
ok('11. Người lạ không tạo việc / phiên bản / chi phí được',
  /row-level security/.test(await denied('stranger', `insert into public.kt_ai_jobs (title) values ('Hack hack')`))
  && /row-level security/.test(await denied('stranger', `insert into public.kt_article_versions (article_id, version, author, snapshot) values ('${art}', 9, 'ai', '{}')`))
  && /row-level security/.test(await denied('stranger', `insert into public.kt_ai_usage (task, kind) values ('image','image')`)));
ok('12. Người lạ sửa / xóa việc: 0 dòng', (await as('stranger', `update public.kt_ai_jobs set title='hack' returning id`)).rows.length === 0 && (await as('stranger', `delete from public.kt_ai_jobs returning id`)).rows.length === 0);
ok('13. OWNER chưa qua MFA (khi đã bật kt_mfa) → không ghi được', /row-level security/.test(await denied('ownerMfaAal1', `insert into public.kt_ai_jobs (title) values ('Bài MFA')`)));
ok('14. Không đánh dấu việc "Đã xuất bản" khi bài còn nháp', /chỉ được đánh dấu/.test(await denied('owner', `update public.kt_ai_jobs set status='published' where id='${job}'`)));
await as('owner', `update public.kt_articles set status='published', seo_description='m', cover='{"path":"a.webp"}', sources='["s"]', reviewed_by_owner=true where id='${art}'`);
ok('15. Sau khi OWNER xuất bản bài → được đánh dấu việc "Đã xuất bản"', (await as('owner', `update public.kt_ai_jobs set status='published' where id='${job}' returning status`)).rows[0].status === 'published');
ok('16. Trạng thái lạ bị chặn', !!(await denied('owner', `update public.kt_ai_jobs set status='tu-xuat-ban' where id='${job}'`)));
ok('17. Phiên bản trùng số bị chặn', !!(await denied('owner', `insert into public.kt_article_versions (article_id, version, author, snapshot) values ('${art}', 1, 'ai', '{}')`)));
ok('18. kt_r1 rollback khi còn kt_r2 → bị chặn, bài không mất', !!(await run('supabase/kt_r1_rollback.sql')) && (await db.query(`select count(*)::int n from public.kt_articles where id='${art}'`)).rows[0].n === 1);
await as('owner', `update public.kt_articles set status='hidden' where id='${art}'`);
await as('owner', `delete from public.kt_articles where id='${art}'`);
ok('19. Xóa bài → phiên bản xóa theo, việc giữ lại (article_id = null)',
  (await db.query(`select count(*)::int n from public.kt_article_versions`)).rows[0].n === 0 && (await db.query(`select article_id from public.kt_ai_jobs where id='${job}'`)).rows[0].article_id === null);
ok('20. Rollback kt_r2 xóa sạch, kt_articles vẫn còn', (await run('supabase/kt_r2_ai_rollback.sql')) === ''
  && (await db.query("select count(*)::int n from pg_tables where tablename like 'kt\\_ai\\_%' or tablename = 'kt_article_versions'")).rows[0].n === 0
  && (await db.query("select to_regclass('public.kt_articles') t")).rows[0].t !== null);
ok('21. Cài lại kt_r2 sau rollback được', (await run('supabase/kt_r2_ai_migration.sql')) === '');
ok('22. Sau toàn bộ quá trình: App trại / birds / leads / Storage không đổi', JSON.stringify(JSON.parse(before).filter(r => r.a !== 'kt_articles')) === JSON.stringify(JSON.parse(await fingerprint(db)).filter(r => r.a !== 'kt_articles')));

console.log(`\n${n} kiểm thử SQL kt_r2 đạt (Postgres ${(await db.query('show server_version')).rows[0].server_version}, PGlite).`);
