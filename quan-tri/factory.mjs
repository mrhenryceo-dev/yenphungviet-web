// Phase 1S — giao diện "Xưởng nội dung AI" trong /quan-tri/ (chỉ OWNER).
//   #ai             → bảng điều khiển: bài chờ duyệt, việc đang xử lý, đề xuất chủ đề, lịch tự động, thông báo
//   #duyet/<jobId>  → trang duyệt: xem bài y như khách (điện thoại / máy tính), QA, kiểm tra link nguồn, ghi chú biên tập,
//                     phiên bản, [Duyệt xuất bản] (chỉ trên website chính thức) · [Yêu cầu chỉnh sửa] · [Sửa tay]
// Giai đoạn B: trình duyệt CHỈ đưa việc vào hàng đợi (kt_ai_jobs) rồi đánh thức máy chạy việc (Edge Function kt-ai, "kick").
// Viết bài, tạo ảnh, kiểm tra link, QA, thông báo đều chạy PHÍA MÁY CHỦ — OWNER đóng trình duyệt thì việc vẫn tiếp tục.
// Chế độ thử local (?dev=1): cùng mã máy chạy việc (worker.mjs) chạy trong trình duyệt với mock + dữ liệu localStorage.
import * as P from '/assets/kt/ai/pipeline.mjs';
import * as WK from '/assets/kt/ai/worker.mjs';
import { GROUPS, GUIDES, groupById } from '/assets/kt/ai/taxonomy.mjs';
import { applyImage, pendingSlots } from '/assets/kt/ai/compose.mjs';
import { SAMPLES, SAMPLE_COVERS } from '/assets/kt/ai/mock-data.mjs';
import { createProviders } from '/assets/kt/ai/providers.mjs';
import { readLimits } from '/assets/kt/ai/limits.mjs';
import { STATE_LABEL } from '/assets/kt/ai/sources.mjs';
import { renderPreviewPage } from '/assets/kt/render.mjs';
import { fitScale } from '/quan-tri/fit.mjs';

let C = null;   // ngữ cảnh từ admin.mjs
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const BADGE = { proposed: 'draft', queued: 'draft', generating: 'draft', qa: 'hidden', awaiting_owner: 'published', needs_changes: 'hidden', published: 'published', failed: 'hidden', rejected: 'draft' };
const STEP_LABEL = { article: 'Đang viết bài', article_wait: 'Chờ AI viết xong', revise: 'Đang sửa theo góp ý', revise_wait: 'Chờ AI sửa xong', compose: 'Đang dàn trang',
  sources: 'Đang kiểm tra link nguồn', images: 'Đang tạo ảnh', qa: 'Đang kiểm tra chất lượng', notify: 'Đang gửi thông báo', done: 'Xong' };
const SETTINGS_DEFAULT = { id: 1, auto_enabled: false, auto_per_day: 1, auto_hour: 7, auto_groups: [], monthly_budget_usd: null };
let refreshTimer = null;

// ---------- kho dữ liệu ----------
const LS = { jobs: 'kt_dev_ai_jobs', vers: 'kt_dev_ai_versions', usage: 'kt_dev_ai_usage', notes: 'kt_dev_ai_notes', settings: 'kt_dev_ai_settings' };
const lsGet = (k, d = []) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch { return d; } };
const lsPut = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const strip = j => { const r = { ...j }; delete r.created_at; delete r.updated_at; return r; };

// Phía OWNER (trình duyệt). Mọi lần OWNER lưu việc → database tự thả khóa máy chủ (trigger kt_r3).
function makeStore() {
  const art = C.store;
  const base = { listArticles: () => art.all(), getArticle: id => art.get(id), saveArticle: async row => art.save(strip(row)) };
  if (C.DEV) {
    const W = devWorkerStore();
    return { ...base, listJobs: W.listJobs, getJob: W.getJob, insertJob: W.insertJob, saveJob: async j => W.ownerSave(j),
      addVersion: async v => { const vs = await W.listVersions(v.article_id); return W.addVersion({ ...v, version: vs.length + 1 }); },
      listVersions: async id => (await W.listVersions(id)).sort((a, b) => a.version - b.version),
      getSettings: W.getSettings, saveSettings: async s => { lsPut(LS.settings, { ...SETTINGS_DEFAULT, ...s }); return s; },
      listNotifications: async () => lsGet(LS.notes).slice(-8).reverse() };
  }
  const sb = C.sb();
  const q = async p => { const { data, error } = await p; if (error) throw error; return data; };
  return {
    ...base,
    listJobs: () => q(sb.from('kt_ai_jobs').select('*').order('updated_at', { ascending: false })),
    getJob: async id => (await q(sb.from('kt_ai_jobs').select('*').eq('id', id).limit(1)))[0] || null,
    insertJob: j => q(sb.from('kt_ai_jobs').insert(strip(j)).select('*').single()),
    saveJob: j => q(sb.from('kt_ai_jobs').update(strip(j)).eq('id', j.id).select('*').single()),
    async addVersion(v) {
      const last = await q(sb.from('kt_article_versions').select('version').eq('article_id', v.article_id).order('version', { ascending: false }).limit(1));
      return q(sb.from('kt_article_versions').insert({ ...v, version: ((last[0] && last[0].version) || 0) + 1 }).select('*').single());
    },
    listVersions: id => q(sb.from('kt_article_versions').select('*').eq('article_id', id).order('version', { ascending: true })),
    getSettings: async () => (await q(sb.from('kt_ai_settings').select('*').eq('id', 1).limit(1)))[0] || null,
    saveSettings: s => q(sb.from('kt_ai_settings').update({ auto_enabled: s.auto_enabled, auto_per_day: s.auto_per_day, auto_hour: s.auto_hour, auto_groups: s.auto_groups, monthly_budget_usd: s.monthly_budget_usd }).eq('id', 1).select('*').single()),
    listNotifications: () => q(sb.from('kt_ai_notifications').select('*').order('created_at', { ascending: false }).limit(8))
  };
}

