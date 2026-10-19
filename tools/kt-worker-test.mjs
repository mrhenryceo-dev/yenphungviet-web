// Phase 1S / Giai đoạn B — test máy chạy việc phía máy chủ (worker), kiểm tra link nguồn, thông báo, provider bất đồng bộ,
// Edge Function (tick / kick) và kho PostgREST. Không gọi mạng, không chi phí, không chạm Supabase thật.
// Chạy: node tools/kt-worker-test.mjs
import assert from 'node:assert/strict';
import * as WK from '../assets/kt/ai/worker.mjs';
import { checkUrl, checkSources, urlProblem } from '../assets/kt/ai/sources.mjs';
import { deliver, buildMessage, notifyConfig, reviewUrl } from '../assets/kt/ai/notify.mjs';
import { createProviders } from '../assets/kt/ai/providers.mjs';
import { readLimits, AIError } from '../assets/kt/ai/limits.mjs';
import { pendingSlots } from '../assets/kt/ai/compose.mjs';
import { SAMPLES } from '../assets/kt/ai/mock-data.mjs';
import { handle, CHAIN } from '../supabase/functions/kt-ai/handler.mjs';
import { serverStore, serverMedia, JOB_COLUMNS } from '../supabase/functions/kt-ai/server-store.mjs';
import { fitScale } from '../quan-tri/fit.mjs';

let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('✓', name); };
const clone = o => JSON.parse(JSON.stringify(o));
const S0 = SAMPLES[0].pkg;                     // bài mẫu có nguồn thật (Australian Museum, Wikipedia)

// ---------------- database giả lập (đúng ngữ nghĩa kt_r3: khóa thuê, chỉ ghi nháp) ----------------
function memDb(clock) {
  const T = { jobs: new Map(), arts: new Map(), vers: [], usage: [], notes: [], settings: { id: 1, auto_enabled: false, auto_per_day: 1, auto_hour: 7, auto_groups: [], monthly_budget_usd: null }, uploads: [] };
  const nowIso = () => clock.now().toISOString();
  const store = {
    T,
    async claimJob(w, lease) {
      const due = [...T.jobs.values()].filter(j => WK.ACTIVE.includes(j.status) && (!j.next_run_at || new Date(j.next_run_at) <= clock.now()) && (!j.lock_until || new Date(j.lock_until) < clock.now()))
        .sort((a, b) => String(a.next_run_at).localeCompare(String(b.next_run_at)))[0];
      if (!due) return null;
      Object.assign(due, { lock_owner: w, lock_until: new Date(clock.now().getTime() + lease * 1000).toISOString(), run_count: (due.run_count || 0) + 1, status: 'generating' });
      return clone(due);
    },
    async saveJob(job, w) {
      const cur = T.jobs.get(job.id);
      if (!cur || cur.lock_owner !== w) throw new WK.WorkerError('lost-lock', 'mất khóa');
      for (const k of JOB_COLUMNS) if (k in job) cur[k] = clone(job[k]);
      cur.updated_at = nowIso(); return clone(cur);
    },
    async insertJob(job) { const j = { ...clone(job), lock_owner: null, lock_until: null, created_at: nowIso() }; T.jobs.set(j.id, j); return clone(j); },
    ownerUpdate(id, patch) { const j = T.jobs.get(id); Object.assign(j, clone(patch), { lock_owner: null, lock_until: null }); return clone(j); },   // = trigger kt_ai_jobs_lock_guard
    async getJob(id) { return T.jobs.has(id) ? clone(T.jobs.get(id)) : null; },
    async listJobs() { return [...T.jobs.values()].map(clone); },
    async nextActiveDue() { const a = [...T.jobs.values()].filter(j => WK.ACTIVE.includes(j.status)).map(j => j.next_run_at).sort()[0]; return a || null; },
    async listArticles() { return [...T.arts.values()].map(a => ({ id: a.id, slug: a.slug, title: a.title, status: a.status })); },
    async getArticle(id) { return T.arts.has(id) ? clone(T.arts.get(id)) : null; },
    async insertArticle(row) {
      if (row.status !== 'draft' || row.reviewed_by_owner) throw new Error('kt_r3: máy chủ AI không được xuất bản');
      const a = { ...clone(row), id: globalThis.crypto.randomUUID(), created_at: nowIso() }; T.arts.set(a.id, a); return clone(a);
    },
    async updateArticle(row) {
      const cur = T.arts.get(row.id);
      if (!cur || cur.status !== 'draft') throw new WK.WorkerError('not-draft', 'Bài không còn là nháp');
      if (row.status !== 'draft' || row.reviewed_by_owner) throw new Error('kt_r3: máy chủ AI không được xuất bản');
      T.arts.set(row.id, { ...clone(row), created_at: cur.created_at }); return clone(row);
    },
    async listVersions(id) { return T.vers.filter(v => v.article_id === id); },
    async addVersion(v) { if (T.vers.some(x => x.article_id === v.article_id && x.version === v.version)) throw new Error('trùng phiên bản'); T.vers.push(clone(v)); return v; },
    async listUsage(since) { return T.usage.filter(u => u.at >= since); },
    async addUsage(r) { T.usage.push(clone(r)); },
    async addNotification(x) { T.notes.push(clone(x)); },
    async getSettings() { return clone(T.settings); }
  };
  return store;
}
function fakeClock(start = '2026-10-20T03:00:00Z') {   // 10:00 giờ Việt Nam
  let ms = new Date(start).getTime();
  return { now: () => new Date(ms), ms: () => ms, advance: s => { ms += s * 1000; } };
}
const okFetch = (map = {}) => async (url, opts) => {
  const st = typeof map[url] === 'function' ? map[url](opts) : map[url];
  if (st === 'timeout') { const e = new Error('abort'); e.name = 'AbortError'; throw e; }
  if (st === 'dns') throw new TypeError('fetch failed');
  const status = typeof st === 'object' ? st.status : st || 200;
  return { status, ok: status < 300, headers: { get: k => (k === 'location' && typeof st === 'object' ? st.location : null) }, body: null };
};
function world({ prov = createProviders({}), urls = {}, limits = {}, prices = {} } = {}) {
  const clock = fakeClock(); const store = memDb(clock);
  const sent = [];
  const deps = { store, prov, limits: { ...readLimits({}), ...limits }, prices, now: clock.now, clock: clock.ms,
    media: { async upload(path, bytes, mime) { store.T.uploads.push({ path, size: bytes.length, mime }); } },
    fetchUrl: okFetch(urls), notify: async msg => { sent.push(msg); return { status: 'dry_run', channel: 'none' }; }, reviewBase: 'https://yenphungviet.vercel.app' };
  const enqueue = async (idea, extra = {}) => store.insertJob({ ...WK.newJob(idea, { now: clock.now() }), ...extra });
  const runAll = async (max = 30) => { const out = []; for (let i = 0; i < max; i++) { const r = await WK.tick(deps); out.push(r); if (!r.claimed) { const due = await store.nextActiveDue(); if (!due) break; clock.advance(Math.max(1, (new Date(due) - clock.now()) / 1000)); } } return out; };
  return { clock, store, deps, enqueue, runAll, sent };
}
const idea = (title = S0.title) => ({ title, group: 'nguoi-moi' });

