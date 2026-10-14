// Phase 1S — test lõi Xưởng nội dung AI + Edge Function (không gọi mạng, không chi phí).
// Chạy: node tools/kt-ai-test.mjs
import assert from 'node:assert/strict';
import { validatePackage, JSON_SCHEMA } from '../assets/kt/ai/package.mjs';
import { composeArticle, pendingSlots, applyImage } from '../assets/kt/ai/compose.mjs';
import { qaArticle } from '../assets/kt/ai/qa.mjs';
import { dupCheck, slugify, uniqueSlug } from '../assets/kt/ai/text.mjs';
import { GUIDES, GROUPS, IDEAS } from '../assets/kt/ai/taxonomy.mjs';
import { readLimits, withRetry, checkQuota, costOf, AIError, HARD } from '../assets/kt/ai/limits.mjs';
import { createProviders, parseJsonText } from '../assets/kt/ai/providers.mjs';
import { SAMPLES, mockArticle } from '../assets/kt/ai/mock-data.mjs';
import * as P from '../assets/kt/ai/pipeline.mjs';
import { placeholderPng } from '../assets/kt/ai/mockimg.mjs';
import { renderArticlePage } from '../assets/kt/render.mjs';
import { handle } from '../supabase/functions/kt-ai/handler.mjs';

let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('✓', name); };
const sample = k => JSON.parse(JSON.stringify(SAMPLES.find(s => s.key === k).pkg));

// ---------------- gói bài ----------------
await t('Gói hợp lệ (3 bài mẫu) qua kiểm tra, không lỗi', async () => { for (const s of SAMPLES) { const v = validatePackage(s.pkg); assert.ok(v.ok, s.key + v.errors); } });
await t('Từ chối khóa yêu cầu quyền / mã thực thi (sql, script, role, service_role…)', async () => {
  for (const k of ['sql', 'script', 'html', 'role', 'kt_role', 'service_role', 'policy', 'grant', 'api_key']) { const p = sample('vong-doi'); p.sections[0][k] = 'x'; assert.equal(validatePackage(p).ok, false, k); }
});
await t('Từ chối nội dung nguy hiểm: <script>, javascript:, onerror=, DROP TABLE, sb_secret_', async () => {
  for (const bad of ['<script>alert(1)</script>', '[x](javascript:alert(1))', '<img src=x onerror="a()">', 'drop table birds', 'sb_secret_abc']) { const p = sample('vong-doi'); p.sections[1].md = bad; assert.equal(validatePackage(p).ok, false, bad); }
});
await t('status / published_at / reviewed_by_owner trong gói bị BỎ QUA (bài luôn nháp)', async () => {
  const p = sample('vong-doi'); p.status = 'published'; p.reviewed_by_owner = true; p.published_at = '2026-01-01';
  const v = validatePackage(p); assert.ok(v.ok); assert.ok(!('status' in v.value) && !('reviewed_by_owner' in v.value)); assert.ok(v.warnings.some(w => /NHÁP/.test(w)));
});
await t('Thiếu nguồn / ít phần / tiêu đề ngắn → lỗi; chuỗi quá dài → cắt + cảnh báo; link nguồn không https → bỏ', async () => {
  const p = sample('vong-doi'); p.sources = []; assert.equal(validatePackage(p).ok, false);
  const q = sample('vong-doi'); q.sections = q.sections.slice(0, 1); assert.equal(validatePackage(q).ok, false);
  const r = sample('vong-doi'); r.title = 'Ngắn'; assert.equal(validatePackage(r).ok, false);
  const s = sample('vong-doi'); s.seo_title = 'x'.repeat(200); s.sources = [{ title: 'A', url: 'http://khong-an-toan.vn' }];
  const v = validatePackage(s); assert.ok(v.ok); assert.ok(v.value.seo_title.length <= 70); assert.equal(v.value.sources[0].url, '');
});
await t('Ký tự ẩn / điều khiển bị loại; JSON hỏng / không phải object bị từ chối', async () => {
  const C = String.fromCharCode, bad = [C(0), C(0x202E), C(0x2028), C(0x200B)];
  const p = sample('vong-doi'); p.title = 'Vòng' + bad[0] + ' đời' + bad[1] + ' Yến Phụng tháng' + bad[2] + ' mười' + bad[3];
  const v = validatePackage(p);
  assert.ok(bad.every(ch => !v.value.title.includes(ch)), 'còn ký tự ẩn');
  assert.equal(validatePackage('{hỏng').ok, false); assert.equal(validatePackage([1, 2]).ok, false); assert.equal(validatePackage('x'.repeat(400000)).ok, false);
});
await t('JSON schema cho AI có đủ các trường bắt buộc', async () => { for (const k of ['title', 'sections', 'sources', 'seo_description', 'cover']) assert.ok(JSON_SCHEMA.required.includes(k)); });