// Chế độ thử: kho cho máy chạy việc mô phỏng — cùng ngữ nghĩa kt_r3 (khóa thuê, chỉ ghi nháp).
function devWorkerStore() {
  const jobs = () => lsGet(LS.jobs), put = l => lsPut(LS.jobs, l);
  const nowIso = () => new Date().toISOString();
  const upd = (id, fn) => { const l = jobs(); const i = l.findIndex(x => x.id === id); if (i < 0) return null; l[i] = fn(l[i]); l[i].updated_at = nowIso(); put(l); return l[i]; };
  return {
    async claimJob(w, lease) {
      const now = Date.now();
      const due = jobs().filter(j => WK.ACTIVE.includes(j.status) && (!j.next_run_at || Date.parse(j.next_run_at) <= now) && (!j.lock_until || Date.parse(j.lock_until) < now))
        .sort((a, b) => String(a.next_run_at).localeCompare(String(b.next_run_at)))[0];
      return due ? upd(due.id, j => ({ ...j, lock_owner: w, lock_until: new Date(now + lease * 1000).toISOString(), run_count: (j.run_count || 0) + 1, status: 'generating' })) : null;
    },
    async saveJob(job, w) {
      const cur = jobs().find(x => x.id === job.id);
      if (!cur || cur.lock_owner !== w) throw new WK.WorkerError('lost-lock', 'Việc đã được OWNER thay đổi.');
      return upd(job.id, () => ({ ...job }));
    },
    async ownerSave(job) {
      const l = jobs(); const i = l.findIndex(x => x.id === job.id); const row = { ...job, lock_owner: null, lock_until: null, updated_at: nowIso() };
      i >= 0 ? (l[i] = row) : l.push(row); put(l); return row;
    },
    async insertJob(job) { const row = { ...job, lock_owner: null, lock_until: null, created_at: nowIso(), updated_at: nowIso() }; put([...jobs(), row]); return row; },
    async getJob(id) { return jobs().find(j => j.id === id) || null; },
    async listJobs() { return jobs().sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))); },
    async nextActiveDue() { return jobs().filter(j => WK.ACTIVE.includes(j.status)).map(j => j.next_run_at).sort()[0] || null; },
    async listArticles() { return (await C.store.all()).map(a => ({ id: a.id, slug: a.slug, title: a.title, status: a.status })); },
    getArticle: id => C.store.get(id),
    async insertArticle(row) { return C.store.save({ ...strip(row), id: undefined, status: 'draft', reviewed_by_owner: false }); },
    async updateArticle(row) {
      const cur = await C.store.get(row.id);
      if (!cur || cur.status !== 'draft') throw new WK.WorkerError('not-draft', 'Bài không còn là nháp — Xưởng dừng, không sửa.');
      return C.store.save({ ...strip(row), status: 'draft', reviewed_by_owner: false });
    },
    async listVersions(id) { return lsGet(LS.vers).filter(v => v.article_id === id); },
    async addVersion(v) { const r = { ...v, id: crypto.randomUUID(), created_at: nowIso() }; lsPut(LS.vers, [...lsGet(LS.vers), r]); return r; },
    async listUsage(since) { return lsGet(LS.usage).filter(u => u.at >= since); },
    async addUsage(r) { lsPut(LS.usage, [...lsGet(LS.usage), r].slice(-500)); },
    async addNotification(x) { lsPut(LS.notes, [...lsGet(LS.notes), { ...x, id: crypto.randomUUID(), created_at: nowIso() }].slice(-50)); },
    async getSettings() { return { ...SETTINGS_DEFAULT, ...lsGet(LS.settings, {}) }; }
  };
}
// Chế độ thử: máy chạy việc mô phỏng trong trình duyệt (mock AI, ảnh giữ chỗ, kiểm tra link qua dev-server).
async function runDevWorker(onProgress = () => {}) {
  const store = devWorkerStore();
  const devFetch = async (url, o) => {
    const r = await fetch('/__dev-urlcheck', { method: 'POST', body: JSON.stringify({ url, method: o.method }) });
    const j = await r.json().catch(() => ({}));
    if (j.error === 'timeout') { const e = new Error('timeout'); e.name = 'AbortError'; throw e; }
    if (!r.ok || j.error) throw new TypeError('fetch failed');
    return { status: j.status, headers: { get: k => (k === 'location' ? j.location : null) }, body: null };
  };
  const deps = { store, prov: createProviders({}), limits: readLimits({}), prices: {}, now: () => new Date(), reviewBase: location.origin,
    media: { upload: (path, bytes, mime) => C.media.upload([{ path, blob: new Blob([bytes], { type: mime }) }]) },
    fetchUrl: devFetch, notify: async () => ({ status: 'dry_run', channel: 'none', detail: 'Chế độ thử local: không gửi.' }) };
  for (let i = 0; i < 40; i++) {
    const r = await WK.tick(deps, { workerId: 'dev-browser' });
    if (r.claimed) { onProgress(`Máy chạy việc (mô phỏng): ${(r.steps || []).map(s => STEP_LABEL[s] || s).join(' → ')}`); continue; }
    const due = await store.nextActiveDue(); if (!due) break;
    await new Promise(res => setTimeout(res, Math.min(3000, Math.max(200, Date.parse(due) - Date.now()))));
  }
}