// ================= 1. quy trình đầy đủ =================
await t('Máy chủ chạy trọn quy trình: viết → dàn trang → kiểm link → ảnh → QA → thông báo → "Chờ OWNER duyệt" (KHÔNG xuất bản)', async () => {
  const W = world();
  const job = await W.enqueue(idea());
  const ticks = await W.runAll();
  const j = await W.store.getJob(job.id); const a = await W.store.getArticle(j.article_id);
  assert.equal(j.status, 'awaiting_owner', j.error); assert.equal(j.step, 'done');
  assert.equal(a.status, 'draft'); assert.equal(a.reviewed_by_owner, false);
  assert.equal(pendingSlots(a).length, 0); assert.ok(W.store.T.uploads.length >= 2 && W.store.T.uploads.every(u => /^img\/[0-9a-f-]{36}-1600\.png$/.test(u.path)));
  assert.ok(a.cover.path && a.cover.path_sm === a.cover.path && a.cover.ai === true && a.cover.og_path === '');
  assert.equal(W.store.T.vers.length, 1); assert.equal(W.store.T.notes.length, 1);
  assert.equal(W.store.T.notes[0].kind, 'awaiting_owner'); assert.equal(W.store.T.notes[0].status, 'dry_run');
  assert.ok(W.store.T.notes[0].message.includes(`/quan-tri/#duyet/${job.id}`));
  assert.ok(j.lock_owner === null && j.lock_until === null, 'khóa được thả');
  assert.deepEqual(ticks[0].steps.slice(0, 4), ['article', 'compose', 'sources', 'images']);
  assert.ok(j.qa.passed.some(p => /CHƯA xác minh nội dung/.test(p)));
});
await t('Hai máy chạy cùng lúc KHÔNG nhận trùng một việc', async () => {
  const W = world(); await W.enqueue(idea());
  const [a, b] = await Promise.all([WK.tick(W.deps, { workerId: 'w1' }), WK.tick(W.deps, { workerId: 'w2' })]);
  assert.equal([a.claimed, b.claimed].filter(Boolean).length, 1);
});
await t('Máy chủ "sập" giữa chừng (không thả khóa) → hết khóa thuê, máy khác nhận lại và chạy TIẾP từ bước đã lưu', async () => {
  const W = world(); const job = await W.enqueue(idea());
  const claimed = await W.store.claimJob('w-sap', WK.W.leaseSec);
  W.store.T.jobs.get(job.id).step = 'compose'; W.store.T.jobs.get(job.id).pkg = clone(S0); W.store.T.jobs.get(job.id).attempts = 1;   // đã viết xong rồi sập
  assert.equal((await WK.tick(W.deps)).claimed, null, 'còn khóa → không ai nhận');
  W.clock.advance(WK.W.leaseSec + 1);
  await W.runAll();
  const j = await W.store.getJob(claimed.id);
  assert.equal(j.status, 'awaiting_owner'); assert.equal(j.attempts, 1, 'KHÔNG gọi AI viết lại'); assert.equal(j.run_count >= 2, true);
  assert.equal(W.store.T.usage.filter(u => u.task === 'article').length, 0);
});