// ---------------- dàn trang ----------------
await t('5 bố cục cho chuỗi khối KHÁC NHAU với cùng một gói', async () => {
  const pkg = validatePackage(sample('vong-doi')).value; const seqs = new Set();
  for (const L of ['chuan', 'tap-chi', 'huong-dan', 'so-sanh', 'hoi-dap']) { const { article } = composeArticle(pkg, { layout: L }); assert.equal(article.cover.layout, L); seqs.add(article.blocks.map(b => b.type).join(',')); }
  assert.equal(seqs.size, 5);
});
await t('Bài dàn trang: luôn nháp, chưa duyệt, slug không trùng, SEO tự điền, Alt tự sinh, ≤8 ô ảnh', async () => {
  const pkg = validatePackage(sample('vong-doi')).value; pkg.seo_description = ''; pkg.excerpt = ''; pkg.sections[0].image.alt = '';
  const existing = [{ slug: slugify(pkg.title), title: 'x', status: 'published' }];
  const { article, slots } = composeArticle(pkg, { existing });
  assert.equal(article.status, 'draft'); assert.equal(article.reviewed_by_owner, false);
  assert.notEqual(article.slug, existing[0].slug); assert.ok(article.slug.endsWith('-2'));
  assert.ok(article.seo_description.length >= 50 && article.seo_description.length <= 170); assert.ok(article.excerpt.length > 20);
  const imgs = [article.cover, ...article.blocks.flatMap(b => [b.img, ...(b.imgs || [])])].filter(Boolean);
  assert.ok(imgs.every(im => im.alt && im.ai === true)); assert.ok(slots.length <= 8);
});
await t('Liên kết nội bộ chỉ trỏ tới Cẩm nang / Catalogue / bài Kiến thức có thật', async () => {
  const urls = new Set(['/#catalogue', ...GUIDES.map(g => g.url)]);
  for (const s of SAMPLES) { const { links } = composeArticle(validatePackage(s.pkg).value); assert.ok(links.every(l => urls.has(l.url)), JSON.stringify(links)); }
});
await t('Ô ảnh: liệt kê, gắn ảnh đúng vị trí; HTML render của bài AI an toàn (escape, chỉ 1 script)', async () => {
  const { article } = composeArticle(validatePackage(sample('sai-lam')).value);
  const pend = pendingSlots(article); assert.ok(pend.length >= 3);
  applyImage(article, pend[1].path, { path: 'img/aaaaaaaa-0000-4000-8000-000000000000-1600.webp', w: 1600, h: 1000 });
  assert.equal(pendingSlots(article).length, pend.length - 1);
  article.title = 'X </script><script>alert(1)</script>'; const h = renderArticlePage({ ...article, published_at: '2026-10-14T00:00:00Z' });
  assert.ok(!h.includes('<script>alert(1)')); assert.equal((h.match(/<script/g) || []).length, 2);
});