// ---------- gọi Edge Function ----------
async function callFn(action, payload = {}) {
  let url, headers = { 'Content-Type': 'application/json' };
  if (C.DEV) url = '/__dev-fn/kt-ai';
  else {
    const { data } = await C.sb().auth.getSession();
    if (!data.session) throw Object.assign(new Error('Phiên đăng nhập đã hết — đăng nhập lại.'), { code: 'auth' });
    url = `${C.KT.supabaseUrl}/functions/v1/kt-ai`; headers = { ...headers, Authorization: `Bearer ${data.session.access_token}`, apikey: C.KT.supabaseAnonKey };
  }
  let r;
  try { r = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ action, ...payload }) }); }
  catch { throw Object.assign(new Error('Không kết nối được Xưởng nội dung (Edge Function kt-ai chưa triển khai hoặc mất mạng).'), { code: 'network' }); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `Lỗi ${r.status}`), { code: j.code || String(r.status) });
  return j;
}
// Đánh thức máy chạy việc. Thật: Edge Function trả 202 ngay, chạy nền. Thử local: chạy mô phỏng trong trình duyệt.
async function wake(progress) {
  if (C.DEV) return runDevWorker(progress);
  try { const r = await callFn('kick'); C.toast(r.message || 'Đã giao việc cho máy chủ.', 6000); }
  catch (e) { C.toast(`Việc đã vào hàng đợi nhưng chưa đánh thức được máy chủ: ${e.message}`, 9000); }
}
const ai = { suggest: async p => ({ json: { ideas: (await callFn('suggest', p)).ideas || [] } }) };
const deps = () => ({ store: makeStore(), ai, now: () => new Date() });
const poolTitles = async D => {
  const [arts, jobs] = await Promise.all([D.store.listArticles(), D.store.listJobs()]);
  return [...arts.map(a => ({ title: a.title, kind: 'bài viết' })), ...GUIDES.map(g => ({ title: g.title, kind: 'Cẩm nang' })),
    ...jobs.filter(j => !['rejected', 'failed'].includes(j.status)).map(j => ({ title: j.title, kind: 'đang trong Xưởng' }))];
};

// ---------- tiện ích hiển thị ----------
const esc = s => C.esc(s);
const fmt = iso => (iso ? new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '');
const badge = s => `<span class="qt-badge qt-badge--${BADGE[s] || 'draft'}">${esc(P.STATUS[s] || s)}</span>`;
function setupHint(e) {
  const m = (e && e.message) || String(e);
  if (/kt_ai_settings|kt_ai_notifications|next_run_at|lock_owner|source_check/i.test(m)) return 'Xưởng nội dung cần chạy migration <code>supabase/kt_r3_worker_migration.sql</code> (chờ OWNER duyệt).';
  if (/kt_ai_jobs|kt_article_versions|PGRST205|42P01|schema cache/i.test(m)) return 'Xưởng nội dung cần chạy migration <code>supabase/kt_r2_ai_migration.sql</code> rồi <code>kt_r3_worker_migration.sql</code> (chờ OWNER duyệt). Trình soạn bài thủ công vẫn dùng bình thường.';
  return esc(m);
}
async function busy(label, fn) {
  const box = $('#qt-ai-busy'); if (box) { box.hidden = false; box.textContent = label; }
  try { return await fn(t => { if (box) box.textContent = t; }); }
  finally { if (box) box.hidden = true; }
}
function progressOf(j) {
  if (!WK.ACTIVE.includes(j.status)) return '';
  const step = j.step === 'images' && j.images_total ? `Đang tạo ảnh ${j.images_done || 0}/${j.images_total}` : (STEP_LABEL[j.step] || j.step);
  const wait = j.next_run_at && Date.parse(j.next_run_at) > Date.now() + 5000 ? ` · chạy lại lúc ${fmt(j.next_run_at)}` : '';
  return `${step}${wait}`;
}
function scheduleRefresh(hash, jobs) {
  clearTimeout(refreshTimer);
  if (jobs.some(j => WK.ACTIVE.includes(j.status))) refreshTimer = setTimeout(() => { if (location.hash === hash && document.visibilityState === 'visible') (hash === '#ai' ? renderFactory(C) : renderReview(C, hash.slice(7))); }, 10000);
}