// ================= 2. lỗi, thử lại, dừng =================
await t('Ảnh lỗi tạm thời → giữ tiến độ, hẹn giờ thử lại; lần sau thành công', async () => {
  let fails = 1; const base = createProviders({});
  const prov = { ...base, image: { ...base.image, async generateImage(p) { if (fails-- > 0) throw new AIError('server', 'OpenAI ảnh: máy chủ lỗi tạm thời (500).', { retryable: true }); return base.image.generateImage(p); } } };
  const W = world({ prov }); const job = await W.enqueue(idea());
  await WK.tick(W.deps);
  let j = await W.store.getJob(job.id);
  assert.equal(j.status, 'generating'); assert.equal(j.step, 'images'); assert.ok(j.article_id); assert.ok(/1 ảnh|Ảnh lỗi/.test(JSON.stringify(j.history)));
  await W.runAll(); j = await W.store.getJob(job.id);
  assert.equal(j.status, 'awaiting_owner', j.error);
});
await t('Ảnh lỗi mãi → mỗi ô thử tối đa 2 lần rồi bỏ qua, bài vẫn giữ, QA báo thiếu ảnh (không vòng lặp vô hạn)', async () => {
  const base = createProviders({}); let calls = 0;
  const prov = { ...base, image: { ...base.image, async generateImage() { calls++; throw new AIError('server', 'lỗi 500', { retryable: true }); } } };
  const W = world({ prov }); const job = await W.enqueue(idea());
  await W.runAll(60);
  const j = await W.store.getJob(job.id); const a = await W.store.getArticle(j.article_id);
  assert.equal(j.status, 'qa'); assert.ok(j.qa.errors.some(e => e.code === 'cover' || e.code === 'images-pending'));
  assert.equal(calls, pendingSlots(a).length * WK.W.maxImageTriesPerSlot);
  assert.equal(W.store.T.notes.at(-1).kind, 'qa');
});
await t('Hết hạn mức ảnh / khóa API sai → dừng tạo ảnh ngay, giữ bài, chuyển QA', async () => {
  const base = createProviders({}); let calls = 0;
  const prov = { ...base, image: { ...base.image, async generateImage() { calls++; throw new AIError('quota', 'hết hạn mức'); } } };
  const W = world({ prov }); const job = await W.enqueue(idea()); await W.runAll();
  const j = await W.store.getJob(job.id);
  assert.equal(calls, 1); assert.equal(j.status, 'qa'); assert.ok(j.image_errors[0].stop);
});
await t('Lỗi mạng khi gửi bài → thử lại tối đa 3 lần (trễ 20 s → 90 s), rồi "Lỗi" + thông báo; không vượt số lần', async () => {
  const base = createProviders({}); let calls = 0;
  const prov = { ...base, text: { ...base.text, async submitJSON() { calls++; throw new AIError('network', 'không kết nối được', { retryable: true }); } } };
  const W = world({ prov }); const job = await W.enqueue(idea());
  await WK.tick(W.deps); let j = await W.store.getJob(job.id);
  assert.equal(j.status, 'generating'); assert.equal(new Date(j.next_run_at) - W.clock.now(), 20000); assert.ok(/sẽ tự thử lại/.test(j.error));
  await W.runAll(); j = await W.store.getJob(job.id);
  assert.equal(j.status, 'failed'); assert.equal(calls, 3); assert.equal(j.error_code, 'network');
  assert.equal(W.store.T.notes.at(-1).kind, 'failed');
});
await t('Vượt ngân sách tháng → dừng NGAY, không gọi AI', async () => {
  const base = createProviders({}); let calls = 0;
  const prov = { ...base, text: { ...base.text, async submitJSON(p) { calls++; return base.text.submitJSON(p); } } };
  const W = world({ prov }); W.store.T.usage.push({ at: W.clock.now().toISOString(), kind: 'text', task: 'article', cost_usd: 20, ok: true });
  const job = await W.enqueue(idea()); await W.runAll();
  const j = await W.store.getJob(job.id); assert.equal(j.status, 'failed'); assert.equal(j.error_code, 'budget'); assert.equal(calls, 0);
});
await t('AI trả gói không hợp lệ → tạo lại tối đa 3 lần rồi dừng; mỗi lần được ghi chi phí', async () => {
  const base = createProviders({});
  const prov = { ...base, text: { ...base.text, async submitJSON() { return { done: true, json: { title: 'x' }, usage: { model: 'mock', tokensIn: 0, tokensOut: 0 } }; } } };
  const W = world({ prov }); const job = await W.enqueue(idea()); await W.runAll();
  const j = await W.store.getJob(job.id);
  assert.equal(j.status, 'failed'); assert.equal(j.attempts, 3); assert.equal(W.store.T.usage.filter(u => u.task === 'article' && !u.ok).length, 3);
});
await t('Chặn vòng lặp vô hạn: việc chạy quá 80 lần tick → dừng', async () => {
  const W = world(); const job = await W.enqueue(idea()); W.store.T.jobs.get(job.id).run_count = WK.W.maxRuns + 1;
  await WK.tick(W.deps); assert.equal((await W.store.getJob(job.id)).error_code, 'runaway');
});

// ================= 3. AI bất đồng bộ (OpenAI background / Anthropic batch) =================
await t('Chờ AI bất đồng bộ: gửi → lưu mã yêu cầu → hỏi lại 15 s / lần → nhận bài; không request nào phải chờ bài dài', async () => {
  const base = createProviders({}); let polls = 0;
  const prov = { ...base, describe: { ...base.describe, text: 'openai', mock: false }, text: { ...base.text,
    async submitJSON() { return { done: false, handle: { provider: 'openai', id: 'resp_123' } }; },
    async pollJSON(h) { assert.equal(h.id, 'resp_123'); if (++polls < 3) return { done: false, handle: h }; return { done: true, json: clone(S0), usage: { model: 'm', tokensIn: 5000, tokensOut: 6000 } }; } } };
  const W = world({ prov, prices: { m: { in: 2, out: 10 } } }); const job = await W.enqueue(idea());
  const r1 = await WK.tick(W.deps); let j = await W.store.getJob(job.id);
  assert.deepEqual(r1.steps, ['article']); assert.equal(j.step, 'article_wait'); assert.equal(j.ai_handle.id, 'resp_123'); assert.equal(new Date(j.next_run_at) - W.clock.now(), 15000);
  await W.runAll(); j = await W.store.getJob(job.id);
  assert.equal(j.status, 'awaiting_owner', j.error); assert.equal(polls, 3); assert.equal(j.ai_handle, null); assert.equal(j.cost_usd > 0.06 && j.cost_usd < 0.08, true);
});
await t('Chờ AI quá lâu (OpenAI > 30 phút) → lỗi hết giờ, thử lại có giới hạn rồi dừng', async () => {
  const base = createProviders({});
  const prov = { ...base, describe: { ...base.describe, mock: false }, text: { ...base.text,
    async submitJSON() { return { done: false, handle: { provider: 'openai', id: 'resp_x' } }; }, async pollJSON(h) { return { done: false, handle: h }; } } };
  const W = world({ prov }); const job = await W.enqueue(idea()); await W.runAll(400);
  const j = await W.store.getJob(job.id); assert.equal(j.status, 'failed'); assert.ok(/chưa trả kết quả/.test(j.error) || j.error_code === 'attempts', j.error);
});

