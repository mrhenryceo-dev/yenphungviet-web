// Phase 1S — giao diện "Xưởng nội dung AI" trong /quan-tri/ (chỉ OWNER).
//   #ai             → bảng điều khiển: bài chờ duyệt, việc đang xử lý, đề xuất chủ đề, tự nhập chủ đề
//   #duyet/<jobId>  → trang duyệt: xem bài y như khách (điện thoại / máy tính), QA, ghi chú biên tập, phiên bản,
//                     [Duyệt xuất bản] (chỉ trên website chính thức) · [Yêu cầu chỉnh sửa] · [Sửa tay]
// Mọi lệnh gọi AI đi qua Edge Function kt-ai (khóa API nằm ở Supabase Secrets). Chế độ thử local (?dev=1) dùng mock.
import * as P from '/assets/kt/ai/pipeline.mjs';
import { GROUPS, groupById } from '/assets/kt/ai/taxonomy.mjs';
import { pendingSlots, applyImage } from '/assets/kt/ai/compose.mjs';
import { SAMPLES, SAMPLE_COVERS } from '/assets/kt/ai/mock-data.mjs';
import { renderPreviewPage } from '/assets/kt/render.mjs';
import { qaArticle } from '/assets/kt/ai/qa.mjs';
import { fromBase64 } from '/assets/kt/ai/mockimg.mjs';

let C = null;   // ngữ cảnh từ admin.mjs
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const BADGE = { proposed: 'draft', generating: 'draft', qa: 'hidden', awaiting_owner: 'published', needs_changes: 'hidden', published: 'published', failed: 'hidden', rejected: 'draft' };

// ---------- kho việc + phiên bản ----------
const LS = { jobs: 'kt_dev_ai_jobs', vers: 'kt_dev_ai_versions' };
const lsGet = k => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } };
const lsPut = (k, v) => localStorage.setItem(k, JSON.stringify(v));
function makeStore() {
  const art = C.store;
  const base = {
    listArticles: () => art.all(), getArticle: id => art.get(id),
    saveArticle: async row => { const r = { ...row }; delete r.created_at; delete r.updated_at; return art.save(r); }
  };
  if (C.DEV) return {
    ...base,
    async listJobs() { return lsGet(LS.jobs); }, async getJob(id) { return lsGet(LS.jobs).find(j => j.id === id) || null; },
    async saveJob(j) { const l = lsGet(LS.jobs); const i = l.findIndex(x => x.id === j.id); i >= 0 ? (l[i] = j) : l.push(j); lsPut(LS.jobs, l); return j; },
    async addVersion(v) { const l = lsGet(LS.vers); const version = l.filter(x => x.article_id === v.article_id).length + 1; const r = { ...v, version, id: crypto.randomUUID(), created_at: new Date().toISOString() }; l.push(r); lsPut(LS.vers, l); return r; },
    async listVersions(id) { return lsGet(LS.vers).filter(x => x.article_id === id).sort((a, b) => a.version - b.version); }
  };
  const sb = C.sb();
  const q = async p => { const { data, error } = await p; if (error) throw error; return data; };
  return {
    ...base,
    listJobs: () => q(sb.from('kt_ai_jobs').select('*').order('updated_at', { ascending: false })),
    getJob: async id => (await q(sb.from('kt_ai_jobs').select('*').eq('id', id).limit(1)))[0] || null,
    async saveJob(j) { const r = { ...j }; delete r.created_at; delete r.updated_at; return q(sb.from('kt_ai_jobs').upsert(r).select('*').single()); },
    async addVersion(v) {
      const last = await q(sb.from('kt_article_versions').select('version').eq('article_id', v.article_id).order('version', { ascending: false }).limit(1));
      return q(sb.from('kt_article_versions').insert({ ...v, version: ((last[0] && last[0].version) || 0) + 1 }).select('*').single());
    },
    listVersions: id => q(sb.from('kt_article_versions').select('*').eq('article_id', id).order('version', { ascending: true }))
  };
}

