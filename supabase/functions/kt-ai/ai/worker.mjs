// BẢN SAO TỰ ĐỘNG từ assets/kt/ai/worker.mjs — KHÔNG sửa ở đây. Sửa bản gốc rồi chạy: node tools/build-edge.mjs
// Phase 1S / Giai đoạn B — "máy chạy việc" của Xưởng nội dung: chạy PHÍA MÁY CHỦ (Edge Function kt-ai, action "tick"),
// OWNER đóng trình duyệt thì việc vẫn tiếp tục. Mỗi lần "tick":
//   1. nhận (claim) MỘT việc đến hạn bằng khóa thuê (lease) trong database → hai máy không bao giờ chạy cùng một việc;
//   2. chạy từng bước cho tới khi gặp một bước "nặng" (gọi AI thật / tạo ảnh) hoặc hết ngân sách thời gian;
//   3. lưu tiến độ sau MỖI bước → lỗi giữa chừng không mất phần đã làm; thả khóa.
// Các bước: article → article_wait → compose → sources → images (1 ảnh / tick) → qa → notify → done
//           (sửa theo góp ý: revise → revise_wait → compose → sources → images → qa → notify → done)
// Lỗi tạm thời → thử lại có giới hạn với độ trễ tăng dần (next_run_at). Lỗi cấu hình / hết hạn mức → dừng, giữ bài.
// TUYỆT ĐỐI KHÔNG xuất bản: chỉ ghi bài status='draft', reviewed_by_owner=false (database còn chặn thêm một lớp — kt_r3).
// Phụ thuộc truyền vào (deps) → cùng một mã chạy ở Edge Function (Deno), Node test và chế độ thử local trong trình duyệt.
import { validatePackage, JSON_SCHEMA } from './package.mjs';
import { composeArticle, applyImage, pendingSlots } from './compose.mjs';
import { qaArticle } from './qa.mjs';
import { dupCheck } from './text.mjs';
import { GUIDES, IDEAS } from './taxonomy.mjs';
import { AIError, withRetry, costOf, checkQuota } from './limits.mjs';
import { SYSTEM, articlePrompt, revisePrompt, suggestPrompt, SUGGEST_SCHEMA, imagePrompt } from './prompt.mjs';
import { checkSources } from './sources.mjs';
import { buildMessage } from './notify.mjs';

export const ACTIVE = ['queued', 'generating'];
export const STEPS = ['article', 'article_wait', 'compose', 'sources', 'images', 'qa', 'notify', 'done', 'revise', 'revise_wait'];
export const W = {
  leaseSec: 180,            // khóa thuê 1 việc (Edge Function Free: tối đa 150 s / request)
  budgetMs: 100000,         // ngân sách thời gian 1 tick (chừa ≥ 40 s cho lưu + thả khóa)
  heavyStartMs: 25000,      // chỉ BẮT ĐẦU bước nặng (ảnh) khi tick mới chạy < 25 s
  maxStepsPerTick: 20,
  maxStepAttempts: 3,       // lỗi tạm thời: thử lại tối đa 3 lần / bước
  backoffSec: [20, 90, 300],
  maxArticleAttempts: 3,    // tạo lại bài (AI trả JSON hỏng / không hợp lệ) tối đa 3 lần
  maxRuns: 80,              // chặn vòng lặp vô hạn: một việc tối đa 80 lần tick
  maxImageTriesPerSlot: 2,
  submitTimeoutMs: 45000,   // gửi yêu cầu bất đồng bộ phải trả lời nhanh
  pollTimeoutMs: 30000,
  maxWaitMs: { openai: 30 * 60e3, anthropic: 26 * 3600e3, mock: 60e3 }
};
const STOP = ['quota', 'budget', 'daily', 'daily-images', 'too-fast', 'auth', 'config', 'policy', 'bad_request', 'setup'];
const uid = () => globalThis.crypto.randomUUID();

