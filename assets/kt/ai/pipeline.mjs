// Phase 1S — điều phối Xưởng nội dung: Đề xuất → Đang tạo → Chờ kiểm tra → Chờ OWNER duyệt → (Cần sửa → …) → Đã xuất bản.
// Mỗi bước lưu trạng thái (job.step) → lỗi giữa chừng (AI, ảnh, mạng) chạy tiếp được, KHÔNG mất bài.
// Pipeline KHÔNG BAO GIỜ xuất bản và KHÔNG ghi vào bài không còn ở trạng thái nháp.
// Phụ thuộc được truyền vào (deps) để chạy được ở trình duyệt, Node test, hay nơi khác:
//   ai:    { suggest(p), article(p), revise(p), image(p) }          — gọi qua Edge Function kt-ai (hoặc mock)
//   store: { listArticles(), getArticle(id), saveArticle(row), listJobs(), getJob(id), saveJob(job), addVersion(v), listVersions(articleId) }
//   media: { fromBytes(bytes, mime, { withOg, focus }) → { path, path_sm, w, h, w_sm, og_path? } } — nén WebP + tải lên Storage
import { validatePackage } from './package.mjs';
import { composeArticle, applyImage, pendingSlots } from './compose.mjs';
import { qaArticle } from './qa.mjs';
import { dupCheck } from './text.mjs';
import { GUIDES, IDEAS } from './taxonomy.mjs';

export const STATUS = { proposed: 'Đề xuất', generating: 'Đang tạo', qa: 'Chờ kiểm tra', awaiting_owner: 'Chờ OWNER duyệt', needs_changes: 'Cần sửa', published: 'Đã xuất bản', failed: 'Lỗi', rejected: 'Đã bỏ' };
export const MAX_ATTEMPTS = 3;
export const LOCK_MS = 5 * 60 * 1000;
const STOP_IMAGE = ['quota', 'budget', 'daily', 'daily-images', 'auth', 'config'];
const uid = () => globalThis.crypto.randomUUID();
const clone = o => JSON.parse(JSON.stringify(o));

export class PipelineError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

async function pool(store) {
  const [arts, jobs] = await Promise.all([store.listArticles(), store.listJobs()]);
  return {
    arts, jobs,
    titles: [...arts.map(a => ({ title: a.title, slug: a.slug, kind: 'bài viết' })), ...GUIDES.map(g => ({ title: g.title, kind: 'Cẩm nang' })),
      ...jobs.filter(j => !['rejected', 'failed'].includes(j.status)).map(j => ({ title: j.title, kind: 'đang trong Xưởng' }))]
  };
}
const log = (job, msg, at) => { job.history = [...(job.history || []), { at, msg }].slice(-60); };

// ---------- đề xuất chủ đề ----------
export async function suggestIdeas(deps, { groups = [], count = 8 } = {}) {
  const { titles } = await pool(deps.store);
  const res = await deps.ai.suggest({ groups, count, existingTitles: titles.map(t => t.title) });
  const ideas = (res && res.json && Array.isArray(res.json.ideas) ? res.json.ideas : []).slice(0, 20);
  return ideas.map(i => {
    const d = dupCheck(i.title, titles);
    const seed = IDEAS.find(x => x.title === i.title);
    return { title: String(i.title || '').slice(0, 200), group: i.group, angle: String(i.angle || '').slice(0, 500), why: String(i.why || '').slice(0, 300), risk: seed ? seed.risk : [], dup: d };
  }).filter(i => i.title);
}

// ---------- tạo việc (chống trùng) ----------
export async function createJob(deps, idea, { force = false } = {}) {
  const { titles } = await pool(deps.store);
  const d = dupCheck(idea.title, titles);
  if (d.level === 'trung' && !force) throw new PipelineError('duplicate', `Trùng với ${d.with.kind} "${d.with.title}" (độ giống ${Math.round(d.score * 100)}%).`);
  const now = deps.now().toISOString();
  const job = { id: uid(), status: 'proposed', title: String(idea.title).slice(0, 200), grp: idea.group || 'nguoi-moi', angle: idea.angle || '', notes: idea.notes || '',
    risk: idea.risk || [], step: 'article', attempts: 0, lock_until: null, article_id: null, pkg: null, pkg_warnings: [], qa: null, provider: {},
    images_total: 0, images_done: 0, image_errors: [], owner_note: '', error: '', history: [], created_at: now, updated_at: now };
  log(job, d.level === 'gan-trung' ? `Tạo việc (gần trùng "${d.with.title}")` : 'Tạo việc', now);
  return deps.store.saveJob(job);
}

async function draftOnly(store, id) {
  const art = await store.getArticle(id);
  if (!art) throw new PipelineError('missing', 'Bài nháp đã bị xóa.');
  if (art.status !== 'draft') throw new PipelineError('not-draft', `Bài đang ở trạng thái "${art.status}" — Xưởng chỉ được sửa bài nháp.`);
  return art;
}
const snapshot = a => { const s = clone(a); delete s.id; delete s.created_at; delete s.updated_at; return s; };