// ---------- #ai — bảng điều khiển ----------
export async function renderFactory(ctx) {
  C = ctx; const app = C.app;
  app.innerHTML = '<p class="qt-loading">Đang mở Xưởng nội dung…</p>';
  const D = deps();
  let jobs = [], status = null, arts = [], settings = null, notes = [];
  try { jobs = await D.store.listJobs(); arts = await D.store.listArticles(); }
  catch (e) { app.innerHTML = `<section class="qt-ai"><a class="qt-btn qt-btn-ghost" href="#">← Danh sách</a><h1>Xưởng nội dung AI</h1><div class="qt-alert">${setupHint(e)}</div></section>`; return; }
  try { settings = await D.store.getSettings(); notes = await D.store.listNotifications(); } catch (e) { settings = { error: e }; }
  for (const j of jobs) {
    try {
      Object.assign(j, await P.syncJob(D, j));
      const a = arts.find(x => x.id === j.article_id);
      if (a && a.status === 'draft' && ['qa', 'awaiting_owner'].includes(j.status)) {      // QA luôn chạy lại trên bài hiện tại (kể cả sau khi sửa tay)
        const q = WK.qaWithSources(a, j); const st = q.ok ? 'awaiting_owner' : 'qa';
        if (st !== j.status || q.score !== (j.qa && j.qa.score)) Object.assign(j, await D.store.saveJob({ ...j, qa: q, status: st }));
      }
    } catch { /* bỏ qua */ }
  }
  // Việc bị kẹt (máy chủ không được đánh thức > 2 phút, khóa đã hết) → tự đánh thức khi OWNER mở Xưởng
  const stalled = jobs.some(j => WK.ACTIVE.includes(j.status) && (!j.lock_until || Date.parse(j.lock_until) < Date.now()) && j.next_run_at && Date.parse(j.next_run_at) < Date.now() - 120e3);
  if (stalled && !C.DEV) callFn('kick').catch(() => {});
  try { status = await callFn('status', {}); } catch (e) { status = { error: e.message }; }
  const byStatus = s => jobs.filter(j => s.includes(j.status));
  const artOf = id => arts.find(a => a.id === id);
  const prov = status && status.provider;
  const provTxt = !status || status.error ? `<span class="qt-ai-chip qt-ai-chip--off">AI chưa sẵn sàng: ${esc(status && status.error)}</span>`
    : prov.mock ? '<span class="qt-ai-chip qt-ai-chip--mock">MÔ PHỎNG (mock) — không gọi AI thật, không tốn phí</span>'
      : `<span class="qt-ai-chip">${esc(prov.text)} · ${esc(prov.textModel)}${prov.image !== 'none' ? ` · ảnh: ${esc(prov.image)} ${esc(prov.imageModel)} (${esc(prov.imageQuality || '')})` : ' · không tạo ảnh'}</span>`;
  const workerTxt = C.DEV ? '<span class="qt-muted">Máy chạy việc: mô phỏng trong trình duyệt (chế độ thử)</span>'
    : status && status.worker ? (status.worker.ready ? '<span class="qt-muted">Máy chạy việc: sẵn sàng (chạy phía máy chủ)</span>' : '<span class="qt-err">Máy chạy việc chưa cấu hình (KT_WORKER_SECRET)</span>') : '';
  const spend = status && status.month ? `<span class="qt-muted">Tháng này: ${status.month.calls} lượt gọi · ước tính ${status.month.spent_usd} / ${status.limits.monthlyBudgetUsd} USD</span>` : '';
  const card = j => {
    const a = artOf(j.article_id); const cov = a && a.cover && a.cover.path ? C.imgSrc(a.cover.path_sm || a.cover.path) : '';
    const q = j.qa ? `QA ${j.qa.score}/100 · ${j.qa.errors.length} lỗi · ${j.qa.warnings.length} lưu ý` : '';
    const sc = j.source_check && j.source_check.summary ? ` · link nguồn: ${j.source_check.summary.ok} mở được${j.source_check.summary.removed ? `, ${j.source_check.summary.removed} bị bỏ` : ''}` : '';
    const acts = [];
    if (j.article_id && a) acts.push(`<a class="qt-btn qt-btn-primary qt-sm" href="#duyet/${esc(j.id)}">Xem &amp; duyệt</a>`);
    if (['proposed', 'failed', 'qa'].includes(j.status)) acts.push(`<button class="qt-btn qt-sm" data-ai="run" data-id="${esc(j.id)}">${j.status === 'proposed' ? '▶ Tạo bài' : '↻ Chạy tiếp'}</button>`);
    if (j.status === 'needs_changes') acts.push(`<button class="qt-btn qt-sm" data-ai="revise" data-id="${esc(j.id)}">✏️ AI sửa theo góp ý</button>`);
    if (!['published', 'rejected'].includes(j.status)) acts.push(`<button class="qt-btn qt-btn-ghost qt-sm" data-ai="reject" data-id="${esc(j.id)}">Bỏ</button>`);
    const prog = progressOf(j);
    return `<article class="qt-ai-card"><div class="qt-ai-thumb">${cov ? `<img src="${esc(cov)}" alt="" loading="lazy">` : '<span>🤖</span>'}</div>
      <div class="qt-ai-main"><div class="qt-ai-meta">${badge(j.status)}${j.origin === 'auto' ? ' <span class="qt-badge qt-badge--draft">Lịch tự động</span>' : ''} <span class="qt-muted">${esc((groupById(j.grp) || {}).name || j.grp)} · ${esc(fmt(j.updated_at))}</span></div>
      <strong class="qt-ai-title">${esc(a ? a.title : j.title)}</strong>
      ${prog ? `<div class="qt-ai-prog">⏳ ${esc(prog)}</div>` : ''}
      ${q ? `<div class="qt-muted qt-ai-qa">${esc(q + sc)}${j.images_total ? ` · ảnh ${j.images_done}/${j.images_total}` : ''}${Number(j.cost_usd) ? ` · ${Number(j.cost_usd).toFixed(3)} USD` : ''}</div>` : ''}
      ${j.error ? `<div class="${WK.ACTIVE.includes(j.status) ? 'qt-muted' : 'qt-err'}">${esc(j.error)}</div>` : ''}${j.owner_note ? `<div class="qt-muted">Góp ý: ${esc(j.owner_note)}</div>` : ''}
      <div class="qt-ai-acts">${acts.join('')}</div></div></article>`;
  };
  const section = (title, list, empty) => `<section class="qt-ai-sec"><h2>${title} <span class="qt-muted">(${list.length})</span></h2>${list.length ? `<div class="qt-ai-cards">${list.map(card).join('')}</div>` : `<p class="qt-empty">${empty}</p>`}</section>`;
  app.innerHTML = `<section class="qt-ai">
    <div class="qt-list-head"><div><a class="qt-btn qt-btn-ghost qt-sm" href="#">← Danh sách bài</a><h1>Xưởng nội dung AI</h1></div><div>${provTxt}<br>${workerTxt}<br>${spend}</div></div>
    <p class="qt-alert qt-ai-busy" id="qt-ai-busy" hidden></p>
    ${section('Chờ bạn duyệt', byStatus(['awaiting_owner']), 'Chưa có bài nào chờ duyệt.')}
    ${section('Cần chú ý', byStatus(['qa', 'needs_changes', 'failed']), 'Không có việc nào cần chú ý.')}
    ${section('Máy chủ đang xử lý', byStatus(['queued', 'generating', 'proposed']), 'Không có việc nào đang xử lý.')}
    <section class="qt-ai-sec qt-card"><h2>Đề xuất chủ đề mới</h2>
      <p class="qt-hint">Bấm "+ Tạo bài" là đủ: máy chủ tự viết, dàn trang, kiểm tra link nguồn, tạo ảnh và báo khi bài chờ duyệt. Có thể đóng trình duyệt.</p>
      <div class="qt-ai-groups">${GROUPS.map(g => `<label class="qt-check"><input type="checkbox" class="qt-ai-g" value="${g.id}" checked> ${esc(g.name)}</label>`).join('')}</div>
      <button class="qt-btn qt-btn-primary" data-ai="suggest">💡 Gợi ý chủ đề</button>
      <div id="qt-ai-ideas"></div>
      <details class="qt-adv"><summary>Hoặc tự nhập chủ đề + tư liệu</summary>
        <label>Chủ đề<input id="qt-ai-title" maxlength="200" placeholder="Ví dụ: Cách chuẩn bị chuồng cho mùa mưa"></label>
        <label>Nhóm<select id="qt-ai-group">${GROUPS.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select></label>
        <label>Tư liệu / yêu cầu riêng (tùy chọn)<textarea id="qt-ai-notes" rows="4" maxlength="20000" placeholder="Dán ghi chú của trại, điều muốn nhấn mạnh…"></textarea></label>
        <button class="qt-btn" data-ai="create-manual">+ Tạo việc</button></details>
      ${C.DEV ? '<p class="qt-hint">Chế độ thử local: <button class="qt-btn qt-sm" data-ai="samples">Nạp 3 bài mẫu</button></p>' : ''}</section>
    ${settingsHtml(settings)}
    ${notifyHtml(status, notes)}
    ${section('Đã xuất bản / đã bỏ', byStatus(['published', 'rejected']), '—')}
  </section>`;
  app.onclick = null;
  $('.qt-ai').addEventListener('click', e => onFactoryClick(e));
  const f = $('#qt-ai-settings'); if (f) f.addEventListener('submit', onSaveSettings);
  scheduleRefresh('#ai', jobs);
}