export class WorkerError extends Error { constructor(code, msg, { retryable = false } = {}) { super(msg); this.code = code; this.retryable = retryable; } }
const log = (job, msg, at) => { job.history = [...(job.history || []), { at, msg }].slice(-60); };
const iso = d => d.toISOString();
const later = (now, sec) => iso(new Date(now.getTime() + sec * 1000));
function pollDelaySec(waitedMs) { return waitedMs < 120e3 ? 15 : waitedMs < 15 * 60e3 ? 60 : 300; }

// ---------------------------------------------------------------- bước: chữ (viết / sửa)
async function submitText(D, job, task) {
  const { store, prov, limits, now } = D;
  const rows = await store.listUsage(iso(new Date(Date.UTC(now().getUTCFullYear(), now().getUTCMonth(), 1))));
  const q = checkQuota(rows, limits, task === 'article' ? 'article' : 'text', now());
  if (!q.ok && q.code === 'too-fast') {                                    // giãn cách giữa 2 bài: HẸN LẠI, không coi là lỗi
    job.next_run_at = later(now(), limits.minSecondsBetweenArticles + 1);
    return { heavy: false, wait: true };
  }
  if (!q.ok) throw new AIError(q.code, q.msg);
  let user;
  if (task === 'article') {
    if ((job.attempts || 0) >= W.maxArticleAttempts) throw new WorkerError('attempts', `Đã thử tạo bài ${job.attempts} lần — dừng để tránh tốn chi phí.`);
    const arts = await store.listArticles();
    user = articlePrompt({ title: job.title, group: job.grp, angle: job.angle, notes: job.notes, risk: job.risk || [], existingTitles: [...arts.map(a => a.title), ...GUIDES.map(g => g.title)] });
  } else {
    if (!job.pkg || !job.owner_note) throw new WorkerError('state', 'Thiếu bài hoặc góp ý để sửa.');
    user = revisePrompt({ pkg: job.pkg, note: job.owner_note });
  }
  if (user.length > limits.maxInputChars) throw new AIError('bad_request', 'Tư liệu quá dài.');
  job.attempts = (job.attempts || 0) + 1;                                  // tính lần thử TRƯỚC khi gọi (máy chủ sập vẫn được tính)
  await D.save(job);
  const meta = { task, title: job.title, group: job.grp, pkg: job.pkg, note: job.owner_note };
  const r = await withRetry(signal => prov.text.submitJSON({ system: SYSTEM, user, schema: JSON_SCHEMA, maxOutputTokens: limits.maxOutputTokens, meta, signal }), { retries: 0, timeoutMs: W.submitTimeoutMs });
  if (r.done) return takeText(D, job, task, r);
  job.ai_handle = { ...r.handle, task, at: iso(now()) };
  job.step = task + '_wait'; job.next_run_at = later(now(), 15);
  log(job, `Đã gửi yêu cầu ${task === 'article' ? 'viết bài' : 'sửa bài'} (${prov.describe.text}) — đang chờ AI`, iso(now()));
  return { heavy: !prov.describe.mock, wait: true };
}
async function pollText(D, job) {
  const { prov, now } = D;
  const h = job.ai_handle; const task = job.step === 'revise_wait' ? 'revise' : 'article';
  if (!h) { job.step = task; return { heavy: false }; }
  const r = await withRetry(signal => prov.text.pollJSON(h, { signal }), { retries: 0, timeoutMs: W.pollTimeoutMs });
  if (r.done) return takeText(D, job, task, r);
  const waited = now().getTime() - new Date(h.at).getTime();
  if (waited > (W.maxWaitMs[h.provider] || W.maxWaitMs.openai)) { job.ai_handle = null; throw new AIError('timeout', `AI chưa trả kết quả sau ${Math.round(waited / 60000)} phút.`, { retryable: true }); }
  job.next_run_at = later(now(), pollDelaySec(waited));
  return { heavy: false, wait: true };
}
async function takeText(D, job, task, r) {
  const { store, prov, prices, now } = D;
  let cost = costOf({ model: r.usage.model, tokensIn: r.usage.tokensIn, tokensOut: r.usage.tokensOut }, prices);
  if (cost != null && r.usage.batch) cost = Math.round(cost * 5000) / 10000;          // Anthropic Batches: −50 %
  const v = validatePackage(r.json);
  await store.addUsage({ at: iso(now()), task, kind: 'text', provider: prov.describe.text, model: r.usage.model || '', tokens_in: r.usage.tokensIn || 0, tokens_out: r.usage.tokensOut || 0,
    cost_usd: cost, ok: v.ok, error: v.ok ? null : v.errors.join(' ').slice(0, 500), job_id: job.id });
  job.cost_usd = Math.round(((Number(job.cost_usd) || 0) + (cost || 0)) * 10000) / 10000;
  job.ai_handle = null;
  if (!v.ok) {
    log(job, 'Gói bài AI không hợp lệ: ' + v.errors.join(' ').slice(0, 200), iso(now()));
    if (task === 'article' && (job.attempts || 0) < W.maxArticleAttempts) { job.step = 'article'; job.next_run_at = iso(now()); return { heavy: !prov.describe.mock }; }
    throw new WorkerError('invalid', 'Gói bài AI không hợp lệ: ' + v.errors.join(' ').slice(0, 300));
  }
  job.pkg = v.value; job.pkg_warnings = v.warnings; job.provider = prov.describe;
  job.step = 'compose'; job.next_run_at = iso(now());
  log(job, task === 'article' ? `Đã viết bài (${prov.describe.text})` : 'AI đã sửa theo góp ý', iso(now()));
  return { heavy: !prov.describe.mock };
}