// ---------- chạy / chạy tiếp ----------
export async function runJob(deps, jobId, { onProgress = () => {}, maxImages = 8 } = {}) {
  const { store, ai, media } = deps;
  let job = await store.getJob(jobId);
  if (!job) throw new PipelineError('missing', 'Không tìm thấy việc.');
  if (['published', 'rejected'].includes(job.status)) throw new PipelineError('closed', 'Việc này đã đóng.');
  if (job.status === 'needs_changes') throw new PipelineError('needs-revise', 'Bài đang chờ sửa theo góp ý — dùng "AI sửa theo góp ý".');
  const now = () => deps.now();
  if (job.lock_until && new Date(job.lock_until) > now()) throw new PipelineError('locked', 'Việc đang chạy ở nơi khác, đợi vài phút.');
  const save = async patch => { job = await store.saveJob({ ...job, ...patch, updated_at: now().toISOString() }); return job; };
  await save({ status: 'generating', lock_until: new Date(now().getTime() + LOCK_MS).toISOString(), error: '' });
  try {
    if (job.step === 'article') {
      if (job.attempts >= MAX_ATTEMPTS) throw new PipelineError('attempts', `Đã thử tạo bài ${job.attempts} lần — dừng để tránh tốn chi phí. Sửa chủ đề hoặc tạo việc mới.`);
      onProgress('Đang viết bài…');
      const { arts } = await pool(store);
      await save({ attempts: job.attempts + 1 });
      const res = await ai.article({ title: job.title, group: job.grp, angle: job.angle, notes: job.notes, risk: job.risk, existingTitles: arts.map(a => a.title) });
      const v = validatePackage(res.json);
      if (!v.ok) throw new PipelineError('invalid', 'Gói bài AI không hợp lệ: ' + v.errors.join(' '));
      log(job, `Đã viết bài (${(res.provider && res.provider.text) || 'ai'})`, now().toISOString());
      await save({ pkg: v.value, pkg_warnings: v.warnings, provider: res.provider || {}, step: 'compose' });
    }
    if (job.step === 'compose') {
      onProgress('Đang dàn trang…');
      const { arts } = await pool(store);
      const { article, slots } = composeArticle(job.pkg, { existing: arts });
      const saved = await store.saveArticle({ ...article, status: 'draft', reviewed_by_owner: false });
      await store.addVersion({ article_id: saved.id, author: 'ai', note: 'Bản AI đầu tiên', snapshot: snapshot(saved) });
      log(job, `Đã lưu nháp "${saved.slug}"`, now().toISOString());
      await save({ article_id: saved.id, images_total: Math.min(slots.length, maxImages), images_done: 0, image_errors: [], step: 'images' });
    }
    if (job.step === 'images') {
      let art = await draftOnly(store, job.article_id);
      const pend = pendingSlots(art).slice(0, Math.max(0, maxImages - job.images_done));
      const errs = [];
      for (const [k, slot] of pend.entries()) {
        onProgress(`Đang tạo ảnh ${k + 1}/${pend.length}…`);
        try {
          const im = await ai.image({ prompt: slot.prompt, ratio: slot.ratio });
          const cur = slot.path === 'cover' ? art.cover : null;
          const fields = await media.fromBytes(im.bytes, im.mime, { withOg: slot.path === 'cover', focus: (cur && cur.focus) || { x: 50, y: 50 } });
          art = await draftOnly(store, job.article_id);              // đọc lại: OWNER có thể đã sửa tay trong lúc chờ
          applyImage(art, slot.path, fields);
          art = await store.saveArticle({ ...art, status: 'draft' });
          await save({ images_done: job.images_done + 1 });
        } catch (e) {
          if (e instanceof PipelineError) throw e;
          errs.push({ slot: slot.path, msg: e.message || String(e), code: e.code || '' });
          if (STOP_IMAGE.includes(e.code)) break;                     // hết hạn mức / khóa sai → dừng, giữ bài
        }
      }
      if (errs.length) log(job, `${errs.length} ảnh chưa tạo được`, now().toISOString());
      await save({ image_errors: errs, step: 'qa' });
    }
    if (job.step === 'qa' || job.step === 'done') {
      onProgress('Đang kiểm tra chất lượng…');
      const art = await store.getArticle(job.article_id);
      const q = qaArticle(art, { risk: job.risk });
      await save({ qa: q, step: 'done', status: q.ok ? 'awaiting_owner' : 'qa', lock_until: null });
      log(job, q.ok ? 'Sẵn sàng chờ OWNER duyệt' : `Chờ kiểm tra: ${q.errors.length} lỗi cần xử lý`, now().toISOString());
      job = await store.saveJob(job);
    }
    return job;
  } catch (e) {
    await save({ status: 'failed', error: (e && e.message) || String(e), lock_until: null });
    throw e;
  }
}