// ================= 4. kiểm tra link nguồn =================
await t('Link nguồn: chỉ https công khai — chặn http, IP, localhost, cổng lạ, user:pass (không gửi request)', async () => {
  let called = 0; const f = async () => { called++; return { status: 200, ok: true, headers: { get: () => null } }; };
  for (const u of ['http://en.wikipedia.org/wiki/Budgerigar', 'https://127.0.0.1/a', 'https://localhost/a', 'https://intranet.local/x', 'https://a.com:8443/x', 'https://u:p@a.com/x', 'https://[::1]/x', 'javascript:alert(1)'])
    assert.equal((await checkUrl(u, { fetchImpl: f })).state, 'invalid', u);
  assert.equal(called, 0); assert.equal(urlProblem('https://en.wikipedia.org/wiki/Budgerigar'), '');
});
await t('Link nguồn: 200 → mở được; 404/410 → hỏng; 403/5xx/timeout/DNS → không truy cập được; HEAD bị từ chối → thử GET; chuyển hướng an toàn', async () => {
  const U = 'https://a.org/';
  const f = okFetch({ [U + 'ok']: 200, [U + 'gone']: 404, [U + 'old']: 410, [U + 'deny']: 403, [U + 'err']: 503, [U + 'slow']: 'timeout', [U + 'dns']: 'dns',
    [U + 'head']: o => (o.method === 'HEAD' ? 405 : 200), [U + 'r1']: { status: 301, location: '/ok' }, [U + 'evil']: { status: 302, location: 'https://127.0.0.1/admin' } });
  const s = async p => (await checkUrl(U + p, { fetchImpl: f })).state;
  assert.equal(await s('ok'), 'ok'); assert.equal(await s('gone'), 'broken'); assert.equal(await s('old'), 'broken');
  assert.equal(await s('deny'), 'unreachable'); assert.equal(await s('err'), 'unreachable'); assert.equal(await s('slow'), 'unreachable'); assert.equal(await s('dns'), 'unreachable');
  assert.equal(await s('head'), 'ok'); assert.equal(await s('r1'), 'ok'); assert.equal(await s('evil'), 'invalid');
});
await t('Kiểm tra nguồn trong bài: BỎ link hỏng / không truy cập được, GIỮ nguồn mở được + nguồn không link; ghi rõ "chưa xác minh nội dung"', async () => {
  const r = await checkSources([{ title: 'A', url: 'https://a.org/ok' }, { title: 'B', url: 'https://a.org/gone' }, { title: 'C', url: 'https://a.org/deny' }, { title: 'D', url: '' }, { title: 'A2', url: 'https://a.org/ok' }],
    { fetchImpl: okFetch({ 'https://a.org/ok': 200, 'https://a.org/gone': 404, 'https://a.org/deny': 403 }) });
  assert.deepEqual(r.kept.map(k => k.title), ['A', 'D']); assert.deepEqual(r.removed.map(k => k.title), ['B', 'C']);
  assert.deepEqual(r.summary, { ok: 1, noUrl: 1, removed: 2, total: 4 }); assert.ok(/CHƯA xác minh nội dung/.test(r.note));
});
await t('Trong quy trình: nguồn hỏng bị bỏ khỏi bài + cảnh báo OWNER; hết nguồn → QA chặn duyệt', async () => {
  const urls = Object.fromEntries(S0.sources.filter(s => s.url).map((s, i) => [s.url, i === 0 ? 404 : 200]));
  const W = world({ urls }); const job = await W.enqueue(idea()); await W.runAll();
  let j = await W.store.getJob(job.id); const a = await W.store.getArticle(j.article_id);
  assert.equal(j.source_check.removed.length, 1); assert.equal(a.sources.length, S0.sources.length - 1);
  assert.ok(j.qa.warnings.some(w => w.code === 'source-removed')); assert.equal(j.status, 'awaiting_owner');
  const W2 = world({ urls: Object.fromEntries(S0.sources.map(s => [s.url, 404])) }); const job2 = await W2.enqueue(idea()); await W2.runAll();
  j = await W2.store.getJob(job2.id); assert.equal(j.status, 'qa'); assert.ok(j.qa.errors.some(e => e.code === 'sources'));
});