// ---------------------------------------------------------------- bước: dàn trang → lưu NHÁP
const snapshot = a => { const s = JSON.parse(JSON.stringify(a)); delete s.id; delete s.created_at; delete s.updated_at; return s; };
async function draftOnly(store, id) {
  const a = id && await store.getArticle(id);
  if (!a) throw new WorkerError('missing', 'Bài nháp đã bị xóa.');
  if (a.status !== 'draft') throw new WorkerError('not-draft', `Bài đang ở trạng thái "${a.status}" — Xưởng chỉ được sửa bài nháp.`);
  return a;
}
// Giữ tối đa `keep` ô ảnh có mô tả; ô thừa: khối chỉ có ảnh → bỏ, ảnh + chữ → còn chữ, bộ ảnh → bớt ảnh.
export function capImages(article, keep) {
  let n = article.cover && article.cover.prompt && !article.cover.path ? 1 : 0;
  const over = im => im && im.prompt && !im.path && ++n > keep;
  article.blocks = (article.blocks || []).flatMap(b => {
    if (!b) return [];
    if (b.img && over(b.img)) return b.type === 'image' ? [] : [{ type: 'text', md: b.md || '' }];
    if (Array.isArray(b.imgs)) { b.imgs = b.imgs.filter(im => !over(im)); if (!b.imgs.length) return []; }
    return [b];
  });
  return article;
}
async function addVersion(store, articleId, author, note, art) {
  const vs = await store.listVersions(articleId);
  const version = vs.reduce((m, v) => Math.max(m, v.version), 0) + 1;
  return store.addVersion({ article_id: articleId, version, author, note: String(note).slice(0, 4000), snapshot: snapshot(art) });
}
async function stepCompose(D, job) {
  const { store, limits, now } = D;
  const arts = await store.listArticles();
  let saved;
  if (job.article_id) {                                                    // sửa theo góp ý: giữ id, slug, ảnh cũ trùng mô tả
    const art = await draftOnly(store, job.article_id);
    const { article } = composeArticle(job.pkg, { existing: arts.filter(a => a.id !== art.id) });
    const old = new Map(); const collect = im => { if (im && im.prompt && im.path) old.set(im.prompt, im); };
    collect(art.cover); (art.blocks || []).forEach(b => { if (b) { collect(b.img); (b.imgs || []).forEach(collect); } });
    const reuse = im => { const o = im && im.prompt && old.get(im.prompt); if (o) Object.assign(im, { path: o.path, path_sm: o.path_sm, w: o.w, h: o.h, w_sm: o.w_sm, og_path: o.og_path || '', focus: o.focus }); };
    reuse(article.cover); article.blocks.forEach(b => { reuse(b.img); (b.imgs || []).forEach(reuse); });
    capImages(article, limits.maxImagesPerArticle);
    saved = await store.updateArticle({ ...article, id: art.id, slug: art.slug, status: 'draft', reviewed_by_owner: false });
    await addVersion(store, saved.id, 'ai', `AI sửa theo góp ý: ${String(job.owner_note || '').slice(0, 200)}`, saved);
    job.owner_note = '';
  } else {
    const { article } = composeArticle(job.pkg, { existing: arts });
    capImages(article, limits.maxImagesPerArticle);
    saved = await store.insertArticle({ ...article, status: 'draft', reviewed_by_owner: false });
    await addVersion(store, saved.id, 'ai', 'Bản AI đầu tiên', saved);
    job.article_id = saved.id;
  }
  job.images_total = pendingSlots(saved).length; job.images_done = 0; job.image_errors = [];
  job.step = 'sources'; job.next_run_at = iso(now());
  log(job, `Đã lưu nháp "${saved.slug}"`, iso(now()));
  return { heavy: false };
}