function settingsHtml(s) {
  if (!s || s.error) return `<section class="qt-ai-sec qt-card"><h2>Lịch tạo bài tự động</h2><div class="qt-alert">${setupHint(s && s.error)}</div></section>`;
  const groups = Array.isArray(s.auto_groups) ? s.auto_groups : [];
  return `<section class="qt-ai-sec qt-card"><h2>Lịch tạo bài tự động ${s.auto_enabled ? '<span class="qt-badge qt-badge--published">ĐANG BẬT</span>' : '<span class="qt-badge qt-badge--draft">TẮT</span>'}</h2>
    <p class="qt-hint">Mặc định <strong>TẮT</strong>. Khi bật: mỗi ngày từ giờ đã chọn, AI tự chọn chủ đề mới và chuẩn bị tối đa số bài đã đặt. <strong>Bài luôn chờ bạn duyệt — AI không tự xuất bản.</strong>
    Lịch chỉ chạy khi máy chủ đã có nhịp (file <code>kt_r3_schedule_enable.sql</code>, OWNER tự chạy) và đã đặt ngân sách tháng.</p>
    <form id="qt-ai-settings" class="qt-ai-settings">
      <label>Ngân sách AI tháng (USD, bắt buộc để bật)<input name="budget" type="number" min="1" max="200" step="1" value="${esc(s.monthly_budget_usd ?? '')}" placeholder="vd. 10"></label>
      <label>Số bài / ngày<select name="per_day">${[1, 2, 3, 4, 5].map(k => `<option${k === s.auto_per_day ? ' selected' : ''}>${k}</option>`).join('')}</select></label>
      <label>Bắt đầu lúc (giờ Việt Nam)<select name="hour">${Array.from({ length: 24 }, (_, h) => `<option value="${h}"${h === s.auto_hour ? ' selected' : ''}>${h}:00</option>`).join('')}</select></label>
      <div class="qt-ai-groups">${GROUPS.map(g => `<label class="qt-check"><input type="checkbox" name="grp" value="${g.id}"${!groups.length || groups.includes(g.id) ? ' checked' : ''}> ${esc(g.name)}</label>`).join('')}</div>
      <label class="qt-check"><input type="checkbox" name="enabled"${s.auto_enabled ? ' checked' : ''}> Bật lịch tự động</label>
      <button class="qt-btn" type="submit">Lưu cài đặt lịch</button></form></section>`;
}
function notifyHtml(status, notes) {
  const n = status && status.notify;
  const mode = C.DEV ? 'Chế độ thử local — không gửi' : !n ? '—' : n.mode === 'send' ? (n.ready ? `Gửi thật qua ${n.channel}` : 'Đặt gửi thật nhưng THIẾU cấu hình kênh') : n.mode === 'off' ? 'Tắt' : 'Chế độ thử (dry-run) — chỉ ghi lại, KHÔNG gửi';
  const lbl = { dry_run: 'chưa gửi (thử)', sent: 'đã gửi', skipped: 'bỏ qua', failed: 'gửi lỗi' };
  return `<section class="qt-ai-sec qt-card"><h2>Thông báo cho OWNER</h2><p class="qt-hint">Khi bài chờ duyệt hoặc việc bị lỗi, máy chủ ghi một thông báo (chỉ có tiêu đề + link trang duyệt — link cần đăng nhập OWNER). Hiện tại: <strong>${esc(mode)}</strong>.</p>
    ${(notes || []).length ? `<ul class="qt-rv-list">${notes.map(x => `<li><span class="qt-muted">${esc(fmt(x.created_at))}</span> · ${esc(lbl[x.status] || x.status)} · ${esc(String(x.message || '').split('\n')[1] || x.kind)}</li>`).join('')}</ul>` : '<p class="qt-empty">Chưa có thông báo.</p>'}</section>`;
}
async function onSaveSettings(e) {
  e.preventDefault(); const f = e.target; const D = deps();
  const budget = f.budget.value ? Math.round(Number(f.budget.value) * 100) / 100 : null;
  const s = { auto_enabled: f.enabled.checked, auto_per_day: Number(f.per_day.value), auto_hour: Number(f.hour.value), monthly_budget_usd: budget,
    auto_groups: $$('input[name="grp"]', f).filter(c => c.checked).map(c => c.value) };
  if (s.auto_enabled && !(budget > 0)) { C.toast('Cần đặt ngân sách tháng trước khi bật lịch tự động.', 6000); return; }
  if (budget != null && (budget <= 0 || budget > 200)) { C.toast('Ngân sách tháng từ 1 đến 200 USD.', 6000); return; }
  if (s.auto_enabled && !(await C.confirmBox(`Bật lịch tự động: tối đa ${s.auto_per_day} bài/ngày từ ${s.auto_hour}:00, ngân sách ${budget} USD/tháng. Bài vẫn chờ bạn duyệt. Tiếp tục?`, 'Bật lịch'))) return;
  try { await D.store.saveSettings(s); C.toast('Đã lưu cài đặt lịch.'); } catch (err) { C.toast((err && err.message) || String(err), 8000); }
  renderFactory(C);
}