// ================= 5. quyền OWNER, an toàn =================
await t('OWNER xuất bản / ẩn bài trong lúc máy chủ đang chạy → máy chủ DỪNG, không sửa bài đã công khai', async () => {
  const base = createProviders({}); let W;
  const prov = { ...base, image: { ...base.image, async generateImage(p) { const a = [...W.store.T.arts.values()][0]; a.status = 'published'; return base.image.generateImage(p); } } };
  W = world({ prov }); const job = await W.enqueue(idea()); await W.runAll();
  const j = await W.store.getJob(job.id); const a = await W.store.getArticle(j.article_id);
  assert.equal(j.status, 'failed'); assert.equal(j.error_code, 'not-draft'); assert.equal(a.status, 'published'); assert.equal(pendingSlots(a).length > 0, true, 'không ghi ảnh vào bài đã công khai');
});
await t('OWNER "Bỏ" việc đang chạy → máy chủ mất khóa, dừng, giữ lựa chọn "Đã bỏ"', async () => {
  const base = createProviders({}); let W, jobId;
  const prov = { ...base, image: { ...base.image, async generateImage(p) { W.store.ownerUpdate(jobId, { status: 'rejected' }); return base.image.generateImage(p); } } };
  W = world({ prov }); jobId = (await W.enqueue(idea())).id;
  const r = await WK.tick(W.deps);
  assert.equal(r.status, 'lost-lock'); assert.equal((await W.store.getJob(jobId)).status, 'rejected');
});
await t('Gói AI đòi "published" / "OWNER đã duyệt" → bị bỏ qua, bài luôn NHÁP; kho chặn ghi bài công khai', async () => {
  const base = createProviders({});
  const prov = { ...base, text: { ...base.text, async submitJSON() { return { done: true, json: { ...clone(S0), status: 'published', reviewed_by_owner: true }, usage: { model: 'mock' } }; } } };
  const W = world({ prov }); const job = await W.enqueue(idea()); await W.runAll();
  const a = await W.store.getArticle((await W.store.getJob(job.id)).article_id);
  assert.equal(a.status, 'draft'); assert.equal(a.reviewed_by_owner, false);
  await assert.rejects(W.store.insertArticle({ ...a, status: 'published' }));
});
await t('Sửa theo góp ý chạy phía máy chủ: giữ id + slug, dùng lại ảnh cũ (không tạo / trả tiền lại), thêm phiên bản', async () => {
  const W = world(); const job = await W.enqueue(idea()); await W.runAll();
  let j = await W.store.getJob(job.id); const a0 = await W.store.getArticle(j.article_id); const up0 = W.store.T.uploads.length;
  W.store.ownerUpdate(j.id, { status: 'needs_changes', owner_note: 'Viết ngắn hơn phần mở bài' });
  W.store.ownerUpdate(j.id, WK.requeue(await W.store.getJob(j.id), { mode: 'revise', now: W.clock.now() }));
  await W.runAll(); j = await W.store.getJob(job.id); const a1 = await W.store.getArticle(j.article_id);
  assert.equal(j.status, 'awaiting_owner'); assert.equal(a1.id, a0.id); assert.equal(a1.slug, a0.slug); assert.equal(a1.cover.path, a0.cover.path);
  assert.equal(W.store.T.uploads.length, up0, 'không tạo lại ảnh trùng mô tả'); assert.equal(W.store.T.vers.length, 2); assert.equal(j.owner_note, '');
});
await t('Đưa lại hàng đợi: việc đã đóng / đang chạy bị từ chối; "tạo ảnh còn thiếu" về bước ảnh; lỗi → chạy tiếp từ bước cũ', async () => {
  const now = new Date();
  assert.throws(() => WK.requeue({ status: 'published' }, { now }), e => e.code === 'closed');
  assert.throws(() => WK.requeue({ status: 'generating', lock_until: new Date(now.getTime() + 60e3).toISOString() }, { now }), e => e.code === 'locked');
  assert.throws(() => WK.requeue({ status: 'qa' }, { mode: 'revise', now }), e => e.code === 'state');
  assert.equal(WK.requeue({ status: 'qa', step: 'done', image_errors: [{}] }, { mode: 'images', now }).step, 'images');
  const r = WK.requeue({ status: 'failed', step: 'images', step_attempts: 3, error: 'x' }, { now });
  assert.deepEqual([r.status, r.step, r.step_attempts, r.error], ['queued', 'images', 0, '']);
  assert.throws(() => WK.enqueueNew([{ title: S0.title, kind: 'bài viết' }], idea()), e => e.code === 'duplicate');
});
await t('Giới hạn ảnh / bài: ô ảnh thừa bị bỏ (khối ảnh → bỏ, ảnh + chữ → còn chữ)', async () => {
  const W = world({ limits: { maxImagesPerArticle: 2 } }); const job = await W.enqueue(idea()); await W.runAll();
  const j = await W.store.getJob(job.id); const a = await W.store.getArticle(j.article_id);
  assert.equal(W.store.T.uploads.length, 2); assert.equal(pendingSlots(a).length, 0); assert.equal(j.status, 'awaiting_owner', JSON.stringify(j.qa && j.qa.errors));
});

// ================= 6. lịch tự động (mặc định TẮT) =================
await t('Lịch tự động: mặc định TẮT; bật mà chưa có ngân sách → không chạy; chưa tới giờ → chờ; đủ điều kiện → tạo 1 việc "auto"/ngày', async () => {
  const W = world();
  assert.deepEqual(await WK.autoPlan(W.deps), { skipped: 'off' });
  W.store.T.settings.auto_enabled = true;
  assert.equal((await WK.autoPlan(W.deps)).skipped, 'no-budget');
  W.store.T.settings.monthly_budget_usd = 5; W.store.T.settings.auto_hour = 11;
  assert.equal((await WK.autoPlan(W.deps)).skipped, 'not-yet');        // 10:00 VN
  W.store.T.settings.auto_hour = 7;
  const r = await WK.autoPlan(W.deps); assert.ok(r.created, JSON.stringify(r));
  const job = await W.store.getJob(r.created); assert.equal(job.origin, 'auto'); assert.equal(job.status, 'queued');
  assert.equal((await WK.autoPlan(W.deps)).skipped, 'done-today');                // 1 bài / ngày
  W.store.T.settings.auto_per_day = 2;
  assert.equal((await WK.autoPlan(W.deps)).skipped, 'busy');                      // còn việc tự động đang chạy → không chồng việc
  await W.runAll(); assert.ok(['awaiting_owner', 'qa'].includes((await W.store.getJob(r.created)).status));
  W.store.T.settings.auto_per_day = 1;
  assert.equal((await WK.autoPlan(W.deps)).skipped, 'done-today');
  assert.equal([...W.store.T.arts.values()].every(a => a.status === 'draft'), true, 'lịch tự động KHÔNG xuất bản');
});
await t('Lịch tự động với AI thật: thiếu bảng giá model → không chạy (không ước được chi phí); vượt ngân sách cài đặt → không chạy', async () => {
  const base = createProviders({});
  const W = world({ prov: { ...base, describe: { ...base.describe, mock: false, textModel: 'gpt-x' } } });
  Object.assign(W.store.T.settings, { auto_enabled: true, monthly_budget_usd: 3, auto_hour: 0 });
  assert.equal((await WK.autoPlan(W.deps)).skipped, 'no-prices');
  W.deps.prices = { 'gpt-x': { in: 1, out: 1 } };
  W.store.T.usage.push({ at: W.clock.now().toISOString(), kind: 'image', task: 'image', cost_usd: 3.5, ok: true });
  assert.equal((await WK.autoPlan(W.deps)).skipped, 'budget');
});