// ---------------------------------------------------------------- bước: kiểm tra link nguồn
async function stepSources(D, job) {
  const { store, now } = D;
  const art = await draftOnly(store, job.article_id);
  const sc = await checkSources(art.sources, { fetchImpl: D.fetchUrl, now });
  if (sc.removed.length) await store.updateArticle({ ...art, sources: sc.kept, status: 'draft', reviewed_by_owner: false });
  job.source_check = { at: sc.at, summary: sc.summary, removed: sc.removed, results: sc.results.map(r => ({ title: r.title, url: r.url, state: r.state, status: r.status, reason: r.reason })), note: sc.note };
  job.step = 'images'; job.next_run_at = iso(now());
  log(job, `Kiểm tra link nguồn: ${sc.summary.ok} mở được, ${sc.summary.removed} bị bỏ, ${sc.summary.noUrl} không có link`, iso(now()));
  return { heavy: false };
}

// ---------------------------------------------------------------- bước: ảnh (MỘT ảnh mỗi lần)
async function stepImages(D, job, elapsedMs) {
  const { store, prov, limits, prices, now } = D;
  let art = await draftOnly(store, job.article_id);
  const errs = job.image_errors || [];
  const tries = p => errs.filter(e => e.slot === p).length;
  const pend = pendingSlots(art).filter(s => tries(s.path) < W.maxImageTriesPerSlot && !errs.some(e => e.slot === s.path && e.final));
  const toQa = msg => { if (msg) log(job, msg, iso(now())); job.step = 'qa'; job.next_run_at = iso(now()); return { heavy: false }; };
  if (!pend.length) return toQa(errs.length ? `${pendingSlots(art).length} ảnh chưa tạo được` : '');
  if (!prov.image) return toQa('Chưa cấu hình nhà cung cấp ảnh (KT_AI_IMAGE_PROVIDER) — ảnh để ô giữ chỗ');
  if (errs.some(e => e.stop)) return toQa('');
  if (elapsedMs > W.heavyStartMs && !prov.describe.mock) { job.next_run_at = iso(now()); return { heavy: true, wait: true }; }   // để tick sau
  const rows = await store.listUsage(iso(new Date(Date.UTC(now().getUTCFullYear(), now().getUTCMonth(), 1))));
  const q = checkQuota(rows, limits, 'image', now());
  if (!q.ok) { job.image_errors = [...errs, { slot: pend[0].path, msg: q.msg, code: q.code, stop: true }]; return toQa('Dừng tạo ảnh: ' + q.msg); }
  const slot = pend[0];
  try {
    const im = await withRetry(signal => prov.image.generateImage({ prompt: imagePrompt(slot.prompt), ratio: slot.ratio, signal }), { retries: 0, timeoutMs: Math.min(limits.imageTimeoutMs, 115000) });
    const cost = costOf({ model: im.usage.model, images: 1 }, prices);
    await store.addUsage({ at: iso(now()), task: 'image', kind: 'image', provider: prov.describe.image, model: im.usage.model || '', images: 1, cost_usd: cost, ok: true, job_id: job.id });
    job.cost_usd = Math.round(((Number(job.cost_usd) || 0) + (cost || 0)) * 10000) / 10000;
    const ext = im.mime === 'image/webp' ? 'webp' : im.mime === 'image/jpeg' ? 'jpg' : 'png';
    const path = `img/${uid()}-1600.${ext}`;
    await D.media.upload(path, im.bytes, im.mime);
    art = await draftOnly(store, job.article_id);                         // đọc lại: OWNER có thể đã sửa tay trong lúc chờ
    applyImage(art, slot.path, { path, path_sm: path, w: im.w || 1536, h: im.h || 1024, w_sm: im.w || 1536, og_path: '' });
    await store.updateArticle({ ...art, status: 'draft', reviewed_by_owner: false });
    job.images_done = (job.images_done || 0) + 1;
    log(job, `Đã tạo ảnh ${job.images_done}/${job.images_total || job.images_done}`, iso(now()));
  } catch (e) {
    if (e instanceof WorkerError) throw e;
    const code = e.code || 'server';
    await store.addUsage({ at: iso(now()), task: 'image', kind: 'image', provider: prov.describe.image, model: prov.describe.imageModel || '', images: 0, cost_usd: 0, ok: false, error: String(e.message).slice(0, 500), job_id: job.id });
    const stop = ['quota', 'budget', 'daily', 'daily-images', 'auth', 'config'].includes(code);
    job.image_errors = [...errs, { slot: slot.path, msg: String(e.message || e).slice(0, 300), code, stop, final: code === 'policy' }];
    log(job, `Ảnh lỗi (${code}): ${String(e.message || e).slice(0, 120)}`, iso(now()));
    if (stop) return toQa('');
    if (e.retryable) { job.next_run_at = later(now(), W.backoffSec[0]); return { heavy: true, wait: true }; }   // lỗi tạm thời: chờ rồi mới thử lại
  }
  job.next_run_at = iso(now());
  return { heavy: !prov.describe.mock };
}