// ---------------- QA ----------------
const qaOf = md => qaArticle({ title: 'Bài thử quy tắc chuyên môn', seo_description: 'x'.repeat(60), sources: [{ title: 'a', url: 'https://australian.museum/x' }], cover: { path: 'a.webp' }, blocks: [{ type: 'text', md }] });
await t('QA chặn 4 quy tắc bắt buộc (giới tính chắc chắn, suy split, liều thuốc, khuyến khích đút bột)', async () => {
  for (const [md, code] of [['Nhìn cere xanh thì chắc chắn là trống.', 'sex-certain'], ['Chỉ cần xem ảnh là biết được giới tính.', 'sex-certain'],
    ['Nhìn màu lông có thể đoán chim mang gen ẩn opaline.', 'split-from-phenotype'], ['Pha 2 ml thuốc vào nước uống mỗi ngày.', 'vet-dose'],
    ['Cho chim uống Baytril khi bị tiêu chảy.', 'vet-dose'], ['Người mới nên tự đút bột chim non để chim thân người.', 'handfeed']]) {
    assert.ok(qaOf(md).errors.some(e => e.code === code), `${code}: ${md}`);
  }
});
await t('QA KHÔNG báo nhầm câu đúng (phủ định, "trong" ≠ "trống")', async () => {
  for (const md of ['Trứng chắc chắn nở trong vòng 18 ngày.', 'Không thể nhìn ảnh mà kết luận chắc chắn trống hay mái.', 'Màu lông không cho biết chim mang gen ẩn nào.',
    'Người mới không nên tự đút bột chim non.', 'Hãy đưa chim đến bác sĩ thú y.', 'Trại không cam kết giới tính chim non.']) {
    assert.ok(!qaOf(md).errors.some(e => ['sex-certain', 'split-from-phenotype', 'handfeed', 'vet-dose'].includes(e.code)), md);
  }
});
await t('QA: ảnh chưa tạo / thiếu ảnh bìa / bài tự đánh dấu duyệt → chặn duyệt', async () => {
  const { article } = composeArticle(validatePackage(sample('trong-mai')).value);
  const q = qaArticle(article); assert.equal(q.ok, false); assert.ok(q.errors.some(e => e.code === 'images-pending') && q.errors.some(e => e.code === 'cover'));
  assert.ok(qaArticle({ ...article, reviewed_by_owner: true }).errors.some(e => e.code === 'reviewed'));
  assert.ok(qaArticle({ ...article, status: 'published' }).errors.some(e => e.code === 'status'));
});
await t('QA: nguồn ngoài danh sách tin cậy → cảnh báo OWNER xác minh', async () => {
  const q = qaArticle({ title: 'Bài thử nguồn tham khảo', seo_description: 'x'.repeat(60), cover: { path: 'a.webp' }, sources: [{ title: 'Blog lạ', url: 'https://blog-la.example/x' }, { title: 'Không link' }], blocks: [] });
  assert.equal(q.warnings.filter(w => w.code === 'source-unverified').length, 2);
});

// ---------------- chống trùng ----------------
await t('Chống trùng chủ đề với 25 Cẩm nang và bài đã có', async () => {
  assert.notEqual(dupCheck('Yến Phụng ăn gì mỗi ngày?', GUIDES).level, 'moi');   // gần trùng → cảnh báo
  assert.equal(dupCheck('Những thực phẩm không nên cho chim ăn', GUIDES).level, 'trung');
  assert.equal(dupCheck('Thay lông ở Yến Phụng: bình thường hay bất thường?', GUIDES).level, 'moi');
  assert.equal(uniqueSlug('abc', ['abc', 'abc-2']), 'abc-3');
});
await t('Danh mục: 7 nhóm, mọi ý tưởng thuộc nhóm hợp lệ và không trùng Cẩm nang', async () => {
  assert.equal(GROUPS.length, 7);
  for (const i of IDEAS) { assert.ok(GROUPS.some(g => g.id === i.group)); assert.notEqual(dupCheck(i.title, GUIDES).level, 'trung', i.title); }
});