async function onFactoryClick(e) {
  const b = e.target.closest('[data-ai]'); if (!b) return;
  const D = deps(); const id = b.dataset.id; const act = b.dataset.ai;
  try {
    if (act === 'run') { const j = await D.store.getJob(id); await D.store.saveJob(WK.requeue({ ...j, step: j.status === 'proposed' ? 'article' : j.step }, { now: new Date() })); await busy('Đang giao việc…', wake); }
    if (act === 'revise') { const j = await D.store.getJob(id); await D.store.saveJob(WK.requeue(j, { mode: 'revise', now: new Date() })); await busy('Đang giao việc sửa…', wake); }
    if (act === 'reject') { if (!(await C.confirmBox('Bỏ việc này? Máy chủ sẽ dừng nếu đang chạy. Bài nháp (nếu có) vẫn được giữ trong danh sách bài.', 'Bỏ việc'))) return; await P.rejectJob(D, id); }
    if (act === 'suggest') {
      const groups = $$('.qt-ai-g').filter(c => c.checked).map(c => c.value);
      const ideas = await busy('Đang gợi ý chủ đề…', () => P.suggestIdeas(D, { groups, count: 8 }));
      const label = d => d.level === 'trung' ? `<span class="qt-badge qt-badge--hidden">Trùng: ${esc(d.with.title)}</span>` : d.level === 'gan-trung' ? `<span class="qt-badge qt-badge--draft">Gần trùng: ${esc(d.with.title)}</span>` : '<span class="qt-badge qt-badge--published">Mới</span>';
      $('#qt-ai-ideas').innerHTML = ideas.length ? `<ul class="qt-ai-ideas">${ideas.map((i, k) => `<li><div><strong>${esc(i.title)}</strong> ${label(i.dup)}<br><span class="qt-muted">${esc((groupById(i.group) || {}).name || i.group)} · ${esc(i.angle)}</span></div>
        <button class="qt-btn qt-sm" data-ai="create" data-k="${k}"${i.dup.level === 'trung' ? ' disabled' : ''}>+ Tạo bài</button></li>`).join('')}</ul>` : '<p class="qt-empty">Không có gợi ý mới.</p>';
      $('#qt-ai-ideas').dataset.ideas = JSON.stringify(ideas); return;
    }
    if (act === 'create' || act === 'create-manual') {
      let idea;
      if (act === 'create') idea = JSON.parse($('#qt-ai-ideas').dataset.ideas)[Number(b.dataset.k)];
      else { const title = $('#qt-ai-title').value.trim(); if (title.length < 10) { C.toast('Chủ đề cần ít nhất 10 ký tự.'); return; } idea = { title, group: $('#qt-ai-group').value, notes: $('#qt-ai-notes').value }; }
      await D.store.insertJob(WK.enqueueNew(await poolTitles(D), idea, { now: new Date() }));
      await busy('Đang giao việc cho máy chủ…', wake);
    }
    if (act === 'samples') await loadSamples(D);
  } catch (err) { C.toast((err && err.message) || String(err), 8000); }
  renderFactory(C);
}

// Chế độ thử: nạp 3 bài mẫu qua đúng máy chạy việc (mock). Ảnh bìa đổi sang ảnh minh họa có sẵn của website cho dễ xem.
async function loadSamples(D) {
  const created = [];
  for (const s of SAMPLES) {
    try { created.push(await D.store.insertJob(WK.enqueueNew(await poolTitles(D), { title: s.pkg.title, group: s.pkg.group }, { now: new Date() }))); }
    catch (e) { if (e.code !== 'duplicate') throw e; }
  }
  await busy('Đang chạy máy chạy việc (mô phỏng)…', runDevWorker);
  for (const [k, j0] of created.entries()) {
    const j = await D.store.getJob(j0.id); const art = j && j.article_id && await D.store.getArticle(j.article_id); if (!art) continue;
    const s = SAMPLES.find(x => x.pkg.title === j.title) || SAMPLES[k];
    applyImage(art, 'cover', { ...SAMPLE_COVERS[s.key], ai: true });
    await D.store.saveArticle({ ...art, status: 'draft' });
    const q = WK.qaWithSources(await D.store.getArticle(j.article_id), j);
    await D.store.saveJob({ ...j, qa: q, status: q.ok ? 'awaiting_owner' : 'qa' });
  }
}