// ---------------------------------------------------------------- bước: QA + thông báo
export function qaWithSources(art, job) {
  const q = qaArticle(art, { risk: job.risk || [] });
  const sc = job.source_check;
  if (sc && sc.summary) {
    if (sc.removed && sc.removed.length) q.warnings.push({ code: 'source-removed', msg: `Đã tự bỏ ${sc.removed.length} nguồn có link hỏng / không truy cập được: ${sc.removed.map(r => r.title).join('; ').slice(0, 300)}` });
    if (sc.summary.ok) q.passed.push(`Link nguồn mở được (${sc.summary.ok}) — CHƯA xác minh nội dung chuyên môn`);
  }
  q.score = Math.max(0, 100 - q.errors.length * 20 - q.warnings.length * 4);
  return q;
}
async function stepQa(D, job) {
  const art = await D.store.getArticle(job.article_id);
  if (!art) throw new WorkerError('missing', 'Bài nháp đã bị xóa.');
  const q = qaWithSources(art, job);
  job.qa = q; job.step = 'notify'; job.next_run_at = iso(D.now());
  log(job, q.ok ? 'Đạt kiểm tra chất lượng' : `Chờ kiểm tra: ${q.errors.length} lỗi cần xử lý`, iso(D.now()));
  return { heavy: false };
}
async function notifyOwner(D, job, kind) {
  try {
    const message = buildMessage(kind, job, { reviewBase: D.reviewBase });
    const res = await D.notify(message);
    await D.store.addNotification({ job_id: job.id, kind, channel: res.channel || 'none', status: res.status, message, detail: res.detail || '' });
    return res;
  } catch { return { status: 'failed' }; }                                // thông báo hỏng không làm hỏng bài
}
async function stepNotify(D, job) {
  const kind = job.qa && job.qa.ok ? 'awaiting_owner' : 'qa';
  const res = await notifyOwner(D, job, kind);
  job.status = kind; job.step = 'done'; job.next_run_at = null; job.step_attempts = 0; job.error = ''; job.error_code = '';
  log(job, kind === 'awaiting_owner' ? `Sẵn sàng chờ OWNER duyệt · thông báo: ${res.status}` : 'Cần OWNER xem lỗi kiểm tra chất lượng', iso(D.now()));
  return { heavy: false, finished: true };
}