// ================= 7. thông báo =================
await t('Thông báo: mặc định CHẾ ĐỘ THỬ (không gửi, không gọi mạng); tin nhắn chỉ có tiêu đề + link duyệt cần đăng nhập', async () => {
  let called = 0; const f = async () => { called++; return { ok: true, status: 200 }; };
  assert.equal(notifyConfig({}).mode, 'dry-run');
  assert.equal((await deliver('x', {}, { fetchImpl: f })).status, 'dry_run'); assert.equal((await deliver('x', { KT_NOTIFY_MODE: 'off' }, { fetchImpl: f })).status, 'skipped');
  assert.equal(called, 0);
  const m = buildMessage('awaiting_owner', { id: 'abc', title: 'Bài thử', qa: { score: 96 } }, { reviewBase: 'https://yenphungviet.vercel.app' });
  assert.ok(m.includes('https://yenphungviet.vercel.app/quan-tri/#duyet/abc') && m.includes('AI không tự xuất bản') && m.includes('96/100'));
  assert.equal(reviewUrl('https://x.vercel.app/', 'a b'), 'https://x.vercel.app/quan-tri/#duyet/a%20b');
});
await t('Thông báo gửi thật (Telegram) chỉ khi KT_NOTIFY_MODE=send + đủ cấu hình; thiếu cấu hình → "failed", không ném lỗi', async () => {
  const env = { KT_NOTIFY_MODE: 'send', KT_NOTIFY_TELEGRAM_TOKEN: '123456789:' + 'A'.repeat(35), KT_NOTIFY_TELEGRAM_CHAT: '987654321' };
  const calls = []; const f = async (url, o) => { calls.push({ url, body: JSON.parse(o.body) }); return { ok: true, status: 200 }; };
  assert.equal((await deliver('Tin thử', env, { fetchImpl: f })).status, 'sent');
  assert.ok(calls[0].url.startsWith('https://api.telegram.org/bot123456789:')); assert.equal(calls[0].body.chat_id, '987654321'); assert.equal(calls[0].body.disable_web_page_preview, true);
  const bad = await deliver('x', { KT_NOTIFY_MODE: 'send' }, { fetchImpl: f }); assert.equal(bad.status, 'failed'); assert.equal(calls.length, 1);
  assert.equal((await deliver('x', env, { fetchImpl: async () => ({ ok: false, status: 401 }) })).status, 'failed');
});

// ================= 8. provider bất đồng bộ + ảnh WebP =================
await t('OpenAI background: gửi background:true + store:true, hỏi lại bằng GET /v1/responses/{id}; bài cắt ngang → lỗi', async () => {
  const log = []; let state = 'queued';
  const f = async (url, o) => { log.push({ url, method: o.method, body: o.body ? JSON.parse(o.body) : null });
    const body = o.method === 'POST' ? { id: 'resp_abc', status: 'queued' } : { id: 'resp_abc', status: state, output_text: JSON.stringify({ ok: 1 }), usage: { input_tokens: 10, output_tokens: 20 } };
    return { ok: true, status: 200, text: async () => JSON.stringify(body) }; };
  const p = createProviders({ KT_AI_TEXT_PROVIDER: 'openai', OPENAI_API_KEY: 'k', KT_AI_TEXT_MODEL: 'gpt-x', KT_AI_IMAGE_PROVIDER: 'none' }, { fetchImpl: f });
  const s = await p.text.submitJSON({ system: 's', user: 'u', maxOutputTokens: 100 });
  assert.equal(s.done, false); assert.equal(log[0].body.background, true); assert.equal(log[0].body.store, true);
  assert.equal((await p.text.pollJSON(s.handle)).done, false); assert.equal(log[1].url, 'https://api.openai.com/v1/responses/resp_abc'); assert.equal(log[1].method, 'GET');
  state = 'completed'; const d = await p.text.pollJSON(s.handle); assert.equal(d.done, true); assert.deepEqual(d.json, { ok: 1 }); assert.equal(d.usage.tokensOut, 20);
  state = 'incomplete'; await assert.rejects(p.text.pollJSON(s.handle), e => e.code === 'bad_output');
  await assert.rejects(p.text.pollJSON({ id: '../../x' }), e => e.code === 'bad_request');
});
await t('Anthropic Batches: gửi batch → chờ "ended" → đọc kết quả JSONL; ghi nhận giảm 50 %; hết hạn → lỗi thử lại được', async () => {
  let status = 'in_progress', type = 'succeeded';
  const f = async (url, o) => {
    if (o.method === 'POST') return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'msgbatch_1', processing_status: 'in_progress' }) };
    if (url.endsWith('/results')) return { ok: true, status: 200, text: async () => JSON.stringify({ custom_id: 'kt', result: type === 'succeeded' ? { type, message: { content: [{ type: 'text', text: '{"a":2}' }], usage: { input_tokens: 1, output_tokens: 2 } } } : { type } }) + '\n' };
    return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'msgbatch_1', processing_status: status, results_url: 'https://api.anthropic.com/v1/messages/batches/msgbatch_1/results' }) };
  };
  const p = createProviders({ KT_AI_TEXT_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k', KT_AI_TEXT_MODEL: 'claude-x', KT_AI_IMAGE_PROVIDER: 'none' }, { fetchImpl: f });
  const s = await p.text.submitJSON({ system: 's', user: 'u', maxOutputTokens: 100 }); assert.equal(s.done, false);
  assert.equal((await p.text.pollJSON(s.handle)).done, false);
  status = 'ended'; const d = await p.text.pollJSON(s.handle); assert.deepEqual(d.json, { a: 2 }); assert.equal(d.usage.batch, true);
  type = 'expired'; await assert.rejects(p.text.pollJSON(s.handle), e => e.code === 'timeout' && e.retryable);
});
await t('Ảnh OpenAI họ gpt-image: yêu cầu WebP nén sẵn + chất lượng cấu hình được (mặc định medium); trả kích thước thật', async () => {
  let body; const f = async (url, o) => { body = JSON.parse(o.body); return { ok: true, status: 200, text: async () => JSON.stringify({ data: [{ b64_json: Buffer.from('RIFFxxxxWEBP').toString('base64') }] }) }; };
  const p = createProviders({ KT_AI_TEXT_PROVIDER: 'openai', OPENAI_API_KEY: 'k', KT_AI_TEXT_MODEL: 't', KT_AI_IMAGE_PROVIDER: 'openai', KT_AI_IMAGE_MODEL: 'gpt-image-2' }, { fetchImpl: f });
  const im = await p.image.generateImage({ prompt: 'x', ratio: '16:9' });
  assert.equal(body.output_format, 'webp'); assert.equal(body.quality, 'medium'); assert.equal(body.size, '1536x1024');
  assert.equal(im.mime, 'image/webp'); assert.deepEqual([im.w, im.h], [1536, 1024]); assert.equal(p.describe.imageQuality, 'medium');
  const p2 = createProviders({ KT_AI_TEXT_PROVIDER: 'openai', OPENAI_API_KEY: 'k', KT_AI_TEXT_MODEL: 't', KT_AI_IMAGE_PROVIDER: 'openai', KT_AI_IMAGE_MODEL: 'gpt-image-2', KT_AI_IMAGE_QUALITY: 'low' }, { fetchImpl: f });
  await p2.image.generateImage({ prompt: 'x', ratio: '1:1' }); assert.equal(body.quality, 'low'); assert.equal(body.size, '1024x1024');
});