// ---------- OWNER yêu cầu chỉnh sửa → ghi phiên bản + ghi chú ----------
export async function requestChanges(deps, jobId, note) {
  const job = await deps.store.getJob(jobId);
  if (!job || !job.article_id) throw new PipelineError('missing', 'Không tìm thấy bài.');
  note = String(note || '').trim().slice(0, 4000);
  if (note.length < 5) throw new PipelineError('note', 'Hãy ghi rõ cần sửa gì (ít nhất vài chữ).');
  const art = await draftOnly(deps.store, job.article_id);
  await deps.store.addVersion({ article_id: art.id, author: 'owner', note: `Yêu cầu sửa: ${note}`, snapshot: snapshot(art) });
  const now = deps.now().toISOString();
  log(job, `OWNER yêu cầu sửa: ${note.slice(0, 120)}`, now);
  return deps.store.saveJob({ ...job, status: 'needs_changes', owner_note: note, updated_at: now });
}

// ---------- AI sửa theo góp ý (giữ id, slug và ảnh cũ nếu mô tả ảnh không đổi) ----------
export async function reviseJob(deps, jobId, opts = {}) {
  const { store, ai } = deps;
  let job = await store.getJob(jobId);
  if (!job || job.status !== 'needs_changes' || !job.owner_note) throw new PipelineError('state', 'Chỉ sửa được khi bài đang "Cần sửa" và có góp ý.');
  if (job.attempts >= MAX_ATTEMPTS + 2) throw new PipelineError('attempts', 'Đã sửa quá nhiều lần — hãy sửa tay trong trình soạn.');
  const art = await draftOnly(store, job.article_id);
  const res = await ai.revise({ pkg: job.pkg, note: job.owner_note });
  const v = validatePackage(res.json);
  if (!v.ok) throw new PipelineError('invalid', 'Bản sửa của AI không hợp lệ: ' + v.errors.join(' '));
  const { arts } = await pool(store);
  const { article } = composeArticle(v.value, { existing: arts.filter(a => a.id !== art.id) });
  const old = new Map();                                                     // prompt → ảnh đã có
  const collect = im => { if (im && im.prompt && im.path) old.set(im.prompt, im); };
  collect(art.cover); (art.blocks || []).forEach(b => { if (b) { collect(b.img); (b.imgs || []).forEach(collect); } });
  const reuse = im => { const o = im && im.prompt && old.get(im.prompt); if (o) Object.assign(im, { path: o.path, path_sm: o.path_sm, w: o.w, h: o.h, w_sm: o.w_sm, og_path: o.og_path, focus: o.focus }); };
  reuse(article.cover); article.blocks.forEach(b => { reuse(b.img); (b.imgs || []).forEach(reuse); });
  const saved = await store.saveArticle({ ...article, id: art.id, slug: art.slug, status: 'draft', reviewed_by_owner: false });
  await store.addVersion({ article_id: saved.id, author: 'ai', note: `AI sửa theo góp ý: ${job.owner_note.slice(0, 200)}`, snapshot: snapshot(saved) });
  const now = deps.now().toISOString();
  log(job, 'AI đã sửa theo góp ý', now);
  job = await store.saveJob({ ...job, pkg: v.value, pkg_warnings: v.warnings, attempts: job.attempts + 1, status: 'qa', step: 'images', owner_note: '', updated_at: now });
  return runJob(deps, job.id, opts);
}

// ---------- khôi phục phiên bản cũ (luôn về nháp) ----------
export async function restoreVersion(deps, articleId, version) {
  const vs = await deps.store.listVersions(articleId);
  const v = vs.find(x => x.version === version);
  if (!v) throw new PipelineError('missing', 'Không tìm thấy phiên bản.');
  const cur = await draftOnly(deps.store, articleId);
  const saved = await deps.store.saveArticle({ ...v.snapshot, id: articleId, slug: cur.slug, status: 'draft', reviewed_by_owner: false });
  await deps.store.addVersion({ article_id: articleId, author: 'owner', note: `Khôi phục phiên bản ${version}`, snapshot: snapshot(saved) });
  return saved;
}

// ---------- đồng bộ sau khi OWNER xuất bản / ẩn bài trong trình soạn ----------
export async function syncJob(deps, job) {
  if (!job.article_id) return job;
  const art = await deps.store.getArticle(job.article_id);
  let status = job.status;
  if (!art) status = 'rejected';
  else if (art.status === 'published') status = 'published';
  else if (job.status === 'published') status = 'awaiting_owner';
  return status === job.status ? job : deps.store.saveJob({ ...job, status, updated_at: deps.now().toISOString() });
}
export async function rejectJob(deps, jobId) {
  const job = await deps.store.getJob(jobId);
  if (!job) throw new PipelineError('missing', 'Không tìm thấy việc.');
  return deps.store.saveJob({ ...job, status: 'rejected', lock_until: null, updated_at: deps.now().toISOString() });
}