// ---------------------------------------------------------------- một tick
async function runStep(D, job, elapsedMs) {
  switch (job.step) {
    case 'article': return submitText(D, job, 'article');
    case 'revise': return submitText(D, job, 'revise');
    case 'article_wait': case 'revise_wait': return pollText(D, job);
    case 'compose': return stepCompose(D, job);
    case 'sources': return stepSources(D, job);
    case 'images': return stepImages(D, job, elapsedMs);
    case 'qa': return stepQa(D, job);
    case 'notify': return stepNotify(D, job);
    default: throw new WorkerError('state', `Bước không hợp lệ: ${job.step}`);
  }
}

// deps: { store, prov, limits, prices, now, media, fetchUrl, notify, reviewBase, clock }
export async function tick(deps, { workerId = 'w-' + uid().slice(0, 8), maxSteps = W.maxStepsPerTick } = {}) {
  const now = deps.now || (() => new Date());
  const clock = deps.clock || (() => Date.now());
  const t0 = clock();
  const job = await deps.store.claimJob(workerId, W.leaseSec);
  if (!job) return { claimed: null, more: false, steps: [] };
  // Một đối tượng job duy nhất được sửa tại chỗ; lưu xong thì chép lại giá trị từ database (updated_at…).
  const save = async (patch = {}, opts) => { Object.assign(job, patch); Object.assign(job, await deps.store.saveJob({ ...job }, workerId, opts)); return job; };
  const D = { ...deps, now, save: () => save() };
  const steps = [];
  try {
    if ((job.run_count || 0) > W.maxRuns) throw new WorkerError('runaway', `Việc đã chạy ${job.run_count} lần — dừng để kiểm tra.`);
    job.status = 'generating';
    while (steps.length < maxSteps && ACTIVE.includes(job.status)) {
      if (job.next_run_at && new Date(job.next_run_at) > now()) break;
      const step = job.step;
      let r;
      try { r = await runStep(D, job, clock() - t0); job.step_attempts = 0; if (!r.wait) { job.error = ''; job.error_code = ''; } }
      catch (e) {
        const code = (e && e.code) || 'server';
        const retryable = !!(e && e.retryable) && !STOP.includes(code);
        job.step_attempts = (job.step_attempts || 0) + 1;
        if (!retryable || job.step_attempts >= W.maxStepAttempts) throw e;
        job.next_run_at = later(now(), W.backoffSec[Math.min(job.step_attempts - 1, W.backoffSec.length - 1)]);
        job.error = `Lỗi tạm thời ở bước "${step}" (lần ${job.step_attempts}/${W.maxStepAttempts}): ${String(e.message).slice(0, 300)} — sẽ tự thử lại.`;
        job.error_code = code;
        log(job, job.error, iso(now()));
        r = { heavy: true, wait: true };
      }
      steps.push(step);
      await save({ lock_owner: workerId });                                // lưu tiến độ sau MỖI bước
      if (r.finished || r.heavy || r.wait || clock() - t0 > W.budgetMs) break;
    }
  } catch (e) {
    if (e && e.code === 'lost-lock') return { claimed: job.id, more: false, steps, status: 'lost-lock' };   // OWNER đã bỏ / đổi việc
    const code = (e && e.code) || 'server';
    job.status = 'failed'; job.error = String((e && e.message) || e).slice(0, 1900); job.error_code = code; job.next_run_at = null;
    log(job, `Dừng ở bước "${job.step}": ${job.error.slice(0, 200)}`, iso(now()));
    steps.push('failed');
    try { await notifyOwner(D, job, 'failed'); } catch { /* bỏ qua */ }
  }
  // thả khóa (điều kiện: vẫn là chủ khóa — nếu OWNER đã bỏ việc, store từ chối và giữ nguyên lựa chọn của OWNER)
  try { await save({ lock_until: null, lock_owner: null }, { release: true }); }
  catch (e) { if (!(e && e.code === 'lost-lock')) throw e; return { claimed: job.id, more: false, steps, status: 'lost-lock' }; }
  return { claimed: job.id, steps, status: job.status, step: job.step, more: ACTIVE.includes(job.status), nextRunAt: job.next_run_at || null };
}