// ---------- #duyet/<jobId> — trang duyệt ----------
function fitPreview(fr, frameW) {
  const stage = fr.closest('.qt-rv-stage'); const box = fr.parentElement;
  const avail = stage.clientWidth - 24;                                     // trừ padding khung
  const f = fitScale(avail, frameW), H = Math.round(window.innerHeight * 0.78);
  fr.style.width = f.width + 'px'; fr.style.height = Math.round(H / f.scale) + 'px'; fr.style.transform = `scale(${f.scale})`;
  box.style.width = f.outerWidth + 'px'; box.style.height = H + 'px';
  const note = $('#qt-rv-scale'); if (note) note.textContent = f.scale < 1 ? `Khổ ${frameW}px, thu nhỏ ${Math.round(f.scale * 100)}% cho vừa màn hình` : `Khổ ${frameW}px`;
}
export async function renderReview(ctx, jobId) {
  C = ctx; const app = C.app;
  app.innerHTML = '<p class="qt-loading">Đang mở bài…</p>';
  const D = deps();
  let job, art, vers = [];
  try { job = await D.store.getJob(jobId); if (job) { job = await P.syncJob(D, job); art = job.article_id && await D.store.getArticle(job.article_id); vers = art ? await D.store.listVersions(art.id) : []; } }
  catch (e) { app.innerHTML = `<div class="qt-alert">${setupHint(e)}</div><a class="qt-btn" href="#ai">← Xưởng</a>`; return; }
  if (job && !art && WK.ACTIVE.includes(job.status)) { app.innerHTML = `<div class="qt-alert">⏳ Máy chủ đang chuẩn bị bài: ${esc(progressOf(job))}. Trang tự cập nhật.</div><a class="qt-btn" href="#ai">← Xưởng</a>`; scheduleRefresh('#duyet/' + jobId, [job]); return; }
  if (!job || !art) { app.innerHTML = '<div class="qt-alert">Không tìm thấy bài (có thể đã bị xóa).</div><a class="qt-btn" href="#ai">← Xưởng</a>'; return; }
  const qa = art.status === 'draft' ? WK.qaWithSources(art, job) : (job.qa || { errors: [], warnings: [], passed: [], score: 0 });
  if (art.status === 'draft' && ['qa', 'awaiting_owner'].includes(job.status) && (qa.ok ? 'awaiting_owner' : 'qa') !== job.status) job = await D.store.saveJob({ ...job, qa, status: qa.ok ? 'awaiting_owner' : 'qa' });
  const active = WK.ACTIVE.includes(job.status);
  const notes = (job.pkg && job.pkg.review_notes) || [];
  const pend = pendingSlots(art);
  const canApprove = (C.ON_PROD || C.DEV) && qa.ok && art.status === 'draft' && !active;
  const why = active ? 'Máy chủ đang xử lý bài này — đợi xong rồi duyệt.' : !(C.ON_PROD || C.DEV) ? 'Chỉ duyệt xuất bản trên website chính thức (sau khi Phase 1R lên Production).' : !qa.ok ? 'Còn lỗi kiểm tra chất lượng — xử lý trước khi duyệt.' : art.status !== 'draft' ? 'Bài không còn ở trạng thái nháp.' : '';
  const li = (arr, cls) => arr.map(x => `<li class="${cls}">${esc(x.msg || x)}${x.where ? `<br><span class="qt-muted">«${esc(x.where)}»</span>` : ''}</li>`).join('');
  const sc = job.source_check;
  const scHtml = sc && sc.results ? `<div class="qt-card"><h3>Kiểm tra link nguồn (tự động)</h3>
      <p class="qt-muted">${esc(fmt(sc.at))} · ${sc.summary.ok} mở được · ${sc.summary.removed} bị bỏ · ${sc.summary.noUrl} không có link</p>
      <ul class="qt-rv-list">${sc.results.map(r => `<li class="${r.state === 'ok' ? 'qt-rv-ok' : r.state === 'no-url' ? 'qt-rv-warn' : 'qt-rv-err'}">${esc(STATE_LABEL[r.state] || r.state)}${r.state !== 'ok' && r.state !== 'no-url' ? ' — ĐÃ BỎ khỏi bài' : ''}: ${esc(r.title)}<br><span class="qt-muted">${esc(r.reason)}</span></li>`).join('')}</ul>
      <p class="qt-hint">⚠️ Chỉ kiểm tra link <strong>mở được</strong>. Nội dung chuyên môn <strong>chưa được xác minh</strong> — bạn cần mở nguồn và đọc bài trước khi duyệt.</p></div>` : '';
  app.innerHTML = `<section class="qt-review">
    <div class="qt-ebar"><a class="qt-btn qt-btn-ghost" href="#ai">← Xưởng</a>${badge(job.status)}
      <div class="qt-seg"><button type="button" data-rw="390" class="active">📱</button><button type="button" data-rw="1200">🖥</button></div><span class="qt-muted" id="qt-rv-scale"></span>
      <div class="qt-ebar-right">
        <button class="qt-btn qt-btn-primary" data-rv="approve"${canApprove ? '' : ' disabled'} title="${esc(why)}">✅ Duyệt xuất bản</button>
        <button class="qt-btn" data-rv="changes"${art.status === 'draft' && !active ? '' : ' disabled'}>✏️ Yêu cầu chỉnh sửa</button>
        <a class="qt-btn qt-btn-ghost" href="#sua/${esc(art.id)}">Sửa tay</a></div></div>
    ${why ? `<p class="qt-hint">${esc(why)}</p>` : ''}
    ${active ? `<p class="qt-alert">⏳ ${esc(progressOf(job))}</p>` : ''}
    <p class="qt-alert qt-ai-busy" id="qt-ai-busy" hidden></p>
    <div class="qt-rv-cols">
      <div class="qt-rv-stage"><div class="qt-rv-fit"><iframe id="qt-rv-frame" title="Xem trước bài như khách hàng thấy"></iframe></div></div>
      <aside class="qt-rv-side">
        <div class="qt-card"><h3>Kiểm tra chất lượng · ${qa.score}/100</h3>
          ${qa.errors.length ? `<p><strong>Cần xử lý trước khi duyệt</strong></p><ul class="qt-rv-list">${li(qa.errors, 'qt-rv-err')}</ul>` : ''}
          ${qa.warnings.length ? `<p><strong>OWNER nên xem</strong></p><ul class="qt-rv-list">${li(qa.warnings, 'qt-rv-warn')}</ul>` : ''}
          ${qa.passed.length ? `<ul class="qt-rv-list">${li(qa.passed, 'qt-rv-ok')}</ul>` : ''}
          ${pend.length && !active ? `<p class="qt-muted">${pend.length} ảnh chưa tạo.${job.image_errors && job.image_errors.length ? ` Lỗi gần nhất: ${esc(job.image_errors.at(-1).msg)}` : ''}</p><button class="qt-btn qt-sm" data-rv="images">↻ Tạo ảnh còn thiếu</button>` : ''}</div>
        ${scHtml}
        ${notes.length ? `<div class="qt-card"><h3>Ghi chú biên tập (chưa xác minh)</h3><ul class="qt-rv-list">${li(notes, 'qt-rv-warn')}</ul></div>` : ''}
        <div class="qt-card"><h3>Nguồn — bấm để kiểm tra</h3><ol class="qt-rv-list">${(art.sources || []).map(s => { const o = typeof s === 'string' ? { title: s } : s; return `<li>${o.url ? `<a href="${esc(o.url)}" target="_blank" rel="noopener nofollow">${esc(o.title)}</a>` : `${esc(o.title)} <span class="qt-muted">(không có link)</span>`}</li>`; }).join('')}</ol></div>
        <div class="qt-card"><h3>Phiên bản (${vers.length})</h3><ol class="qt-rv-list">${vers.slice().reverse().map(v => `<li>v${v.version} · ${v.author === 'ai' ? 'AI' : 'OWNER'} · ${esc(fmt(v.created_at))}<br><span class="qt-muted">${esc(v.note)}</span>${v.version < vers.length && !active ? ` <button class="qt-btn qt-btn-ghost qt-sm" data-rv="restore" data-v="${v.version}">Khôi phục</button>` : ''}</li>`).join('')}</ol></div>
        <div class="qt-card"><h3>Nhật ký</h3><ul class="qt-rv-list">${(job.history || []).slice().reverse().slice(0, 12).map(h => `<li><span class="qt-muted">${esc(fmt(h.at))}</span> ${esc(h.msg)}</li>`).join('')}</ul></div>
      </aside></div></section>`;
  const fr = $('#qt-rv-frame'); fr.srcdoc = renderPreviewPage(art);
  let frameW = 390; fitPreview(fr, frameW);
  window.onresize = () => { if ($('#qt-rv-frame')) fitPreview($('#qt-rv-frame'), frameW); };
  app.onclick = null;
  $('.qt-review').addEventListener('click', async e => {
    const w = e.target.closest('[data-rw]');
    if (w) { $$('[data-rw]').forEach(x => x.classList.toggle('active', x === w)); frameW = Number(w.dataset.rw); fitPreview(fr, frameW); return; }
    const b = e.target.closest('[data-rv]'); if (!b || b.disabled) return;
    try {
      if (b.dataset.rv === 'approve') { location.hash = `#duyet-xb/${art.id}`; return; }   // mở trình soạn + hộp xác nhận xuất bản 5 mục (OWNER bấm)
      if (b.dataset.rv === 'changes') {
        const note = await new Promise(res => {
          C.modal(`<h2>Yêu cầu chỉnh sửa</h2><p class="qt-muted">Ghi rõ cần sửa gì. Bản hiện tại được lưu thành một phiên bản trước khi AI sửa.</p>
            <textarea id="qt-rv-note" rows="5" maxlength="4000" placeholder="Ví dụ: Mở bài ngắn hơn; thêm phần chim non mùa lạnh; bỏ câu về…"></textarea>
            <div class="qt-modal-act"><button class="qt-btn" data-close>Hủy</button><button class="qt-btn qt-btn-primary" id="qt-rv-go">Gửi góp ý</button></div>`, () => res(null));
          $('#qt-rv-go').onclick = () => { const v = $('#qt-rv-note').value; C.acceptModal(); res(v); };
        });
        if (note == null) return;
        const j = await P.requestChanges(deps(), job.id, note);
        if (await C.confirmBox('Đã ghi góp ý. Giao cho AI sửa ngay (chạy phía máy chủ)?', 'AI sửa ngay')) { await deps().store.saveJob(WK.requeue(j, { mode: 'revise', now: new Date() })); await busy('Đang giao việc sửa…', wake); }
      }
      if (b.dataset.rv === 'images') { await deps().store.saveJob(WK.requeue(job, { mode: 'images', now: new Date() })); await busy('Đang giao việc tạo ảnh…', wake); }
      if (b.dataset.rv === 'restore') {
        if (!(await C.confirmBox(`Khôi phục phiên bản v${b.dataset.v}? Bản hiện tại vẫn được lưu trong lịch sử.`, 'Khôi phục'))) return;
        const saved = await P.restoreVersion(deps(), art.id, Number(b.dataset.v));
        const j = await deps().store.getJob(job.id); const q = WK.qaWithSources(saved, j);
        await deps().store.saveJob({ ...j, qa: q, status: q.ok ? 'awaiting_owner' : 'qa' });
      }
    } catch (err) { C.toast((err && err.message) || String(err), 8000); }
    renderReview(C, job.id);
  });
  scheduleRefresh('#duyet/' + jobId, [job]);
}
export async function pendingReviewCount(ctx) {
  C = ctx; try { return (await makeStore().listJobs()).filter(j => j.status === 'awaiting_owner').length; } catch { return null; }
}