// ================= 9. Edge Function: tick (máy chạy việc) + kick (OWNER) =================
const SECRET = 's'.repeat(40);
const WENV = { KT_AI_ENABLED: '1', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'eyJservice', KT_WORKER_SECRET: SECRET,
  KT_ALLOWED_ORIGINS: 'https://yenphungviet.vercel.app' };
const tickReq = (secret, body = { action: 'tick', source: 'chain' }) => new Request('https://fn/kt-ai', { method: 'POST', headers: { 'content-type': 'application/json', 'x-kt-worker-secret': secret }, body: JSON.stringify(body) });
await t('Edge Function tick: sai / thiếu khóa → 401; chưa cấu hình → 503; KT_AI_ENABLED=0 → 503; không cần CORS', async () => {
  assert.equal((await handle(tickReq('sai'), WENV)).status, 401);
  assert.equal((await handle(tickReq(''), WENV)).status, 401);
  assert.equal((await handle(tickReq(SECRET), { ...WENV, KT_WORKER_SECRET: 'ngan' })).status, 503);
  assert.equal((await handle(tickReq(SECRET), { ...WENV, SUPABASE_SERVICE_ROLE_KEY: '' })).status, 503);
  assert.equal((await handle(tickReq(SECRET), { ...WENV, KT_AI_ENABLED: '0' })).status, 503);
});
await t('Edge Function tick: chạy việc phía máy chủ, tự hẹn lần kế (waitUntil) cho tới khi xong; có trần số lần nối tiếp', async () => {
  const W = world(); const job = await W.enqueue(idea());
  const later = []; const calls = [];
  const opts = { workerStore: W.store, workerMedia: W.deps.media, urlFetch: W.deps.fetchUrl, now: W.clock.now, clock: W.clock.ms, waitUntil: p => later.push(p), sleep: async () => {},
    fetchImpl: async (url, o) => { calls.push({ url, headers: o.headers, body: JSON.parse(o.body) }); return { ok: true, status: 200 }; } };
  const r = await handle(tickReq(SECRET), WENV, opts); const j = await r.json();
  assert.equal(r.status, 200); assert.equal(j.claimed, job.id); assert.equal(j.status, 'awaiting_owner'); assert.equal(j.chained, true);
  await Promise.all(later);
  assert.equal(calls[0].url, 'https://x.supabase.co/functions/v1/kt-ai'); assert.equal(calls[0].headers['x-kt-worker-secret'], SECRET); assert.equal(calls[0].body.chain, 1);
  const r2 = await (await handle(tickReq(SECRET, { action: 'tick', source: 'chain', chain: 1 }), WENV, opts)).json();
  assert.equal(r2.claimed, null); assert.equal(r2.chained, false, 'hết việc → dừng nối tiếp');
  const W3 = world(); await W3.enqueue(idea());
  const r3 = await (await handle(tickReq(SECRET, { action: 'tick', chain: CHAIN.max }), WENV, { ...opts, workerStore: W3.store })).json();
  assert.equal(r3.chained, false, 'tới trần → không nối tiếp nữa (cron / OWNER đánh thức lại)');
});
await t('Edge Function tick từ cron: chạy lịch tự động (nếu OWNER bật) rồi chạy việc', async () => {
  const W = world(); Object.assign(W.store.T.settings, { auto_enabled: true, monthly_budget_usd: 5, auto_hour: 0 });
  const opts = { workerStore: W.store, workerMedia: W.deps.media, urlFetch: W.deps.fetchUrl, now: W.clock.now, clock: W.clock.ms, waitUntil: () => {}, sleep: async () => {}, fetchImpl: async () => ({ ok: true }) };
  const j = await (await handle(tickReq(SECRET, { action: 'tick', source: 'cron' }), WENV, opts)).json();
  assert.ok(j.plan && j.plan.created, JSON.stringify(j.plan)); assert.equal(j.claimed, j.plan.created);
  const W2 = world();
  const j2 = await (await handle(tickReq(SECRET, { action: 'tick', source: 'cron' }), WENV, { ...opts, workerStore: W2.store })).json();
  assert.deepEqual(j2.plan, { skipped: 'off' }); assert.equal(j2.claimed, null);
});
const OWNER_JWT = ['h', Buffer.from(JSON.stringify({ aal: 'aal1' })).toString('base64url'), 's'].join('.');
const kickReq = () => new Request('https://fn/kt-ai', { method: 'POST', headers: { origin: 'https://yenphungviet.vercel.app', 'content-type': 'application/json', authorization: `Bearer ${OWNER_JWT}` }, body: JSON.stringify({ action: 'kick' }) });
await t('Edge Function kick (OWNER): trả 202 NGAY, việc chạy nền (đóng trình duyệt vẫn chạy); không phải OWNER → 403; chưa cấu hình → 503', async () => {
  const W = world(); const job = await W.enqueue(idea()); const bg = [];
  const auth = md => async url => (url.endsWith('/auth/v1/user') ? { ok: true, status: 200, json: async () => ({ id: 'u', app_metadata: md }) } : { ok: true, status: 200 });
  const opts = md => ({ workerStore: W.store, workerMedia: W.deps.media, urlFetch: W.deps.fetchUrl, now: W.clock.now, clock: W.clock.ms, waitUntil: p => bg.push(p), sleep: async () => {}, fetchImpl: auth(md) });
  const r = await handle(kickReq(), WENV, opts({ kt_role: 'owner' }));
  assert.equal(r.status, 202); assert.equal(bg.length, 1);
  await Promise.all(bg); assert.equal((await W.store.getJob(job.id)).status, 'awaiting_owner');
  assert.equal((await handle(kickReq(), WENV, opts({ kt_role: 'editor' }))).status, 403);
  assert.equal((await handle(kickReq(), { ...WENV, KT_WORKER_SECRET: '' }, opts({ kt_role: 'owner' }))).status, 503);
});