// ---------------- giới hạn ----------------
await t('Giới hạn: biến môi trường không vượt trần cứng; giá tính đúng; hạn mức ngày / tháng', async () => {
  const L = readLimits({ KT_AI_DAILY_ARTICLES: '999', KT_AI_MONTHLY_BUDGET_USD: '5000', KT_AI_MAX_OUTPUT_TOKENS: 'abc' });
  assert.equal(L.dailyArticles, HARD.dailyArticles); assert.equal(L.monthlyBudgetUsd, HARD.monthlyBudgetUsd); assert.equal(L.maxOutputTokens, 9000);
  assert.equal(costOf({ model: 'm', tokensIn: 1e6, tokensOut: 5e5, images: 2 }, { m: { in: 2, out: 8, image: 0.1 } }), 6.2);
  assert.equal(costOf({ model: 'x' }, {}), null);
  const now = new Date('2026-10-14T10:00:00Z');
  const rows = Array.from({ length: 5 }, (_, i) => ({ at: `2026-10-14T0${i}:00:00Z`, kind: 'text', task: 'article', cost_usd: 0.5, ok: true }));
  assert.equal(checkQuota(rows, readLimits({}), 'article', now).code, 'daily');
  assert.equal(checkQuota([{ at: '2026-10-02T00:00:00Z', kind: 'text', task: 'article', cost_usd: 16, ok: true }], readLimits({}), 'image', now).code, 'budget');
  assert.equal(checkQuota([{ at: '2026-10-14T09:59:30Z', kind: 'text', task: 'article', ok: false }], readLimits({}), 'article', now).code, 'too-fast');
  assert.ok(checkQuota([], readLimits({}), 'article', now).ok);
});
await t('Thử lại có giới hạn: lỗi tạm thời thử lại, lỗi khóa / hết tiền KHÔNG thử lại, timeout báo đúng', async () => {
  let calls = 0; const wait = () => Promise.resolve();
  await assert.rejects(withRetry(async () => { calls++; throw new AIError('server', 'x', { retryable: true }); }, { retries: 2, wait }), /x/); assert.equal(calls, 3);
  calls = 0; await assert.rejects(withRetry(async () => { calls++; throw new AIError('quota', 'hết tiền'); }, { retries: 2, wait })); assert.equal(calls, 1);
  calls = 0; await assert.rejects(withRetry(async () => { calls++; throw new AIError('server', 's', { retryable: true }); }, { retries: 99, wait })); assert.equal(calls, HARD.maxRetries + 1);
  await assert.rejects(withRetry(signal => new Promise((_, rej) => signal.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' })))), { retries: 0, timeoutMs: 20, wait }), e => e.code === 'timeout');
});

// ---------------- nhà cung cấp ----------------
const fakeFetch = (handler) => { const log = []; const f = async (url, opts) => { log.push({ url, opts, body: opts.body ? JSON.parse(opts.body) : null }); const r = handler(url, opts); return { ok: r.status < 400, status: r.status, text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)) }; }; f.log = log; return f; };
await t('Cấu hình thiếu khóa / model → lỗi config rõ ràng; Anthropic không được chọn làm nhà cung cấp ảnh', async () => {
  assert.throws(() => createProviders({ KT_AI_TEXT_PROVIDER: 'openai', KT_AI_TEXT_MODEL: 'm' }), e => e.code === 'config');
  assert.throws(() => createProviders({ KT_AI_TEXT_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k' }), e => e.code === 'config');
  assert.throws(() => createProviders({ KT_AI_TEXT_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k', KT_AI_TEXT_MODEL: 'm', KT_AI_IMAGE_PROVIDER: 'anthropic' }), e => e.code === 'config');
  assert.equal(createProviders({}).describe.mock, true);
});
await t('OpenAI: gọi đúng endpoint, model lấy từ biến môi trường, khóa trong header; lỗi 401 / 429 quota / 429 rate / 500 phân loại đúng', async () => {
  const env = { KT_AI_TEXT_PROVIDER: 'openai', KT_AI_TEXT_MODEL: 'model-tu-env', KT_AI_IMAGE_PROVIDER: 'openai', KT_AI_IMAGE_MODEL: 'img-tu-env', OPENAI_API_KEY: 'sk-test' };
  const f = fakeFetch(url => url.includes('/responses') ? { status: 200, body: { output_text: JSON.stringify({ ok: 1 }), usage: { input_tokens: 10, output_tokens: 20 } } } : { status: 200, body: { data: [{ b64_json: Buffer.from('png').toString('base64') }] } });
  const p = createProviders(env, { fetchImpl: f });
  const r = await p.text.generateJSON({ system: 's', user: 'u', schema: { type: 'object' }, maxOutputTokens: 100 });
  assert.deepEqual(r.json, { ok: 1 }); assert.equal(r.usage.tokensOut, 20);
  assert.equal(f.log[0].url, 'https://api.openai.com/v1/responses'); assert.equal(f.log[0].body.model, 'model-tu-env'); assert.equal(f.log[0].opts.headers.Authorization, 'Bearer sk-test');
  const im = await p.image.generateImage({ prompt: 'x', ratio: '1:1' }); assert.equal(f.log[1].body.model, 'img-tu-env'); assert.equal(f.log[1].body.size, '1024x1024'); assert.equal(new TextDecoder().decode(im.bytes), 'png');
  for (const [status, body, code] of [[401, {}, 'auth'], [429, { error: { code: 'insufficient_quota' } }, 'quota'], [429, {}, 'rate'], [500, {}, 'server']]) {
    const p2 = createProviders(env, { fetchImpl: fakeFetch(() => ({ status, body })) });
    await assert.rejects(p2.text.generateJSON({ system: 's', user: 'u', maxOutputTokens: 10 }), e => e.code === code);
  }
});
await t('Anthropic: đúng endpoint + header phiên bản, đọc JSON trong khối code, báo lỗi khi bị cắt token', async () => {
  const env = { KT_AI_TEXT_PROVIDER: 'anthropic', KT_AI_TEXT_MODEL: 'claude-tu-env', ANTHROPIC_API_KEY: 'ak' };
  const f = fakeFetch(() => ({ status: 200, body: { content: [{ type: 'text', text: '```json\n{"a":1}\n```' }], usage: { input_tokens: 1, output_tokens: 2 } } }));
  const r = await createProviders(env, { fetchImpl: f }).text.generateJSON({ system: 's', user: 'u', maxOutputTokens: 10 });
  assert.deepEqual(r.json, { a: 1 }); assert.equal(f.log[0].url, 'https://api.anthropic.com/v1/messages'); assert.equal(f.log[0].opts.headers['x-api-key'], 'ak'); assert.equal(f.log[0].body.model, 'claude-tu-env');
  const g = fakeFetch(() => ({ status: 200, body: { stop_reason: 'max_tokens', content: [{ type: 'text', text: '{' }] } }));
  await assert.rejects(createProviders(env, { fetchImpl: g }).text.generateJSON({ system: 's', user: 'u', maxOutputTokens: 10 }), e => e.code === 'bad_output');
  assert.throws(() => parseJsonText('không có json'), e => e.code === 'bad_output');
});
await t('Mock: trả bài mẫu đúng tiêu đề, chủ đề khác → gói [MÔ PHỎNG]; ảnh mock là PNG thật', async () => {
  assert.equal(mockArticle({ title: SAMPLES[2].pkg.title }).title, SAMPLES[2].pkg.title);
  const m = mockArticle({ title: 'Chủ đề bất kỳ' }); assert.ok(m.title.startsWith('[MÔ PHỎNG]')); assert.ok(validatePackage(m).ok);
  const png = await placeholderPng('x', '1:1'); assert.deepEqual([...png.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});

// ---------------- pipeline (kho bộ nhớ + mock) ----------------
function memDeps({ imageFail = () => false } = {}) {
  const S = { arts: new Map(), jobs: new Map(), vers: [] }; let clock = new Date('2026-10-14T08:00:00Z');
  const store = {
    async listArticles() { return [...S.arts.values()]; }, async getArticle(id) { return S.arts.has(id) ? JSON.parse(JSON.stringify(S.arts.get(id))) : null; },
    async saveArticle(row) { const r = JSON.parse(JSON.stringify(row)); if (!r.id) r.id = crypto.randomUUID(); if ([...S.arts.values()].some(a => a.slug === r.slug && a.id !== r.id)) throw new Error('duplicate slug'); r.updated_at = clock.toISOString(); S.arts.set(r.id, r); return JSON.parse(JSON.stringify(r)); },
    async listJobs() { return [...S.jobs.values()]; }, async getJob(id) { return S.jobs.has(id) ? JSON.parse(JSON.stringify(S.jobs.get(id))) : null; },
    async saveJob(j) { S.jobs.set(j.id, JSON.parse(JSON.stringify(j))); return JSON.parse(JSON.stringify(j)); },
    async addVersion(v) { const version = S.vers.filter(x => x.article_id === v.article_id).length + 1; const r = { ...JSON.parse(JSON.stringify(v)), version }; S.vers.push(r); return r; },
    async listVersions(id) { return S.vers.filter(x => x.article_id === id); }
  };
  const prov = createProviders({});
  let imgCalls = 0;
  const ai = {
    suggest: p => prov.text.generateJSON({ meta: { task: 'suggest', ...p } }), article: async p => ({ ...(await prov.text.generateJSON({ meta: { task: 'article', ...p } })), provider: prov.describe }),
    revise: p => prov.text.generateJSON({ meta: { task: 'revise', ...p } }),
    image: async p => { imgCalls++; if (imageFail(imgCalls)) throw new AIError('server', 'ảnh lỗi tạm', { retryable: true }); return prov.image.generateImage(p); }
  };
  const media = { async fromBytes(bytes, mime, { withOg }) { assert.ok(bytes.length > 100 && mime === 'image/png'); const id = crypto.randomUUID(); return { path: `img/${id}-1600.webp`, path_sm: `img/${id}-800.webp`, w: 1600, h: 900, w_sm: 800, ...(withOg ? { og_path: `img/${id}-og.jpg` } : {}) }; } };
  return { S, deps: { store, ai, media, now: () => clock }, tick: ms => { clock = new Date(clock.getTime() + ms); } };
}
await t('Pipeline: đề xuất (lọc trùng) → tạo → ảnh → QA → Chờ OWNER duyệt; bài luôn NHÁP, không tự xuất bản', async () => {
  const { S, deps } = memDeps();
  const ideas = await P.suggestIdeas(deps, { groups: ['nguoi-moi'], count: 3 }); assert.ok(ideas.length >= 2 && ideas.every(i => i.dup));
  const job = await P.createJob(deps, { title: 'Chủ đề thử nghiệm quy trình', group: 'nguoi-moi' });
  const done = await P.runJob(deps, job.id);
  const art = S.arts.get(done.article_id);
  assert.equal(art.status, 'draft'); assert.equal(art.reviewed_by_owner, false);
  assert.equal(pendingSlots(art).length, 0); assert.ok(art.cover.og_path);
  assert.equal(done.images_done, done.images_total); assert.ok(['awaiting_owner', 'qa'].includes(done.status));
  assert.equal(S.vers.length, 1); assert.ok([...S.arts.values()].every(a => a.status !== 'published'));
});
await t('Pipeline: lỗi ảnh giữa chừng → bài KHÔNG mất, chạy tiếp chỉ tạo ảnh còn thiếu', async () => {
  const { S, deps } = memDeps({ imageFail: c => c === 2 });
  const job = await P.createJob(deps, { title: 'Chủ đề thử lỗi ảnh', group: 'cham-soc' });
  let j = await P.runJob(deps, job.id);
  assert.equal(j.image_errors.length, 1); assert.equal(j.status, 'qa'); assert.ok(j.qa.errors.some(e => e.code === 'images-pending' || e.code === 'cover'));
  const before = pendingSlots(S.arts.get(j.article_id)).length; assert.equal(before, 1);
  j = await P.runJob(deps, { ...j }.id);
  assert.equal(pendingSlots(S.arts.get(j.article_id)).length, 0); assert.equal(S.arts.size, 1, 'không tạo bài trùng khi chạy tiếp');
});
await t('Pipeline: chống tạo trùng, khóa khi đang chạy, trần số lần thử', async () => {
  const { deps } = memDeps();
  await assert.rejects(P.createJob(deps, { title: 'Yến Phụng ăn gì?', group: 'cham-soc' }), e => e.code === 'duplicate');
  const job = await P.createJob(deps, { title: 'Chủ đề thử khóa và giới hạn', group: 'nguoi-moi' });
  await deps.store.saveJob({ ...job, lock_until: new Date(deps.now().getTime() + 60000).toISOString() });
  await assert.rejects(P.runJob(deps, job.id), e => e.code === 'locked');
  await deps.store.saveJob({ ...job, lock_until: null, attempts: P.MAX_ATTEMPTS });
  await assert.rejects(P.runJob(deps, job.id), e => e.code === 'attempts');
  assert.equal((await deps.store.getJob(job.id)).status, 'failed');
});
await t('Pipeline: OWNER yêu cầu sửa → ghi phiên bản; AI sửa giữ id + slug + ảnh cũ; khôi phục phiên bản về nháp', async () => {
  const { S, deps } = memDeps();
  const job = await P.createJob(deps, { title: SAMPLES[0].pkg.title, group: 'nguoi-moi' });
  let j = await P.runJob(deps, job.id);
  const art0 = S.arts.get(j.article_id); const cover0 = art0.cover.path;
  await assert.rejects(P.requestChanges(deps, j.id, ''), e => e.code === 'note');
  j = await P.requestChanges(deps, j.id, 'Viết ngắn hơn phần mở bài');
  assert.equal(j.status, 'needs_changes'); assert.equal(S.vers.length, 2); assert.equal(S.vers[1].author, 'owner');
  j = await P.reviseJob(deps, j.id);
  const art1 = S.arts.get(j.article_id);
  assert.equal(art1.id, art0.id); assert.equal(art1.slug, art0.slug); assert.equal(art1.cover.path, cover0, 'ảnh cũ được giữ');
  assert.equal(S.vers.length, 3); assert.equal(S.vers[2].author, 'ai');
  const restored = await P.restoreVersion(deps, art1.id, 1);
  assert.equal(restored.status, 'draft'); assert.equal(restored.slug, art0.slug); assert.equal(S.vers.length, 4);
});
await t('Pipeline: KHÔNG sửa bài đã công khai / đã ẩn; đồng bộ trạng thái sau khi OWNER xuất bản', async () => {
  const { S, deps } = memDeps();
  const job = await P.createJob(deps, { title: 'Chủ đề thử bài đã công khai', group: 'nguoi-moi' });
  let j = await P.runJob(deps, job.id);
  const a = S.arts.get(j.article_id); a.status = 'published'; S.arts.set(a.id, a);       // OWNER xuất bản trong trình soạn
  j = await P.syncJob(deps, j); assert.equal(j.status, 'published');
  await assert.rejects(P.runJob(deps, j.id), e => e.code === 'closed');
  await deps.store.saveJob({ ...j, status: 'qa', step: 'images' });
  await assert.rejects(P.runJob(deps, j.id), e => e.code === 'not-draft');
  assert.equal(S.arts.get(a.id).status, 'published', 'bài công khai không bị đụng');
});

// ---------------- Edge Function (handler) ----------------
const OWNER_JWT = ['h', Buffer.from(JSON.stringify({ aal: 'aal1' })).toString('base64url'), 's'].join('.');
const AAL2_JWT = ['h', Buffer.from(JSON.stringify({ aal: 'aal2' })).toString('base64url'), 's'].join('.');
const ENV = { KT_AI_ENABLED: '1', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', KT_ALLOWED_ORIGINS: 'https://yenphungviet.vercel.app', KT_ALLOWED_ORIGIN_SUFFIX: '-mrhenryceo-2691s-projects.vercel.app' };
function authFetch(md) { return async (url) => url.endsWith('/auth/v1/user') ? { ok: !!md, status: md ? 200 : 401, json: async () => ({ id: 'u', app_metadata: md }) } : { ok: false, status: 404 }; }
const memUsage = () => { const rows = []; return { rows, async list() { return rows; }, async add(r) { rows.push(r); } }; };
const call = (body, { origin = 'https://yenphungviet.vercel.app', token = OWNER_JWT, md = { kt_role: 'owner' }, env = ENV, usage = memUsage(), method = 'POST' } = {}) =>
  handle(new Request('https://fn/kt-ai', { method, headers: { origin, 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: method === 'POST' ? JSON.stringify(body) : undefined }), env, { fetchImpl: authFetch(md), usageStore: usage });
await t('Edge Function: CORS chỉ cho website + Preview của dự án; chỉ POST; tắt bằng KT_AI_ENABLED', async () => {
  assert.equal((await call({ action: 'status' }, { origin: 'https://ke-gian.example' })).status, 403);
  assert.equal((await call({ action: 'status' }, { origin: 'https://yenphungviet-abc123-mrhenryceo-2691s-projects.vercel.app' })).status, 200);
  assert.equal((await call({ action: 'status' }, { origin: 'https://evil-mrhenryceo-2691s-projects.vercel.app' })).status, 403);
  assert.equal((await call(null, { method: 'GET' })).status, 405);
  assert.equal((await call({ action: 'status' }, { env: { ...ENV, KT_AI_ENABLED: '0' } })).status, 503);
});
await t('Edge Function: không token → 401; không phải OWNER → 403; kt_mfa bắt buộc + aal1 → 403; aal2 → OK', async () => {
  assert.equal((await call({ action: 'status' }, { token: '' })).status, 401);
  assert.equal((await call({ action: 'status' }, { md: null })).status, 401);
  assert.equal((await call({ action: 'status' }, { md: { kt_role: 'editor' } })).status, 403);
  assert.equal((await call({ action: 'status' }, { md: { kt_role: 'owner', kt_mfa: 'required' } })).status, 403);
  assert.equal((await call({ action: 'status' }, { token: AAL2_JWT, md: { kt_role: 'owner', kt_mfa: 'required' } })).status, 200);
});
await t('Edge Function: cờ "dev owner" chỉ có hiệu lực trong dev-server; thao tác lạ / JSON hỏng / quá lớn bị chặn', async () => {
  assert.equal((await call({ action: 'status' }, { token: '', env: { ...ENV, KT_DEV_FAKE_OWNER: '1' } })).status, 401);
  assert.equal((await call({ action: 'status' }, { token: '', env: { ...ENV, KT_DEV_FAKE_OWNER: '1', KT_RUNTIME: 'dev-server' } })).status, 200);
  assert.equal((await call({ action: 'xuat_ban' })).status, 400);
  assert.equal((await call({ action: 'article', notes: 'x'.repeat(210000) })).status, 413);
});
await t('Edge Function: tạo bài (mock) trả gói đã kiểm tra + ghi chi phí; ảnh trả PNG base64', async () => {
  const usage = memUsage();
  const r = await call({ action: 'article', title: SAMPLES[1].pkg.title, group: 'nguoi-moi' }, { usage }); const j = await r.json();
  assert.equal(r.status, 200); assert.equal(j.valid, true); assert.equal(j.pkg.title, SAMPLES[1].pkg.title); assert.equal(usage.rows.length, 1); assert.equal(usage.rows[0].task, 'article');
  const ri = await call({ action: 'image', prompt: 'a budgie', ratio: '4:3' }, { usage }); const ji = await ri.json();
  assert.equal(ri.status, 200); assert.equal(Buffer.from(ji.b64, 'base64').slice(1, 4).toString(), 'PNG'); assert.equal(usage.rows.length, 2);
});
await t('Edge Function: vượt hạn mức ngày → 429 và KHÔNG gọi AI', async () => {
  const usage = memUsage(); const today = new Date().toISOString();
  for (let i = 0; i < 5; i++) usage.rows.push({ at: today, kind: 'text', task: 'article', cost_usd: 0, ok: true });
  const r = await call({ action: 'article', title: 'Chủ đề bất kỳ', group: 'nguoi-moi' }, { usage });
  assert.equal(r.status, 429); assert.equal(usage.rows.length, 5);
});

console.log(`\n${n} test Xưởng nội dung AI đạt (không gọi mạng, không chi phí).`);