// ---------------------------------------------------------------- lịch tạo bài tự động (MẶC ĐỊNH TẮT)
// Chỉ chạy khi: settings.auto_enabled = true VÀ đã đặt ngân sách tháng VÀ (provider thật) có bảng giá model.
// Mỗi ngày (giờ Việt Nam) tạo tối đa auto_per_day việc "auto"; AI KHÔNG xuất bản — bài vẫn chờ OWNER duyệt.
export function vnDayStart(now) { const vn = new Date(now.getTime() + 7 * 3600e3); return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - 7 * 3600e3); }
export async function autoPlan(deps) {
  const { store, prov, limits, prices } = deps; const now = deps.now || (() => new Date());
  const s = await store.getSettings();
  if (!s || !s.auto_enabled) return { skipped: 'off' };
  if (!(Number(s.monthly_budget_usd) > 0)) return { skipped: 'no-budget' };
  if (!prov.describe.mock && !(prices && prices[prov.describe.textModel])) return { skipped: 'no-prices' };
  const vnHour = (now().getUTCHours() + 7) % 24;
  if (vnHour < (Number(s.auto_hour) || 0)) return { skipped: 'not-yet' };
  const jobs = await store.listJobs();
  const since = vnDayStart(now()).getTime();
  const autoToday = jobs.filter(j => j.origin === 'auto' && new Date(j.created_at).getTime() >= since).length;
  if (autoToday >= (Number(s.auto_per_day) || 0)) return { skipped: 'done-today', autoToday };
  if (jobs.some(j => j.origin === 'auto' && ACTIVE.includes(j.status))) return { skipped: 'busy' };
  const lim = { ...limits, monthlyBudgetUsd: Math.min(limits.monthlyBudgetUsd, Number(s.monthly_budget_usd)) };
  const rows = await store.listUsage(iso(new Date(Date.UTC(now().getUTCFullYear(), now().getUTCMonth(), 1))));
  const q = checkQuota(rows, lim, 'article', now());
  if (!q.ok) return { skipped: q.code, msg: q.msg };
  const arts = await store.listArticles();
  const titles = [...arts.map(a => ({ title: a.title, kind: 'bài viết' })), ...GUIDES.map(g => ({ title: g.title, kind: 'Cẩm nang' })),
    ...jobs.filter(j => !['rejected', 'failed'].includes(j.status)).map(j => ({ title: j.title, kind: 'đang trong Xưởng' }))];
  const groups = Array.isArray(s.auto_groups) && s.auto_groups.length ? s.auto_groups : [];
  const r = await withRetry(signal => prov.text.generateJSON({ system: SYSTEM, user: suggestPrompt({ groups, existingTitles: titles.map(t => t.title), count: 6 }), schema: SUGGEST_SCHEMA, maxOutputTokens: 2000, meta: { task: 'suggest', groups, count: 6 }, signal }), { retries: 0, timeoutMs: 60000 });
  await store.addUsage({ at: iso(now()), task: 'suggest', kind: 'text', provider: prov.describe.text, model: r.usage.model || '', tokens_in: r.usage.tokensIn || 0, tokens_out: r.usage.tokensOut || 0,
    cost_usd: costOf({ model: r.usage.model, tokensIn: r.usage.tokensIn, tokensOut: r.usage.tokensOut }, prices), ok: true, job_id: null });
  const ideas = (r.json && Array.isArray(r.json.ideas) ? r.json.ideas : []).filter(i => i && i.title);
  const pick = ideas.find(i => dupCheck(i.title, titles).level !== 'trung');
  if (!pick) return { skipped: 'no-new-idea' };
  const seed = IDEAS.find(x => x.title === pick.title);
  const job = await store.insertJob(newJob({ title: pick.title, group: pick.group, angle: pick.angle, risk: seed ? seed.risk : [] }, { origin: 'auto', now: now() }));
  return { created: job.id, title: job.title };
}

