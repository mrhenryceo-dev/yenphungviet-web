// Phase 1R — kiểm thử phân quyền THẬT trên Supabase (bird-farm) bằng anon key CÔNG KHAI.
// Chỉ ĐỌC và THỬ GHI (mọi lần thử ghi phải bị từ chối). Không cần mật khẩu, OTP hay service_role.
// Không đụng birds/leads ngoài việc đọc như website vẫn làm. Chạy: node tools/kt-live-anon-test.mjs
import assert from 'node:assert/strict';
import { KT } from '../assets/kt/config.mjs';

const U = KT.supabaseUrl, K = KT.supabaseAnonKey;
const H = { apikey: K, Authorization: `Bearer ${K}` };
const call = async (path, opts = {}) => {
  const r = await fetch(U + path, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
  const text = await r.text(); let body = text; try { body = JSON.parse(text); } catch { /* không phải JSON */ }
  return { status: r.status, body, headers: r.headers };
};
const PROBE = 'kt-probe-anon-' + Date.now();
let n = 0; const ok = async (name, fn) => { await fn(); n++; console.log('✓', name); };

await ok('Khách đọc kt_articles: 200, chỉ có bài published', async () => {
  const r = await call('/rest/v1/kt_articles?select=slug,status');
  assert.equal(r.status, 200); assert.ok(Array.isArray(r.body)); assert.ok(r.body.every(a => a.status === 'published'), JSON.stringify(r.body));
});
await ok('Bảng đúng cấu trúc Phase 1R (đủ cột)', async () => {
  const r = await call('/rest/v1/kt_articles?select=id,slug,topic,title,subtitle,excerpt,seo_title,seo_description,cover,blocks,sources,reviewed_by_owner,status,published_at,created_at,updated_at&limit=1');
  assert.equal(r.status, 200, JSON.stringify(r.body));
});
await ok('Khách INSERT bài → 401 permission denied', async () => {
  const r = await call('/rest/v1/kt_articles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: PROBE, title: 'probe anon' }) });
  assert.ok([401, 403].includes(r.status), r.status + ' ' + JSON.stringify(r.body));
  const chk = await call(`/rest/v1/kt_articles?select=id&slug=eq.${PROBE}`); assert.equal(chk.body.length, 0);
});
await ok('Khách UPDATE / DELETE mọi bài → bị chặn', async () => {
  for (const method of ['PATCH', 'DELETE']) {
    const r = await call('/rest/v1/kt_articles?id=not.is.null', { method, headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: method === 'PATCH' ? '{"title":"hack"}' : undefined });
    assert.ok([401, 403].includes(r.status), method + ' ' + r.status);
  }
});
await ok('Khách gọi kt_is_owner() → false', async () => {
  const r = await call('/rest/v1/rpc/kt_is_owner', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 200); assert.equal(r.body, false);
});
await ok('Khách upload vào bucket kien-thuc → bị RLS chặn', async () => {
  const r = await call(`/storage/v1/object/${KT.bucket}/img/${PROBE}.webp`, { method: 'POST', headers: { 'Content-Type': 'image/webp' }, body: 'probe' });
  assert.ok(r.status >= 400, String(r.status)); assert.match(JSON.stringify(r.body), /row-level security|Unauthorized/i);
});
await ok('Khách liệt kê bucket kien-thuc → rỗng (không lộ tên ảnh bài nháp)', async () => {
  const r = await call(`/storage/v1/object/list/${KT.bucket}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"prefix":"img","limit":5}' });
  assert.equal(r.status, 200); assert.deepEqual(r.body, []);
});
await ok('Bucket kien-thuc tồn tại và public (file không có → 404 Object not found, không phải Bucket not found)', async () => {
  const r = await call(`/storage/v1/object/public/${KT.bucket}/img/khong-co.webp`);
  assert.match(JSON.stringify(r.body), /Object not found|NoSuchKey/); assert.doesNotMatch(JSON.stringify(r.body), /Bucket not found/);
});
await ok('App trại không đổi: khách vẫn không upload được bucket cũ (Halan)', async () => {
  const r = await call(`/storage/v1/object/Halan/${PROBE}.jpg`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: 'probe' });
  assert.ok(r.status >= 400); assert.match(JSON.stringify(r.body), /row-level security|Unauthorized/i);
});
await ok('Website không đổi: ảnh public cũ vẫn phục vụ, có CORS', async () => {
  const r = await fetch(`${U}/storage/v1/object/public/Halan/Halan.jpg`, { method: 'HEAD', headers: { Origin: KT.siteUrl } });
  assert.equal(r.status, 200); assert.equal(r.headers.get('access-control-allow-origin'), '*');
});
await ok('Website không đổi: birds vẫn đọc được như trước, leads vẫn kín', async () => {
  const b = await call('/rest/v1/birds?select=code&published=eq.true');
  assert.equal(b.status, 200); assert.ok(Array.isArray(b.body));
  const l = await call('/rest/v1/leads?select=id&limit=1');
  assert.ok(l.status === 200 ? l.body.length === 0 : [401, 403].includes(l.status));
});

console.log(`\n${n} kiểm thử phân quyền THẬT (anon) trên ${U} đạt.`);