// ---------- gọi AI qua Edge Function ----------
async function callFn(action, payload) {
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
const ai = {
  suggest: async p => ({ json: { ideas: (await callFn('suggest', p)).ideas || [] } }),
  article: async p => { const j = await callFn('article', p); return { json: j.pkg, provider: j.provider }; },
  revise: async p => ({ json: (await callFn('revise', p)).pkg }),
  image: async p => { const j = await callFn('image', p); return { bytes: fromBase64(j.b64), mime: j.mime }; }
};
const media = {
  async fromBytes(bytes, mime, opts) {
    const file = new File([bytes], 'ai-' + Date.now() + (mime === 'image/png' ? '.png' : '.jpg'), { type: mime });
    const res = await C.processFile(file, opts);
    await C.media.upload(res.files);
    return res.img;
  }
};
const deps = () => ({ store: makeStore(), ai, media, now: () => new Date() });

// ---------- tiện ích hiển thị ----------
const esc = s => C.esc(s);
const fmt = iso => (iso ? new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '');
const badge = s => `<span class="qt-badge qt-badge--${BADGE[s] || 'draft'}">${esc(P.STATUS[s] || s)}</span>`;
function setupHint(e) {
  const m = (e && e.message) || String(e);
  if (/kt_ai_jobs|kt_article_versions|PGRST205|42P01|schema cache/i.test(m)) return 'Xưởng nội dung cần chạy migration <code>supabase/kt_r2_ai_migration.sql</code> (chờ OWNER duyệt). Trình soạn bài thủ công vẫn dùng bình thường.';
  return esc(m);
}
async function busy(label, fn) {
  const box = $('#qt-ai-busy'); if (box) { box.hidden = false; box.textContent = label; }
  try { return await fn(t => { if (box) box.textContent = t; }); }
  finally { if (box) box.hidden = true; }
}

// ---------- #ai — bảng điều khiển ----------
export async function renderFactory(ctx) {
  C = ctx; const app = C.app;
  app.innerHTML = '<p class="qt-loading">Đang mở Xưởng nội dung…</p>';
  const D = deps();
  let jobs = [], status = null, arts = [];
  try { jobs = await D.store.listJobs(); arts = await D.store.listArticles(); }
  catch (e) { app.innerHTML = `<section class="qt-ai"><a class="qt-btn qt-btn-ghost" href="#">← Danh sách</a><h1>Xưởng nội dung AI</h1><div class="qt-alert">${setupHint(e)}</div></section>`; return; }
  for (const j of jobs) {
    try {
      Object.assign(j, await P.syncJob(D, j));
      const a = arts.find(x => x.id === j.article_id);
      if (a && a.status === 'draft' && ['qa', 'awaiting_owner'].includes(j.status)) {      // QA luôn chạy lại trên bài hiện tại (kể cả sau khi sửa tay)
        const q = qaArticle(a, { risk: j.risk }); const st = q.ok ? 'awaiting_owner' : 'qa';
        if (st !== j.status || q.score !== (j.qa && j.qa.score)) Object.assign(j, await D.store.saveJob({ ...j, qa: q, status: st }));
      }
    } catch { /* bỏ qua */ }
  }
  try { status = await callFn('status', {}); } catch (e) { status = { error: e.message }; }
  const byStatus = s => jobs.filter(j => s.includes(j.status));
  const artOf = id => arts.find(a => a.id === id);
  const prov = status && status.provider;
  const provTxt = !status || status.error ? `<span class="qt-ai-chip qt-ai-chip--off">AI chưa sẵn sàng: ${esc(status && status.error)}</span>`
    : prov.mock ? '<span class="qt-ai-chip qt-ai-chip--mock">MÔ PHỎNG (mock) — không gọi AI thật, không tốn phí</span>'
      : `<span class="qt-ai-chip">${esc(prov.text)} · ${esc(prov.textModel)}${prov.image !== 'none' ? ` · ảnh: ${esc(prov.image)} ${esc(prov.imageModel)}` : ' · không tạo ảnh'}</span>`;
  const spend = status && status.month ? `<span class="qt-muted">Tháng này: ${status.month.calls} lượt gọi · ước tính ${status.month.spent_usd} / ${status.limits.monthlyBudgetUsd} USD</span>` : '';
  const card = j => {
    const a = artOf(j.article_id); const cov = a && a.cover && a.cover.path ? C.imgSrc(a.cover.path_sm || a.cover.path) : '';
    const q = j.qa ? `QA ${j.qa.score}/100 · ${j.qa.errors.length} lỗi · ${j.qa.warnings.length} lưu ý` : '';
    const acts = [];
    if (j.article_id && a) acts.push(`<a class="qt-btn qt-btn-primary qt-sm" href="#duyet/${esc(j.id)}">Xem &amp; duyệt</a>`);
    if (['proposed', 'failed', 'qa'].includes(j.status)) acts.push(`<button class="qt-btn qt-sm" data-ai="run" data-id="${esc(j.id)}">${j.status === 'proposed' ? '▶ Tạo bài' : '↻ Chạy tiếp'}</button>`);
    if (j.status === 'needs_changes') acts.push(`<button class="qt-btn qt-sm" data-ai="revise" data-id="${esc(j.id)}">✏️ AI sửa theo góp ý</button>`);
    if (!['published', 'rejected'].includes(j.status)) acts.push(`<button class="qt-btn qt-btn-ghost qt-sm" data-ai="reject" data-id="${esc(j.id)}">Bỏ</button>`);
    return `<article class="qt-ai-card"><div class="qt-ai-thumb">${cov ? `<img src="${esc(cov)}" alt="" loading="lazy">` : '<span>🤖</span>'}</div>
      <div class="qt-ai-main"><div class="qt-ai-meta">${badge(j.status)} <span class="qt-muted">${esc((groupById(j.grp) || {}).name || j.grp)} · ${esc(fmt(j.updated_at))}</span></div>
      <strong class="qt-ai-title">${esc(a ? a.title : j.title)}</strong>
      ${q ? `<div class="qt-muted qt-ai-qa">${esc(q)}${j.images_total ? ` · ảnh ${j.images_done}/${j.images_total}` : ''}</div>` : ''}
      ${j.error ? `<div class="qt-err">${esc(j.error)}</div>` : ''}${j.owner_note ? `<div class="qt-muted">Góp ý: ${esc(j.owner_note)}</div>` : ''}
      <div class="qt-ai-acts">${acts.join('')}</div></div></article>`;
  };
  const section = (title, list, empty) => `<section class="qt-ai-sec"><h2>${title} <span class="qt-muted">(${list.length})</span></h2>${list.length ? `<div class="qt-ai-cards">${list.map(card).join('')}</div>` : `<p class="qt-empty">${empty}</p>`}</section>`;
  app.innerHTML = `<section class="qt-ai">
    <div class="qt-list-head"><div><a class="qt-btn qt-btn-ghost qt-sm" href="#">← Danh sách bài</a><h1>Xưởng nội dung AI</h1></div><div>${provTxt}<br>${spend}</div></div>
    <p class="qt-alert qt-ai-busy" id="qt-ai-busy" hidden></p>
    ${section('Chờ bạn duyệt', byStatus(['awaiting_owner']), 'Chưa có bài nào chờ duyệt.')}
    ${section('Cần chú ý', byStatus(['qa', 'needs_changes', 'failed']), 'Không có việc nào cần chú ý.')}
    ${section('Đang chờ / đang tạo', byStatus(['proposed', 'generating']), 'Không có việc nào đang chờ.')}
    <section class="qt-ai-sec qt-card"><h2>Đề xuất chủ đề mới</h2>
      <div class="qt-ai-groups">${GROUPS.map(g => `<label class="qt-check"><input type="checkbox" class="qt-ai-g" value="${g.id}" checked> ${esc(g.name)}</label>`).join('')}</div>
      <button class="qt-btn qt-btn-primary" data-ai="suggest">💡 Gợi ý chủ đề</button>
      <div id="qt-ai-ideas"></div>
      <details class="qt-adv"><summary>Hoặc tự nhập chủ đề + tư liệu</summary>
        <label>Chủ đề<input id="qt-ai-title" maxlength="200" placeholder="Ví dụ: Cách chuẩn bị chuồng cho mùa mưa"></label>
        <label>Nhóm<select id="qt-ai-group">${GROUPS.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select></label>
        <label>Tư liệu / yêu cầu riêng (tùy chọn)<textarea id="qt-ai-notes" rows="4" maxlength="20000" placeholder="Dán ghi chú của trại, điều muốn nhấn mạnh…"></textarea></label>
        <button class="qt-btn" data-ai="create-manual">+ Tạo việc</button></details>
      ${C.DEV ? '<p class="qt-hint">Chế độ thử local: <button class="qt-btn qt-sm" data-ai="samples">Nạp 3 bài mẫu</button></p>' : ''}</section>
    ${section('Đã xuất bản / đã bỏ', byStatus(['published', 'rejected']), '—')}
  </section>`;
  app.onclick = null;
  $('.qt-ai').addEventListener('click', e => onFactoryClick(e, jobs));
}

async function onFactoryClick(e, jobs) {
  const b = e.target.closest('[data-ai]'); if (!b) return;
  const D = deps(); const id = b.dataset.id; const act = b.dataset.ai;
  try {
    if (act === 'run') await busy('Đang chạy…', p => P.runJob(D, id, { onProgress: p }));
    if (act === 'revise') await busy('AI đang sửa theo góp ý…', p => P.reviseJob(D, id, { onProgress: p }));
    if (act === 'reject') { if (!(await C.confirmBox('Bỏ việc này? Bài nháp (nếu có) vẫn được giữ trong danh sách bài.', 'Bỏ việc'))) return; await P.rejectJob(D, id); }
    if (act === 'suggest') {
      const groups = $$('.qt-ai-g').filter(c => c.checked).map(c => c.value);
      const ideas = await busy('Đang gợi ý chủ đề…', () => P.suggestIdeas(D, { groups, count: 8 }));
      const label = d => d.level === 'trung' ? `<span class="qt-badge qt-badge--hidden">Trùng: ${esc(d.with.title)}</span>` : d.level === 'gan-trung' ? `<span class="qt-badge qt-badge--draft">Gần trùng: ${esc(d.with.title)}</span>` : '<span class="qt-badge qt-badge--published">Mới</span>';
      $('#qt-ai-ideas').innerHTML = ideas.length ? `<ul class="qt-ai-ideas">${ideas.map((i, k) => `<li><div><strong>${esc(i.title)}</strong> ${label(i.dup)}<br><span class="qt-muted">${esc((groupById(i.group) || {}).name || i.group)} · ${esc(i.angle)}</span></div>
        <button class="qt-btn qt-sm" data-ai="create" data-k="${k}"${i.dup.level === 'trung' ? ' disabled' : ''}>+ Tạo bài</button></li>`).join('')}</ul>` : '<p class="qt-empty">Không có gợi ý mới.</p>';
      $('#qt-ai-ideas').dataset.ideas = JSON.stringify(ideas); return;
    }
    if (act === 'create') { const idea = JSON.parse($('#qt-ai-ideas').dataset.ideas)[Number(b.dataset.k)]; const j = await P.createJob(D, idea); await busy('Đang tạo bài…', p => P.runJob(D, j.id, { onProgress: p })); }
    if (act === 'create-manual') {
      const title = $('#qt-ai-title').value.trim(); if (title.length < 10) { C.toast('Chủ đề cần ít nhất 10 ký tự.'); return; }
      const j = await P.createJob(D, { title, group: $('#qt-ai-group').value, notes: $('#qt-ai-notes').value });
      await busy('Đang tạo bài…', p => P.runJob(D, j.id, { onProgress: p }));
    }
    if (act === 'samples') await loadSamples(D);
  } catch (err) { C.toast((err && err.message) || String(err), 8000); }
  renderFactory(C);
}

// Chế độ thử: nạp 3 bài mẫu qua đúng quy trình (mock). Ảnh bìa = ảnh minh họa có sẵn của website; ảnh trong bài để ô giữ chỗ.
async function loadSamples(D) {
  for (const s of SAMPLES) {
    let job;
    try { job = await P.createJob(D, { title: s.pkg.title, group: s.pkg.group }); } catch (e) { if (e.code === 'duplicate') continue; throw e; }
    await busy(`Đang tạo bài mẫu "${s.pkg.title.slice(0, 40)}…"`, p => P.runJob(D, job.id, { onProgress: p, maxImages: 0 }));
    job = await D.store.getJob(job.id);
    const art = await D.store.getArticle(job.article_id);
    applyImage(art, 'cover', { ...SAMPLE_COVERS[s.key], ai: true });
    await D.store.saveArticle({ ...art, status: 'draft' });
    await D.store.saveJob({ ...job, step: 'qa' });
    await P.runJob(D, job.id, { maxImages: 0 });                   // chỉ chạy lại QA
  }
}

// ---------- #duyet/<jobId> — trang duyệt ----------
export async function renderReview(ctx, jobId) {
  C = ctx; const app = C.app;
  app.innerHTML = '<p class="qt-loading">Đang mở bài…</p>';
  const D = deps();
  let job, art, vers = [];
  try { job = await D.store.getJob(jobId); if (job) { job = await P.syncJob(D, job); art = job.article_id && await D.store.getArticle(job.article_id); vers = art ? await D.store.listVersions(art.id) : []; } }
  catch (e) { app.innerHTML = `<div class="qt-alert">${setupHint(e)}</div><a class="qt-btn" href="#ai">← Xưởng</a>`; return; }
  if (!job || !art) { app.innerHTML = '<div class="qt-alert">Không tìm thấy bài (có thể đã bị xóa).</div><a class="qt-btn" href="#ai">← Xưởng</a>'; return; }
  const qa = art.status === 'draft' ? qaArticle(art, { risk: job.risk }) : (job.qa || { errors: [], warnings: [], passed: [], score: 0 });
  if (art.status === 'draft' && ['qa', 'awaiting_owner'].includes(job.status) && (qa.ok ? 'awaiting_owner' : 'qa') !== job.status) job = await D.store.saveJob({ ...job, qa, status: qa.ok ? 'awaiting_owner' : 'qa' });
  const notes = (job.pkg && job.pkg.review_notes) || [];
  const pend = pendingSlots(art);
  const canApprove = (C.ON_PROD || C.DEV) && qa.ok && art.status === 'draft';
  const why = !(C.ON_PROD || C.DEV) ? 'Chỉ duyệt xuất bản trên website chính thức (sau khi Phase 1R lên Production).' : !qa.ok ? 'Còn lỗi kiểm tra chất lượng — xử lý trước khi duyệt.' : art.status !== 'draft' ? 'Bài không còn ở trạng thái nháp.' : '';
  const li = (arr, cls) => arr.map(x => `<li class="${cls}">${esc(x.msg || x)}${x.where ? `<br><span class="qt-muted">«${esc(x.where)}»</span>` : ''}</li>`).join('');
  app.innerHTML = `<section class="qt-review">
    <div class="qt-ebar"><a class="qt-btn qt-btn-ghost" href="#ai">← Xưởng</a>${badge(job.status)}
      <div class="qt-seg"><button type="button" data-rw="390" class="active">📱</button><button type="button" data-rw="1200">🖥</button></div>
      <div class="qt-ebar-right">
        <button class="qt-btn qt-btn-primary" data-rv="approve"${canApprove ? '' : ' disabled'} title="${esc(why)}">✅ Duyệt xuất bản</button>
        <button class="qt-btn" data-rv="changes"${art.status === 'draft' ? '' : ' disabled'}>✏️ Yêu cầu chỉnh sửa</button>
        <a class="qt-btn qt-btn-ghost" href="#sua/${esc(art.id)}">Sửa tay</a></div></div>
    ${why ? `<p class="qt-hint">${esc(why)}</p>` : ''}
    <p class="qt-alert qt-ai-busy" id="qt-ai-busy" hidden></p>
    <div class="qt-rv-cols">
      <div class="qt-rv-stage"><iframe id="qt-rv-frame" title="Xem trước bài như khách hàng thấy"></iframe></div>
      <aside class="qt-rv-side">
        <div class="qt-card"><h3>Kiểm tra chất lượng · ${qa.score}/100</h3>
          ${qa.errors.length ? `<p><strong>Cần xử lý trước khi duyệt</strong></p><ul class="qt-rv-list">${li(qa.errors, 'qt-rv-err')}</ul>` : ''}
          ${qa.warnings.length ? `<p><strong>OWNER nên xem</strong></p><ul class="qt-rv-list">${li(qa.warnings, 'qt-rv-warn')}</ul>` : ''}
          ${qa.passed.length ? `<ul class="qt-rv-list">${li(qa.passed, 'qt-rv-ok')}</ul>` : ''}
          ${pend.length ? `<p class="qt-muted">${pend.length} ảnh chưa tạo.${job.image_errors && job.image_errors.length ? ` Lỗi gần nhất: ${esc(job.image_errors[0].msg)}` : ''}</p><button class="qt-btn qt-sm" data-rv="images">↻ Tạo ảnh còn thiếu</button>` : ''}</div>
        ${notes.length ? `<div class="qt-card"><h3>Ghi chú biên tập (chưa xác minh)</h3><ul class="qt-rv-list">${li(notes, 'qt-rv-warn')}</ul></div>` : ''}
        <div class="qt-card"><h3>Nguồn — bấm để kiểm tra</h3><ol class="qt-rv-list">${(art.sources || []).map(s => { const o = typeof s === 'string' ? { title: s } : s; return `<li>${o.url ? `<a href="${esc(o.url)}" target="_blank" rel="noopener nofollow">${esc(o.title)}</a>` : `${esc(o.title)} <span class="qt-muted">(không có link)</span>`}</li>`; }).join('')}</ol></div>
        <div class="qt-card"><h3>Phiên bản (${vers.length})</h3><ol class="qt-rv-list">${vers.slice().reverse().map(v => `<li>v${v.version} · ${v.author === 'ai' ? 'AI' : 'OWNER'} · ${esc(fmt(v.created_at))}<br><span class="qt-muted">${esc(v.note)}</span>${v.version < vers.length ? ` <button class="qt-btn qt-btn-ghost qt-sm" data-rv="restore" data-v="${v.version}">Khôi phục</button>` : ''}</li>`).join('')}</ol></div>
        <div class="qt-card"><h3>Nhật ký</h3><ul class="qt-rv-list">${(job.history || []).slice().reverse().slice(0, 12).map(h => `<li><span class="qt-muted">${esc(fmt(h.at))}</span> ${esc(h.msg)}</li>`).join('')}</ul></div>
      </aside></div></section>`;
  const fr = $('#qt-rv-frame'); fr.srcdoc = renderPreviewPage(art); fr.style.width = '390px';
  app.onclick = null;
  $('.qt-review').addEventListener('click', async e => {
    const w = e.target.closest('[data-rw]');
    if (w) { $$('[data-rw]').forEach(x => x.classList.toggle('active', x === w)); fr.style.width = w.dataset.rw + 'px'; return; }
    const b = e.target.closest('[data-rv]'); if (!b || b.disabled) return;
    try {
      if (b.dataset.rv === 'approve') { location.hash = `#duyet-xb/${art.id}`; return; }   // mở trình soạn + hộp xác nhận xuất bản 5 mục
      if (b.dataset.rv === 'changes') {
        const note = await new Promise(res => {
          C.modal(`<h2>Yêu cầu chỉnh sửa</h2><p class="qt-muted">Ghi rõ cần sửa gì. Bản hiện tại được lưu thành một phiên bản trước khi AI sửa.</p>
            <textarea id="qt-rv-note" rows="5" maxlength="4000" placeholder="Ví dụ: Mở bài ngắn hơn; thêm phần chim non mùa lạnh; bỏ câu về…"></textarea>
            <div class="qt-modal-act"><button class="qt-btn" data-close>Hủy</button><button class="qt-btn qt-btn-primary" id="qt-rv-go">Gửi góp ý</button></div>`, () => res(null));
          $('#qt-rv-go').onclick = () => { const v = $('#qt-rv-note').value; C.acceptModal(); res(v); };
        });
        if (note == null) return;
        await P.requestChanges(deps(), job.id, note);
        if (await C.confirmBox('Đã ghi góp ý. Cho AI sửa ngay bây giờ?', 'AI sửa ngay')) await busy('AI đang sửa theo góp ý…', p => P.reviseJob(deps(), job.id, { onProgress: p }));
      }
      if (b.dataset.rv === 'images') await busy('Đang tạo ảnh…', p => P.runJob(deps(), job.id, { onProgress: p }));
      if (b.dataset.rv === 'restore') { if (!(await C.confirmBox(`Khôi phục phiên bản v${b.dataset.v}? Bản hiện tại vẫn được lưu trong lịch sử.`, 'Khôi phục'))) return; await P.restoreVersion(deps(), art.id, Number(b.dataset.v)); const j = await deps().store.getJob(job.id); await deps().store.saveJob({ ...j, step: 'qa', status: 'qa' }); await P.runJob(deps(), job.id); }
    } catch (err) { C.toast((err && err.message) || String(err), 8000); }
    renderReview(C, job.id);
  });
}
export async function pendingReviewCount(ctx) {
  C = ctx; try { return (await makeStore().listJobs()).filter(j => j.status === 'awaiting_owner').length; } catch { return null; }
}