// ---------------------------------------------------------------- thao tác của OWNER (trình duyệt) → đưa việc vào hàng đợi
export function newJob(idea, { origin = 'owner', now = new Date() } = {}) {
  const at = iso(now);
  return { id: uid(), status: 'queued', step: 'article', origin, title: String(idea.title).slice(0, 200), grp: idea.group || 'nguoi-moi', angle: String(idea.angle || '').slice(0, 500),
    notes: String(idea.notes || '').slice(0, 20000), risk: idea.risk || [], attempts: 0, step_attempts: 0, run_count: 0, lock_until: null, lock_owner: null, next_run_at: at,
    article_id: null, pkg: null, pkg_warnings: [], qa: null, provider: {}, images_total: 0, images_done: 0, image_errors: [], source_check: null, ai_handle: null,
    owner_note: '', error: '', error_code: '', cost_usd: 0, history: [{ at, msg: origin === 'auto' ? 'Lịch tự động tạo việc' : 'OWNER tạo việc' }], created_at: at, updated_at: at };
}
export function enqueueNew(titles, idea, { force = false, now = new Date() } = {}) {
  const d = dupCheck(idea.title, titles);
  if (d.level === 'trung' && !force) throw new WorkerError('duplicate', `Trùng với ${d.with.kind} "${d.with.title}" (độ giống ${Math.round(d.score * 100)}%).`);
  const job = newJob(idea, { now });
  if (d.level === 'gan-trung') job.history[0].msg += ` (gần trùng "${d.with.title}")`;
  return job;
}
// "Chạy tiếp" sau lỗi / tạo ảnh còn thiếu / AI sửa theo góp ý → về hàng đợi, GIỮ tiến độ đã có.
export function requeue(job, { mode = 'resume', now = new Date() } = {}) {
  if (['published', 'rejected'].includes(job.status)) throw new WorkerError('closed', 'Việc này đã đóng.');
  if (ACTIVE.includes(job.status) && job.lock_until && new Date(job.lock_until) > now) throw new WorkerError('locked', 'Việc đang được máy chủ xử lý.');
  const j = { ...job, status: 'queued', next_run_at: iso(now), step_attempts: 0, error: '', error_code: '', lock_until: null, lock_owner: null };
  if (mode === 'revise') {
    if (job.status !== 'needs_changes' || !job.owner_note) throw new WorkerError('state', 'Chỉ sửa được khi bài đang "Cần sửa" và có góp ý.');
    if ((job.attempts || 0) >= W.maxArticleAttempts + 2) throw new WorkerError('attempts', 'Đã sửa quá nhiều lần — hãy sửa tay trong trình soạn.');
    j.step = 'revise';
  } else if (mode === 'images') { j.step = 'images'; j.image_errors = []; }
  else if (j.step === 'done') j.step = 'qa';
  else if (j.step === 'article' && (job.attempts || 0) >= W.maxArticleAttempts) j.attempts = W.maxArticleAttempts - 1;   // cho thêm 1 lần sau khi OWNER xem lỗi
  j.history = [...(job.history || []), { at: iso(now), msg: mode === 'revise' ? 'OWNER yêu cầu AI sửa' : mode === 'images' ? 'OWNER yêu cầu tạo ảnh còn thiếu' : 'OWNER cho chạy tiếp' }].slice(-60);
  return j;
}
