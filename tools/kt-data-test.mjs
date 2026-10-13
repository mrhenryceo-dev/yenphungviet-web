// Phase 1R / R2 — test "hợp đồng" giữa Vercel Function và Supabase REST, dùng fetch GIẢ (không gọi mạng).
// Chạy: node tools/kt-data-test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { KT } from '../assets/kt/config.mjs';

const require = createRequire(import.meta.url);
let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('✓', name); };
const calls = [];
let reply = () => ({ status: 200, body: [] });
globalThis.fetch = async (url, opts = {}) => {
  calls.push({ url: String(url), headers: opts.headers || {}, method: opts.method || 'GET' });
  const r = reply(String(url));
  return { ok: r.status < 400, status: r.status, json: async () => r.body };
};
function fakeRes() {
  const res = { statusCode: 200, headers: {}, body: '' };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.end = b => { res.body = String(b || ''); return res; };
  return res;
}
const call = async (file, url) => { const res = fakeRes(); await require(`../api/${file}`)({ url }, res); return res; };
const ROW = { id: '1', slug: 'vong-doi-yen-phung', topic: 'co-ban', title: 'Vòng đời Yến Phụng', seo_description: 'Mô tả', excerpt: 'Tóm tắt',
  cover: { path: 'a/b-1600.webp', og_path: 'a/og.jpg' }, blocks: [{ type: 'text', md: 'Xin chào' }], sources: ['Nguồn'], status: 'published', published_at: '2026-10-13T00:00:00Z', updated_at: '2026-10-13T00:00:00Z' };

delete process.env.KT_SAMPLE;

await t('Bảng chưa tạo (migration chưa chạy) → thư viện vẫn mở, báo đang biên soạn', async () => {
  reply = () => ({ status: 404, body: { code: 'PGRST205', message: 'Could not find the table' } });
  const r = await call('kt-list.js', '/api/kt-list');
  assert.equal(r.statusCode, 200); assert.ok(r.body.includes('đang được biên soạn'));
});
await t('Mọi truy vấn: chỉ anon key, chỉ GET, chỉ status=eq.published', async () => {
  reply = () => ({ status: 200, body: [ROW] });
  calls.length = 0;
  await call('kt-list.js', '/api/kt-list'); await call('kt-article.js', '/api/kt-article?slug=vong-doi-yen-phung'); await call('sitemap.js', '/api/sitemap');
  assert.ok(calls.length >= 4);
  for (const c of calls) {
    assert.equal(c.method, 'GET');
    assert.ok(c.url.startsWith(KT.supabaseUrl + '/rest/v1/kt_articles?'), c.url);
    assert.ok(c.url.includes('status=eq.published'), 'thiếu lọc published: ' + c.url);
    assert.equal(c.headers.apikey, KT.supabaseAnonKey);
    if (!c.headers.apikey.startsWith('sb_publishable_')) {
      const role = JSON.parse(Buffer.from(c.headers.apikey.split('.')[1], 'base64url').toString()).role;
      assert.equal(role, 'anon', 'không được dùng key khác anon');
    }
  }
});
await t('Bài tồn tại → 200, cache 5 phút, canonical + OG tuyệt đối', async () => {
  reply = () => ({ status: 200, body: [ROW] });
  const r = await call('kt-article.js', '/api/kt-article?slug=vong-doi-yen-phung');
  assert.equal(r.statusCode, 200);
  assert.match(r.headers['cache-control'], /s-maxage=300/);
  assert.ok(r.body.includes('<link rel="canonical" href="https://yenphungviet.vercel.app/kien-thuc/vong-doi-yen-phung/">'));
  assert.ok(r.body.includes('/storage/v1/object/public/kien-thuc/a/og.jpg'));
});
await t('Bài không có (nháp/ẩn/không tồn tại) → 404 + noindex', async () => {
  reply = () => ({ status: 200, body: [] });
  const r = await call('kt-article.js', '/api/kt-article?slug=bai-nhap');
  assert.equal(r.statusCode, 404); assert.ok(r.body.includes('noindex'));
});
await t('Slug độc hại không được gửi tới Supabase', async () => {
  calls.length = 0;
  const r = await call('kt-article.js', '/api/kt-article?slug=' + encodeURIComponent("a'or'1'='1"));
  assert.equal(r.statusCode, 404); assert.equal(calls.length, 0);
});
await t('Supabase lỗi 500 → trang bài trả 404 an toàn, không lộ lỗi', async () => {
  reply = () => ({ status: 500, body: { message: 'internal' } });
  const r = await call('kt-article.js', '/api/kt-article?slug=vong-doi-yen-phung');
  assert.equal(r.statusCode, 404); assert.ok(!r.body.includes('internal'));
});
await t('sitemap.xml đúng định dạng', async () => {
  reply = () => ({ status: 200, body: [ROW] });
  const r = await call('sitemap.js', '/api/sitemap');
  assert.match(r.headers['content-type'], /xml/); assert.ok(r.body.includes('<loc>https://yenphungviet.vercel.app/kien-thuc/vong-doi-yen-phung/</loc>'));
});

console.log(`\n${n} test hợp đồng dữ liệu đạt.`);