// ================= 10. kho PostgREST phía máy chủ =================
await t('Kho máy chủ: nhận việc qua RPC; lưu việc có điều kiện chủ khóa; mất khóa → dừng; chỉ gửi cột hợp lệ', async () => {
  const log = []; let rows = [{ id: 'aaaaaaaa-0000-4000-8000-000000000001', step: 'images' }];
  const f = async (url, o) => { log.push({ url, method: o.method, headers: o.headers, body: o.body ? JSON.parse(o.body) : null }); return { ok: true, status: 200, text: async () => JSON.stringify(rows) }; };
  const st = serverStore(WENV, { fetchImpl: f });
  await st.claimJob('w1', 180); assert.ok(log[0].url.endsWith('/rest/v1/rpc/kt_ai_claim_job')); assert.deepEqual(log[0].body, { p_worker: 'w1', p_lease_seconds: 180 });
  assert.equal(log[0].headers.Authorization, 'Bearer eyJservice');
  await st.saveJob({ id: rows[0].id, step: 'qa', hack: 1, created_at: 'x' }, 'w1');
  assert.ok(log[1].url.includes(`id=eq.${rows[0].id}&lock_owner=eq.w1`)); assert.equal(log[1].method, 'PATCH'); assert.deepEqual(Object.keys(log[1].body), ['step']);
  rows = []; await assert.rejects(st.saveJob({ id: 'aaaaaaaa-0000-4000-8000-000000000001' }, 'w1'), e => e.code === 'lost-lock');
  await assert.rejects(st.getJob('1 or 1=1'), e => e.code === 'state');
});
await t('Kho máy chủ: tạo / sửa bài LUÔN là nháp (kể cả khi dữ liệu đòi xuất bản); sửa chỉ khi còn nháp; khóa sb_secret_ không gửi Bearer', async () => {
  const log = []; let rows = [{ id: 'aaaaaaaa-0000-4000-8000-000000000002' }];
  const f = async (url, o) => { log.push({ url, headers: o.headers, body: o.body ? JSON.parse(o.body) : null }); return { ok: true, status: 200, text: async () => JSON.stringify(rows) }; };
  const FAKE_SECRET_KEY = 'sb_secret' + '_test-not-a-real-key';               // ghép chuỗi: giá trị giả, không phải khóa thật
  const st = serverStore({ ...WENV, SUPABASE_SERVICE_ROLE_KEY: FAKE_SECRET_KEY }, { fetchImpl: f });
  await st.insertArticle({ slug: 'a-b', title: 'T', status: 'published', reviewed_by_owner: true, published_at: 'x', id: 'y' });
  assert.equal(log[0].body.status, 'draft'); assert.equal(log[0].body.reviewed_by_owner, false); assert.ok(!('published_at' in log[0].body) && !('id' in log[0].body));
  assert.equal(log[0].headers.apikey, FAKE_SECRET_KEY);assert.ok(!log[0].headers.Authorization);
  await st.updateArticle({ id: rows[0].id, title: 'T2', status: 'published' }); assert.ok(log[1].url.includes('&status=eq.draft')); assert.equal(log[1].body.status, 'draft');
  rows = []; await assert.rejects(st.updateArticle({ id: 'aaaaaaaa-0000-4000-8000-000000000002', title: 'x' }), e => e.code === 'not-draft');
});
await t('Kho máy chủ: chưa cài migration → lỗi "setup" rõ ràng; tải ảnh chỉ tên UUID, đúng định dạng, ≤ 4,8 MB, không ghi đè', async () => {
  const st = serverStore(WENV, { fetchImpl: async () => ({ ok: false, status: 404, text: async () => JSON.stringify({ code: 'PGRST205', message: 'Could not find the table' }) }) });
  await assert.rejects(st.getSettings(), e => e.code === 'setup');
  const up = []; const m = serverMedia(WENV, { fetchImpl: async (url, o) => { up.push({ url, headers: o.headers }); return { ok: true, status: 200 }; } });
  await assert.rejects(m.upload('../hack.png', new Uint8Array(1), 'image/png')); await assert.rejects(m.upload('img/aaaaaaaa-0000-4000-8000-000000000001-1600.png', new Uint8Array(1), 'text/html'));
  await assert.rejects(m.upload('img/aaaaaaaa-0000-4000-8000-000000000001-1600.webp', new Uint8Array(6e6), 'image/webp'), e => e.code === 'image-size');
  await m.upload('img/aaaaaaaa-0000-4000-8000-000000000001-1600.webp', new Uint8Array(10), 'image/webp');
  assert.ok(up[0].url.endsWith('/storage/v1/object/kien-thuc/img/aaaaaaaa-0000-4000-8000-000000000001-1600.webp')); assert.equal(up[0].headers['x-upsert'], 'false');
});

// ================= 11. giao diện: khung xem trước không bị cắt =================
await t('Khung xem trước 🖥 1200 px tự thu nhỏ vừa khung (vd. màn hình 1216 px) — không cắt hai bên; 📱 390 px giữ nguyên', async () => {
  assert.deepEqual(fitScale(780, 1200), { scale: 0.65, width: 1200, outerWidth: 780 });
  assert.deepEqual(fitScale(1300, 1200), { scale: 1, width: 1200, outerWidth: 1200 });
  assert.deepEqual(fitScale(780, 390), { scale: 1, width: 390, outerWidth: 390 });
  assert.equal(fitScale(0, 1200).scale > 0, true);
});

console.log(`\n${n} test máy chạy việc phía máy chủ đạt (không gọi mạng, không chi phí).`);
