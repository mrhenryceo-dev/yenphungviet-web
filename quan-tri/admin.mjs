// Phase 1R / R1 — KHUNG trang quản trị "Kiến thức chuyên sâu" (một OWNER duy nhất).
// - Đăng nhập Supabase Auth (email + mật khẩu). Quyền = app_metadata.kt_role === 'owner' (RLS kiểm tra lại ở database).
// - Danh sách bài, tìm kiếm/lọc, soạn bài theo khối, xem trước desktop/mobile, lưu nháp, xuất bản, ẩn, xóa có xác nhận.
// - Tải ảnh từ máy + nén WebP + chọn điểm lấy nét bằng cách bấm vào ảnh: làm ở R4 (hiện nhập đường dẫn ảnh).
// - Chế độ thử LOCAL: chỉ khi chạy trên 127.0.0.1/localhost với ?dev=1 → lưu trong localStorage, không gọi Supabase.
import { KT, topicName } from '/assets/kt/config.mjs';
import { renderPreviewPage, imgSrc, isSlug, esc } from '/assets/kt/render.mjs';

const DEV = ['127.0.0.1', 'localhost'].includes(location.hostname) && new URLSearchParams(location.search).get('dev') === '1';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const app = $('#qt-app');

// ---------- tiện ích ----------
let toastTimer;
function toast(msg, ms = 3200) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms); }
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + Math.random().toString(16).slice(2));
const clone = o => JSON.parse(JSON.stringify(o));
export function slugify(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');
}
const fmt = iso => (iso ? new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const STATUS = { draft: 'Nháp', published: 'Công khai', hidden: 'Đã ẩn' };

// ---------- lớp dữ liệu ----------
let sb = null;
const MIGRATION_HINT = 'Chưa có bảng kt_articles. OWNER cần duyệt và chạy migration SQL (supabase/kt_r1_migration.sql).';
function dbError(e) {
  const m = (e && (e.message || e.error_description)) || String(e);
  if (/kt_articles|PGRST205|42P01|relation .* does not exist|schema cache/i.test(m)) return MIGRATION_HINT;
  if (/row-level security|permission denied|42501/i.test(m)) return 'Không có quyền. Tài khoản cần app_metadata.kt_role = "owner" (bước 2 của migration).';
  if (/^kt: /.test(m)) return m.replace(/^kt: /, 'Không xuất bản được: ');
  return m;
}
const LS_KEY = 'kt_dev_articles';
const devStore = {
  all() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; } },
  put(list) { localStorage.setItem(LS_KEY, JSON.stringify(list)); }
};
const store = {
  async list() {
    if (DEV) return devStore.all().sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
    const { data, error } = await sb.from('kt_articles').select('id,slug,topic,title,status,excerpt,cover,updated_at,published_at').order('updated_at', { ascending: false });
    if (error) throw error; return data;
  },
  async get(id) {
    if (DEV) return devStore.all().find(a => a.id === id) || null;
    const { data, error } = await sb.from('kt_articles').select('*').eq('id', id).single();
    if (error) throw error; return data;
  },
  async save(a) {
    const row = { ...a }; delete row.created_at;
    if (DEV) {
      validateServerSide(row);
      const list = devStore.all(); const now = new Date().toISOString();
      if (row.status === 'published' && !row.published_at) row.published_at = now;
      row.updated_at = now; if (!row.id) row.id = uid();
      if (list.some(x => x.slug === row.slug && x.id !== row.id)) throw new Error('duplicate key value violates unique constraint "kt_articles_slug_key"');
      const i = list.findIndex(x => x.id === row.id); i >= 0 ? (list[i] = row) : list.push(row); devStore.put(list); return row;
    }
    const q = row.id ? sb.from('kt_articles').update(row).eq('id', row.id) : sb.from('kt_articles').insert(row);
    const { data, error } = await q.select('*').single();
    if (error) throw error; return data;
  },
  async remove(id) {
    if (DEV) { devStore.put(devStore.all().filter(a => a.id !== id)); return; }
    const { error } = await sb.from('kt_articles').delete().eq('id', id);
    if (error) throw error;
  }
};
// Mô phỏng trigger của database ở chế độ thử (database thật luôn kiểm tra lại).
function validateServerSide(r) {
  if (r.status !== 'published') return;
  if (!r.seo_description) throw new Error('kt: thiếu mô tả SEO (seo_description)');
  if (!(r.cover && r.cover.path)) throw new Error('kt: thiếu ảnh bìa (cover.path)');
  if (!(r.sources && r.sources.length)) throw new Error('kt: cần ít nhất 1 nguồn tham khảo (sources)');
  if (!r.reviewed_by_owner) throw new Error('kt: OWNER chưa xác nhận checklist chuyên môn (reviewed_by_owner)');
}

// ---------- đăng nhập ----------
async function boot() {
  if (DEV) { $('#qt-dev').hidden = false; $('#qt-user').textContent = 'OWNER (thử local)'; return route(); }
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  sb = createClient(KT.supabaseUrl, KT.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  const { data } = await sb.auth.getSession();
  if (!data.session) return renderLogin();
  if (!isOwner(data.session.user)) return renderNoAccess(data.session.user);
  return afterLogin(data.session.user);
}
// Nếu tài khoản đã bật MFA → bắt nhập mã OTP (nâng phiên lên aal2) trước khi vào trang quản trị.
async function afterLogin(user) {
  const { data: aal, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!error && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') return renderMfaChallenge(user);
  showUser(user); route();
}
function renderMfaChallenge(user) {
  app.innerHTML = `<section class="qt-login"><h1>Xác thực 2 lớp</h1><p class="qt-muted">Mở ứng dụng xác thực (Google Authenticator, Microsoft Authenticator…) và nhập mã 6 số cho YẾN PHỤNG PET.</p>
    <form id="qt-mfa-form" class="qt-card"><label>Mã 6 số<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label>
    <button class="qt-btn qt-btn-primary" type="submit">Xác nhận</button><p class="qt-err" id="qt-mfa-err"></p></form>
    <button class="qt-btn qt-btn-ghost" id="qt-mfa-out">Đăng xuất</button></section>`;
  $('#qt-mfa-out').onclick = async () => { await sb.auth.signOut(); location.href = '/quan-tri/'; };
  $('#qt-mfa-form').addEventListener('submit', async e => {
    e.preventDefault(); const code = e.target.code.value.trim();
    const { data: f } = await sb.auth.mfa.listFactors();
    const factor = f && f.totp && f.totp.find(x => x.status === 'verified');
    if (!factor) { $('#qt-mfa-err').textContent = 'Không tìm thấy thiết bị xác thực đã đăng ký.'; return; }
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    if (error) { $('#qt-mfa-err').textContent = 'Mã không đúng hoặc đã hết hạn. Thử lại với mã mới.'; return; }
    showUser(user); route();
  });
}
const isOwner = u => !!(u && u.app_metadata && u.app_metadata.kt_role === 'owner');
function showUser(u) {
  $('#qt-user').innerHTML = `${esc(u.email)} · <a href="#bao-mat">Bảo mật</a>`;
  const b = $('#qt-logout'); b.hidden = false; b.onclick = async () => { await sb.auth.signOut(); location.href = '/quan-tri/'; };
}
// Đăng ký MFA (TOTP): Supabase chỉ cho chính người dùng đăng ký trong ứng dụng, không bật từ Dashboard.
async function renderSecurity() {
  if (DEV) { app.innerHTML = '<div class="qt-alert">Xác thực 2 lớp chỉ dùng được khi đăng nhập thật (không có ở chế độ thử local).</div><a class="qt-btn" href="#">← Danh sách</a>'; return; }
  const { data: f } = await sb.auth.mfa.listFactors();
  const verified = (f && f.totp || []).filter(x => x.status === 'verified');
  if (verified.length) {
    app.innerHTML = `<section class="qt-login"><h1>Bảo mật</h1><div class="qt-card"><p>✅ Xác thực 2 lớp <strong>đang bật</strong> (${verified.length} thiết bị).</p>
      <p class="qt-muted">Để bắt buộc mã OTP cho mọi thao tác ghi, OWNER chạy BƯỚC 4 trong file migration SQL.</p></div><a class="qt-btn" href="#">← Danh sách</a></section>`;
    return;
  }
  for (const x of (f && f.all) || []) if (x.status === 'unverified') await sb.auth.mfa.unenroll({ factorId: x.id });
  const { data: en, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'YENPHUNGPET-' + Date.now() });
  if (error) { app.innerHTML = `<div class="qt-alert">Không bật được xác thực 2 lớp: ${esc(error.message)}</div><a class="qt-btn" href="#">← Danh sách</a>`; return; }
  const qr = String(en.totp.qr_code || '');
  app.innerHTML = `<section class="qt-login"><h1>Bật xác thực 2 lớp</h1><div class="qt-card">
    <p>1. Mở ứng dụng xác thực trên điện thoại và quét mã QR:</p>
    ${/^data:image\/svg\+xml/.test(qr) ? `<img class="qt-qr" src="${esc(qr)}" alt="Mã QR xác thực 2 lớp" width="200" height="200">` : ''}
    <p class="qt-muted">Không quét được? Nhập khóa thủ công: <code>${esc(en.totp.secret)}</code></p>
    <form id="qt-enroll"><label>2. Nhập mã 6 số đang hiện trong ứng dụng<input name="code" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" required></label>
    <button class="qt-btn qt-btn-primary" type="submit">Xác nhận và bật</button><p class="qt-err" id="qt-enroll-err"></p></form></div>
    <a class="qt-btn qt-btn-ghost" href="#">Để sau</a></section>`;
  $('#qt-enroll').addEventListener('submit', async e => {
    e.preventDefault();
    const { error: ve } = await sb.auth.mfa.challengeAndVerify({ factorId: en.id, code: e.target.code.value.trim() });
    if (ve) { $('#qt-enroll-err').textContent = 'Mã chưa đúng. Đợi mã mới rồi nhập lại.'; return; }
    toast('Đã bật xác thực 2 lớp.', 4000); renderSecurity();
  });
}

function renderLogin(msg = '') {
  app.innerHTML = `<section class="qt-login"><h1>Đăng nhập quản trị</h1><p class="qt-muted">Chỉ dành cho OWNER YẾN PHỤNG PET.</p>
    <form id="qt-login-form" class="qt-card"><label>Email<input type="email" name="email" autocomplete="username" required></label>
    <label>Mật khẩu<input type="password" name="password" autocomplete="current-password" required></label>
    <button class="qt-btn qt-btn-primary" type="submit">Đăng nhập</button><p class="qt-err" id="qt-login-err">${esc(msg)}</p></form></section>`;
  $('#qt-login-form').addEventListener('submit', async e => {
    e.preventDefault(); const f = e.target; const btn = $('button', f); btn.disabled = true; btn.textContent = 'Đang đăng nhập…';
    const { data, error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
    btn.disabled = false; btn.textContent = 'Đăng nhập';
    if (error) { $('#qt-login-err').textContent = 'Không đăng nhập được: ' + (error.message === 'Invalid login credentials' ? 'sai email hoặc mật khẩu.' : error.message); return; }
    if (!isOwner(data.user)) return renderNoAccess(data.user);
    afterLogin(data.user);
  });
}
function renderNoAccess(u) {
  app.innerHTML = `<section class="qt-login"><h1>Không có quyền quản trị</h1><p>Tài khoản <strong>${esc(u.email)}</strong> chưa được cấp quyền OWNER.</p>
    <p class="qt-muted">Nếu vừa chạy bước gán quyền trong SQL, hãy đăng xuất rồi đăng nhập lại.</p><button class="qt-btn" id="qt-out">Đăng xuất</button></section>`;
  $('#qt-out').onclick = async () => { await sb.auth.signOut(); location.href = '/quan-tri/'; };
}

// ---------- điều hướng trong trang ----------
window.addEventListener('hashchange', route);
function route() {
  const h = location.hash.replace(/^#/, '');
  if (h === 'bao-mat') return renderSecurity();
  if (h === 'moi') return renderEditor(null);
  if (h.startsWith('sua/')) return renderEditor(h.slice(4));
  return renderList();
}

// ---------- danh sách bài ----------
let listState = { q: '', status: '', topic: '' };
async function renderList() {
  app.innerHTML = '<p class="qt-loading">Đang tải danh sách…</p>';
  let rows = [];
  try { rows = await store.list(); } catch (e) { app.innerHTML = `<div class="qt-alert">${esc(dbError(e))}</div>`; return; }
  const opts = (arr, cur) => arr.map(([v, t]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(t)}</option>`).join('');
  app.innerHTML = `<section class="qt-list"><div class="qt-list-head"><h1>Bài viết <span class="qt-muted">(${rows.length})</span></h1><a class="qt-btn qt-btn-primary" href="#moi">+ Bài mới</a></div>
    <div class="qt-filters"><input type="search" id="qt-q" placeholder="Tìm theo tiêu đề…" value="${esc(listState.q)}">
      <select id="qt-fs">${opts([['', 'Mọi trạng thái'], ['draft', 'Nháp'], ['published', 'Công khai'], ['hidden', 'Đã ẩn']], listState.status)}</select>
      <select id="qt-ft">${opts([['', 'Mọi chủ đề'], ...KT.topics.map(t => [t.id, t.name])], listState.topic)}</select></div>
    <div id="qt-rows" class="qt-rows"></div></section>`;
  const draw = () => {
    const q = listState.q.toLowerCase();
    const list = rows.filter(r => (!listState.status || r.status === listState.status) && (!listState.topic || r.topic === listState.topic) && (!q || (r.title || '').toLowerCase().includes(q)));
    $('#qt-rows').innerHTML = list.length ? list.map(r => {
      const thumb = r.cover && imgSrc(r.cover.path_sm || r.cover.path);
      return `<article class="qt-row"><div class="qt-row-img">${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy">` : ''}</div>
        <div class="qt-row-main"><a class="qt-row-title" href="#sua/${esc(r.id)}">${esc(r.title || '(chưa có tiêu đề)')}</a>
        <div class="qt-row-meta"><span class="qt-badge qt-badge--${esc(r.status)}">${esc(STATUS[r.status] || r.status)}</span> ${esc(topicName(r.topic))} · sửa ${esc(fmt(r.updated_at))}</div></div>
        <div class="qt-row-act"><a class="qt-btn" href="#sua/${esc(r.id)}">Sửa</a>${r.status === 'published' && isSlug(r.slug) ? `<a class="qt-btn qt-btn-ghost" href="${KT.basePath}${esc(r.slug)}/" target="_blank" rel="noopener">Xem ↗</a>` : ''}</div></article>`;
    }).join('') : `<p class="qt-empty">${rows.length ? 'Không có bài phù hợp bộ lọc.' : 'Chưa có bài nào. Bấm “+ Bài mới” để bắt đầu.'}</p>`;
  };
  $('#qt-q').oninput = e => { listState.q = e.target.value; draw(); };
  $('#qt-fs').onchange = e => { listState.status = e.target.value; draw(); };
  $('#qt-ft').onchange = e => { listState.topic = e.target.value; draw(); };
  draw();
}

// ---------- định nghĩa khối ----------
const IMG = () => ({ path: '', path_sm: '', w: 1600, h: 1000, alt: '', caption: '', focus: { x: 50, y: 50 }, ai: true });
const TYPES = {
  text:       { name: 'Văn bản', ic: '¶', make: () => ({ type: 'text', md: '' }) },
  image:      { name: 'Ảnh lớn', ic: '🖼', make: () => ({ type: 'image', ratio: '16:9', img: IMG() }) },
  image_left: { name: 'Ảnh trái, chữ phải', ic: '◧', make: () => ({ type: 'image_text', side: 'left', split: 50, ratio: '4:3', img: IMG(), md: '' }) },
  image_right:{ name: 'Chữ trái, ảnh phải', ic: '◨', make: () => ({ type: 'image_text', side: 'right', split: 50, ratio: '4:3', img: IMG(), md: '' }) },
  gallery:    { name: 'Bộ ảnh', ic: '▦', make: () => ({ type: 'gallery', ratio: '1:1', caption: '', imgs: [IMG(), IMG()] }) },
  note:       { name: 'Khung kiến thức', ic: '💡', make: () => ({ type: 'note', icon: '💡', title: '', md: '' }) },
  warning:    { name: 'Khung cảnh báo', ic: '⚠️', make: () => ({ type: 'warning', title: 'Lưu ý quan trọng', md: '' }) },
  checklist:  { name: 'Checklist', ic: '☑', make: () => ({ type: 'checklist', title: '', items: [] }) },
  table:      { name: 'Bảng so sánh', ic: '▤', make: () => ({ type: 'table', caption: '', head: ['Cột 1', 'Cột 2'], rows: [['', '']] }) },
  faq:        { name: 'FAQ', ic: '❓', make: () => ({ type: 'faq', title: 'Câu hỏi thường gặp', items: [{ q: '', a_md: '' }] }) },
  cta:        { name: 'Nút CTA', ic: '➜', make: () => ({ type: 'cta', kind: 'zalo', label: 'Nhắn Zalo ' + KT.phone }) }
};
const blockName = b => b.type === 'image_text' ? (b.side === 'right' ? TYPES.image_right.name : TYPES.image_left.name) : (TYPES[b.type] || { name: b.type }).name;

const NEW_ARTICLE = () => ({ id: null, slug: '', topic: 'co-ban', title: '', subtitle: '', excerpt: '', seo_title: '', seo_description: '',
  cover: IMG(), blocks: [TYPES.text.make()], sources: [], reviewed_by_owner: false, status: 'draft' });

// ---------- trình soạn ----------
let A = null; let dirty = false; let slugTouched = false;
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

async function renderEditor(id) {
  app.innerHTML = '<p class="qt-loading">Đang mở bài…</p>';
  try { A = id ? await store.get(id) : NEW_ARTICLE(); } catch (e) { app.innerHTML = `<div class="qt-alert">${esc(dbError(e))}</div>`; return; }
  if (!A) { app.innerHTML = '<div class="qt-alert">Không tìm thấy bài.</div><a class="qt-btn" href="#">← Danh sách</a>'; return; }
  A = { ...NEW_ARTICLE(), ...clone(A) }; A.cover = { ...IMG(), ...(A.cover || {}) };
  dirty = false; slugTouched = !!A.slug;
  drawEditor();
}

function imgFields(path, img, label) {
  const src = imgSrc(img.path);
  return `<fieldset class="qt-img"><legend>${esc(label)}</legend>
    <div class="qt-img-row"><div class="qt-img-thumb">${src ? `<img src="${esc(src)}" alt="" style="object-position:${Number(img.focus && img.focus.x) || 50}% ${Number(img.focus && img.focus.y) || 50}%">` : '<span>Chưa có ảnh</span>'}</div>
    <div class="qt-img-fields">
      <label>Đường dẫn ảnh <input data-k="${path}.path" value="${esc(img.path)}" placeholder="/assets/… hoặc khóa trong bucket"></label>
      <label>Bản nhỏ (điện thoại) <input data-k="${path}.path_sm" value="${esc(img.path_sm || '')}" placeholder="tùy chọn"></label>
      <div class="qt-2col"><label>Rộng (px)<input type="number" data-k="${path}.w" data-num value="${esc(img.w)}"></label><label>Cao (px)<input type="number" data-k="${path}.h" data-num value="${esc(img.h)}"></label></div>
      <div class="qt-2col"><label>Lấy nét ngang %<input type="number" min="0" max="100" data-k="${path}.focus.x" data-num value="${esc(img.focus ? img.focus.x : 50)}"></label><label>Lấy nét dọc %<input type="number" min="0" max="100" data-k="${path}.focus.y" data-num value="${esc(img.focus ? img.focus.y : 50)}"></label></div>
    </div></div>
    <label>Alt text (mô tả ảnh) <input data-k="${path}.alt" value="${esc(img.alt || '')}"></label>
    <label>Chú thích <input data-k="${path}.caption" value="${esc(img.caption || '')}"></label>
    <label class="qt-check"><input type="checkbox" data-k="${path}.ai" data-bool${img.ai !== false ? ' checked' : ''}> Ảnh minh họa (AI) — hiện nhãn “Ảnh minh họa”</label>
    <p class="qt-hint">Tải ảnh từ máy, tự nén WebP và bấm vào ảnh để chọn điểm lấy nét: có ở bước R4. Chỉ dùng ảnh của trại hoặc ảnh có quyền sử dụng.</p></fieldset>`;
}
const mdBox = (path, val, rows = 5) => `<div class="qt-md"><div class="qt-md-tools" data-for="${path}">
  <button type="button" data-md="bold" title="Đậm"><b>B</b></button><button type="button" data-md="italic" title="Nghiêng"><i>I</i></button>
  <button type="button" data-md="link" title="Liên kết">🔗</button><button type="button" data-md="h2">H2</button><button type="button" data-md="h3">H3</button>
  <button type="button" data-md="ul" title="Danh sách">•</button><button type="button" data-md="ol" title="Danh sách số">1.</button></div>
  <textarea data-k="${path}" rows="${rows}">${esc(val || '')}</textarea></div>`;
const sel = (path, cur, options) => `<select data-k="${path}"${typeof options[0][0] === 'number' ? ' data-num' : ''}>${options.map(([v, t]) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
const RATIO_OPTS = [['16:9', '16:9 (ngang)'], ['4:3', '4:3'], ['1:1', '1:1 (vuông)']];

function blockForm(b, i) {
  const p = `blocks.${i}`;
  switch (b.type) {
    case 'text': return mdBox(`${p}.md`, b.md, 7);
    case 'image': return `<label>Tỉ lệ khung ${sel(`${p}.ratio`, b.ratio, RATIO_OPTS)}</label>` + imgFields(`${p}.img`, b.img, 'Ảnh');
    case 'image_text': return `<div class="qt-3col"><label>Vị trí ảnh ${sel(`${p}.side`, b.side, [['left', 'Ảnh bên trái'], ['right', 'Ảnh bên phải']])}</label>
        <label>Độ rộng ảnh ${sel(`${p}.split`, b.split, [[50, '50%'], [40, '40%']])}</label><label>Tỉ lệ ${sel(`${p}.ratio`, b.ratio, RATIO_OPTS)}</label></div>`
      + imgFields(`${p}.img`, b.img, 'Ảnh') + '<label class="qt-lbl">Nội dung bên cạnh ảnh</label>' + mdBox(`${p}.md`, b.md, 5);
    case 'gallery': return `<div class="qt-2col"><label>Tỉ lệ ${sel(`${p}.ratio`, b.ratio, RATIO_OPTS)}</label><label>Chú thích chung<input data-k="${p}.caption" value="${esc(b.caption || '')}"></label></div>`
      + (b.imgs || []).map((im, j) => imgFields(`${p}.imgs.${j}`, im, `Ảnh ${j + 1}`) + `<button type="button" class="qt-btn qt-btn-ghost qt-sm" data-act="gal-del" data-i="${i}" data-j="${j}"${b.imgs.length <= 2 ? ' disabled' : ''}>Bỏ ảnh ${j + 1}</button>`).join('')
      + `<button type="button" class="qt-btn qt-sm" data-act="gal-add" data-i="${i}"${(b.imgs || []).length >= 4 ? ' disabled' : ''}>+ Thêm ảnh (tối đa 4)</button>`;
    case 'note': return `<div class="qt-2col"><label>Biểu tượng ${sel(`${p}.icon`, b.icon, [['💡', '💡 Mẹo'], ['📌', '📌 Ghi nhớ'], ['✅', '✅ Nên làm']])}</label><label>Tiêu đề<input data-k="${p}.title" value="${esc(b.title || '')}"></label></div>` + mdBox(`${p}.md`, b.md, 4);
    case 'warning': return `<label>Tiêu đề<input data-k="${p}.title" value="${esc(b.title || '')}"></label>` + mdBox(`${p}.md`, b.md, 4);
    case 'checklist': return `<label>Tiêu đề<input data-k="${p}.title" value="${esc(b.title || '')}"></label><label>Các bước (mỗi dòng một bước)<textarea data-k="${p}.items" data-lines rows="5">${esc((b.items || []).join('\n'))}</textarea></label>`;
    case 'table': return `<label>Tiêu đề bảng<input data-k="${p}.caption" value="${esc(b.caption || '')}"></label>
      <label>Tên cột (ngăn cách bằng dấu |, tối đa 5 cột)<input data-k="${p}.head" data-cells value="${esc((b.head || []).join(' | '))}"></label>
      <label>Các hàng (mỗi dòng một hàng, ô ngăn cách bằng dấu |)<textarea data-k="${p}.rows" data-grid rows="6">${esc((b.rows || []).map(r => r.join(' | ')).join('\n'))}</textarea></label>`;
    case 'faq': return `<label>Tiêu đề<input data-k="${p}.title" value="${esc(b.title || '')}"></label>`
      + (b.items || []).map((it, j) => `<fieldset class="qt-faq"><legend>Câu ${j + 1}</legend><label>Câu hỏi<input data-k="${p}.items.${j}.q" value="${esc(it.q || '')}"></label>
        <label>Trả lời</label>${mdBox(`${p}.items.${j}.a_md`, it.a_md, 3)}<button type="button" class="qt-btn qt-btn-ghost qt-sm" data-act="faq-del" data-i="${i}" data-j="${j}">Xóa câu ${j + 1}</button></fieldset>`).join('')
      + `<button type="button" class="qt-btn qt-sm" data-act="faq-add" data-i="${i}">+ Thêm câu hỏi</button>`;
    case 'cta': return `<div class="qt-2col"><label>Loại nút ${sel(`${p}.kind`, b.kind, [['zalo', 'Nhắn Zalo ' + KT.phone], ['article', 'Xem bài liên quan'], ['copy_link', 'Sao chép link bài']])}</label>
        <label>Chữ trên nút<input data-k="${p}.label" value="${esc(b.label || '')}"></label></div>
      ${b.kind === 'article' ? `<label>Đường dẫn bài liên quan (slug)<input data-k="${p}.slug" value="${esc(b.slug || '')}" placeholder="vi-du-vong-doi-yen-phung"></label>` : ''}`;
    default: return '<p class="qt-muted">Khối không hỗ trợ.</p>';
  }
}

function addMenu(at) {
  return `<div class="qt-add"><button type="button" class="qt-add-btn" data-act="add-open" data-at="${at}">+ Thêm khối</button>
    <div class="qt-add-menu" data-menu="${at}" hidden>${Object.entries(TYPES).map(([k, t]) => `<button type="button" data-act="add" data-at="${at}" data-type="${k}"><span>${t.ic}</span>${esc(t.name)}</button>`).join('')}</div></div>`;
}

function drawEditor() {
  const a = A; const topicOpts = KT.topics.map(t => [t.id, t.name]);
  app.innerHTML = `<section class="qt-editor">
  <div class="qt-ebar"><a class="qt-btn qt-btn-ghost" href="#" data-act="back">← Danh sách</a>
    <span class="qt-badge qt-badge--${esc(a.status)}">${esc(STATUS[a.status])}</span><span class="qt-saved" id="qt-saved">${a.updated_at ? 'Lưu lúc ' + esc(fmt(a.updated_at)) : 'Chưa lưu'}</span>
    <div class="qt-ebar-right"><button type="button" class="qt-btn" data-act="preview">👁 Xem trước</button><button type="button" class="qt-btn" data-act="save">💾 Lưu nháp</button>
      ${a.status === 'published' ? '<button type="button" class="qt-btn" data-act="hide">Ẩn bài</button>' : '<button type="button" class="qt-btn qt-btn-primary" data-act="publish">Xuất bản</button>'}
      ${a.id ? '<button type="button" class="qt-btn qt-btn-danger" data-act="delete">Xóa</button>' : ''}</div></div>
  <div class="qt-ecols">
   <aside class="qt-meta qt-card"><h2>Thông tin bài</h2>
    <label>Tiêu đề *<input data-k="title" value="${esc(a.title)}" maxlength="140"></label>
    <label>Phụ đề<input data-k="subtitle" value="${esc(a.subtitle)}" maxlength="220"></label>
    <label>Chủ đề ${sel('topic', a.topic, topicOpts)}</label>
    <label>Đường dẫn (slug) <input data-k="slug" id="qt-slug" value="${esc(a.slug)}" maxlength="80"></label>
    <p class="qt-hint" id="qt-url">${esc(KT.siteUrl + KT.basePath + (a.slug || '…') + '/')}</p>
    <label>Mô tả ngắn (trên thẻ bài)<textarea data-k="excerpt" rows="3" maxlength="300">${esc(a.excerpt)}</textarea></label>
    ${imgFields('cover', a.cover, 'Ảnh bìa (cũng dùng khi chia sẻ link)')}
    <h3>SEO và chia sẻ</h3>
    <label>Tiêu đề SEO <span class="qt-count" data-count="seo_title">${(a.seo_title || '').length}/70</span><input data-k="seo_title" value="${esc(a.seo_title)}" maxlength="70" placeholder="Để trống = dùng tiêu đề"></label>
    <label>Mô tả SEO * <span class="qt-count" data-count="seo_description">${(a.seo_description || '').length}/170</span><textarea data-k="seo_description" rows="3" maxlength="170">${esc(a.seo_description)}</textarea></label>
    <h3>Nguồn tham khảo *</h3>
    <label>Mỗi dòng một nguồn (tên tài liệu, có thể kèm link https)<textarea data-k="sources" data-lines rows="4">${esc((a.sources || []).map(s => (typeof s === 'string' ? s : s.title || '')).join('\n'))}</textarea></label>
   </aside>
   <div class="qt-blocks"><h2>Nội dung bài <span class="qt-muted">(${a.blocks.length} khối)</span></h2>
    ${addMenu(0)}
    ${a.blocks.map((b, i) => `<div class="qt-block qt-card" data-i="${i}"><div class="qt-block-head"><span class="qt-block-n">${i + 1}</span><strong>${esc(blockName(b))}</strong>
      <div class="qt-block-tools"><button type="button" data-act="up" data-i="${i}" title="Lên"${i === 0 ? ' disabled' : ''}>↑</button><button type="button" data-act="down" data-i="${i}" title="Xuống"${i === a.blocks.length - 1 ? ' disabled' : ''}>↓</button>
      <button type="button" data-act="dup" data-i="${i}" title="Nhân bản">⧉</button><button type="button" data-act="del" data-i="${i}" title="Xóa khối">🗑</button></div></div>
      <div class="qt-block-body">${blockForm(b, i)}</div></div>${addMenu(i + 1)}`).join('')}
   </div></div></section>`;
}

// ---------- ghi giá trị từ form vào bài ----------
function setPath(obj, path, val) {
  const ks = path.split('.'); let o = obj;
  for (let i = 0; i < ks.length - 1; i++) { const k = /^\d+$/.test(ks[i]) ? Number(ks[i]) : ks[i]; if (o[k] == null) o[k] = /^\d+$/.test(ks[i + 1]) ? [] : {}; o = o[k]; }
  o[/^\d+$/.test(ks.at(-1)) ? Number(ks.at(-1)) : ks.at(-1)] = val;
}
function readInput(el) {
  if (el.hasAttribute('data-bool')) return el.checked;
  if (el.hasAttribute('data-num')) return Number(el.value) || 0;
  if (el.hasAttribute('data-lines')) return el.value.split('\n').map(s => s.trim()).filter(Boolean);
  if (el.hasAttribute('data-cells')) return el.value.split('|').map(s => s.trim()).slice(0, 5);
  if (el.hasAttribute('data-grid')) return el.value.split('\n').filter(l => l.trim()).map(l => l.split('|').map(s => s.trim()));
  return el.value;
}
app.addEventListener('input', e => {
  const el = e.target; const k = el.dataset && el.dataset.k; if (!k || !A) return;
  setPath(A, k, readInput(el)); dirty = true; $('#qt-saved').textContent = 'Có thay đổi chưa lưu';
  if (k === 'title' && !slugTouched) { A.slug = slugify(A.title); const s = $('#qt-slug'); if (s) s.value = A.slug; }
  if (k === 'slug') { slugTouched = true; }
  if (k === 'title' || k === 'slug') $('#qt-url').textContent = KT.siteUrl + KT.basePath + (A.slug || '…') + '/';
  const c = $(`[data-count="${k}"]`); if (c) c.textContent = `${el.value.length}/${el.maxLength}`;
});
app.addEventListener('change', e => {
  const el = e.target; const k = el.dataset && el.dataset.k; if (!k || !A) return;
  setPath(A, k, readInput(el)); dirty = true;
  if (/\.(kind|side)$|\.path$|focus/.test(k)) drawEditor();          // đổi bố cục / ảnh → vẽ lại phần xem nhanh
});

// ---------- thao tác ----------
function mdWrap(tools, kind) {
  const ta = tools.parentElement.querySelector('textarea'); const s = ta.selectionStart, e = ta.selectionEnd; const v = ta.value; const selTxt = v.slice(s, e) || 'chữ';
  const lineStart = v.lastIndexOf('\n', s - 1) + 1;
  let out, cur;
  if (kind === 'bold') { out = v.slice(0, s) + `**${selTxt}**` + v.slice(e); cur = s + selTxt.length + 4; }
  else if (kind === 'italic') { out = v.slice(0, s) + `*${selTxt}*` + v.slice(e); cur = s + selTxt.length + 2; }
  else if (kind === 'link') { out = v.slice(0, s) + `[${selTxt}](https://)` + v.slice(e); cur = s + selTxt.length + 3 + 8; }
  else { const pre = { h2: '## ', h3: '### ', ul: '- ', ol: '1. ' }[kind]; out = v.slice(0, lineStart) + pre + v.slice(lineStart); cur = e + pre.length; }
  ta.value = out; ta.focus(); ta.setSelectionRange(cur, cur); ta.dispatchEvent(new Event('input', { bubbles: true }));
}
app.addEventListener('click', async e => {
  const t = e.target.closest('[data-act], [data-md]'); if (!t) return;
  if (t.dataset.md) return mdWrap(t.closest('.qt-md-tools'), t.dataset.md);
  const act = t.dataset.act; const i = Number(t.dataset.i);
  const B = A && A.blocks;
  switch (act) {
    case 'back': e.preventDefault(); if (!dirty || await confirmBox('Bài có thay đổi chưa lưu. Rời trang mà không lưu?', 'Rời trang')) { dirty = false; location.hash = ''; } return;
    case 'add-open': { const m = $(`[data-menu="${t.dataset.at}"]`); $$('.qt-add-menu').forEach(x => { if (x !== m) x.hidden = true; }); m.hidden = !m.hidden; return; }
    case 'add': B.splice(Number(t.dataset.at), 0, TYPES[t.dataset.type].make()); break;
    case 'up': if (i > 0) [B[i - 1], B[i]] = [B[i], B[i - 1]]; break;
    case 'down': if (i < B.length - 1) [B[i + 1], B[i]] = [B[i], B[i + 1]]; break;
    case 'dup': B.splice(i + 1, 0, clone(B[i])); break;
    case 'del': if (!(await confirmBox(`Xóa khối ${i + 1} (${blockName(B[i])})?`, 'Xóa khối'))) return; B.splice(i, 1); break;
    case 'gal-add': if (B[i].imgs.length < 4) B[i].imgs.push(IMG()); break;
    case 'gal-del': if (B[i].imgs.length > 2) B[i].imgs.splice(Number(t.dataset.j), 1); break;
    case 'faq-add': B[i].items.push({ q: '', a_md: '' }); break;
    case 'faq-del': B[i].items.splice(Number(t.dataset.j), 1); break;
    case 'preview': return openPreview();
    case 'save': return save();
    case 'publish': return publish();
    case 'hide': return setStatus('hidden');
    case 'delete': return del();
    default: return;
  }
  dirty = true; drawEditor();
});

function problems(a) {
  const p = [];
  if (!a.title || a.title.length < 3) p.push('Thiếu tiêu đề.');
  if (!isSlug(a.slug)) p.push('Đường dẫn (slug) chưa hợp lệ: chỉ chữ thường không dấu, số và dấu gạch nối, 3–80 ký tự.');
  return p;
}
async function save(extra = {}) {
  const p = problems(A); if (p.length) { toast(p[0], 4500); return false; }
  const btn = $('[data-act="save"]'); if (btn) { btn.disabled = true; btn.textContent = 'Đang lưu…'; }
  try {
    const row = { ...A, ...extra }; if (!row.id) delete row.id;
    const saved = await store.save(row);
    A = { ...NEW_ARTICLE(), ...saved }; dirty = false;
    if (location.hash !== '#sua/' + A.id) history.replaceState(null, '', '#sua/' + A.id);
    drawEditor(); toast('Đã lưu.'); return true;
  } catch (e) { toast(dbError(e), 6000); if (btn) { btn.disabled = false; btn.textContent = '💾 Lưu nháp'; } return false; }
}
const CHECKS = [
  'Có ít nhất 1 nguồn tham khảo đáng tin cậy cho các khẳng định chuyên môn',
  'Không khẳng định giới tính chỉ từ ảnh không rõ cere',
  'Không suy luận gene ẩn từ phenotype (ngoại hình)',
  'Không khuyến khích người mới tự đút bột chim chưa cai sữa',
  'Ảnh AI đã gắn nhãn “Ảnh minh họa”, không dùng làm bằng chứng tuổi, giới tính hay mutation'
];
async function publish() {
  const miss = problems(A);
  if (!A.seo_description) miss.push('Thiếu mô tả SEO.');
  if (!(A.cover && A.cover.path)) miss.push('Thiếu ảnh bìa.');
  if (!(A.sources && A.sources.length)) miss.push('Thiếu nguồn tham khảo.');
  if (miss.length) return modal(`<h2>Chưa xuất bản được</h2><ul>${miss.map(m => `<li>${esc(m)}</li>`).join('')}</ul><div class="qt-modal-act"><button class="qt-btn" data-close>Đã hiểu</button></div>`);
  const ok = await new Promise(res => {
    modal(`<h2>Xác nhận trước khi xuất bản</h2><p class="qt-muted">Tick đủ 5 mục để bật nút Xuất bản.</p>
      ${CHECKS.map((c, k) => `<label class="qt-check"><input type="checkbox" class="qt-pub-ck" data-k2="${k}"> ${esc(c)}</label>`).join('')}
      <div class="qt-modal-act"><button class="qt-btn" data-close>Hủy</button><button class="qt-btn qt-btn-primary" id="qt-pub-go" disabled>Xuất bản</button></div>`, () => res(false));
    $$('.qt-pub-ck').forEach(c => c.onchange = () => { $('#qt-pub-go').disabled = !$$('.qt-pub-ck').every(x => x.checked); });
    $('#qt-pub-go').onclick = () => { acceptModal(); res(true); };
  });
  if (!ok) return;
  if (await save({ status: 'published', reviewed_by_owner: true })) {
    const url = KT.siteUrl + KT.basePath + A.slug + '/';
    modal(`<h2>Đã xuất bản 🎉</h2><p>Bài sẽ hiện trên website trong khoảng 1–5 phút.</p><p class="qt-url">${esc(url)}</p>
      <div class="qt-modal-act"><button class="qt-btn" data-copy="${esc(url)}">Sao chép link để gửi khách</button><a class="qt-btn qt-btn-ghost" href="${esc(url)}" target="_blank" rel="noopener">Mở bài ↗</a><button class="qt-btn qt-btn-primary" data-close>Xong</button></div>`);
  }
}
async function setStatus(s) {
  if (s === 'hidden' && !(await confirmBox('Ẩn bài khỏi website? Bài vẫn được giữ lại và có thể xuất bản lại.', 'Ẩn bài'))) return;
  await save({ status: s });
}
async function del() {
  const ok = await new Promise(res => {
    modal(`<h2>Xóa vĩnh viễn bài viết?</h2><p>Gõ lại chính xác tiêu đề để xác nhận:</p><p class="qt-url">${esc(A.title)}</p>
      <input id="qt-del-in" autocomplete="off"><div class="qt-modal-act"><button class="qt-btn" data-close>Hủy</button><button class="qt-btn qt-btn-danger" id="qt-del-go" disabled>Xóa vĩnh viễn</button></div>`, () => res(false));
    $('#qt-del-in').oninput = e => { $('#qt-del-go').disabled = e.target.value.trim() !== A.title.trim(); };
    $('#qt-del-go').onclick = () => { acceptModal(); res(true); };
  });
  if (!ok) return;
  try { await store.remove(A.id); dirty = false; toast('Đã xóa bài.'); location.hash = ''; }
  catch (e) { toast(dbError(e), 6000); }
}

// ---------- modal + xem trước ----------
let onModalClose = null;
function modal(html, onClose) { $('#qt-modal-body').innerHTML = html; $('#qt-modal').hidden = false; onModalClose = onClose || null; }
function closeModal() { $('#qt-modal').hidden = true; const f = onModalClose; onModalClose = null; if (f) f(); }   // = Hủy
function acceptModal() { onModalClose = null; $('#qt-modal').hidden = true; }                                  // = Đồng ý
$('#qt-modal').addEventListener('click', e => {
  if (e.target.id === 'qt-modal' || e.target.closest('[data-close]')) return closeModal();
  const c = e.target.closest('[data-copy]');
  if (c) navigator.clipboard.writeText(c.dataset.copy).then(() => toast('Đã sao chép link.'), () => toast(c.dataset.copy));
});
function confirmBox(text, okLabel) {
  return new Promise(res => {
    modal(`<p>${esc(text)}</p><div class="qt-modal-act"><button class="qt-btn" data-close>Hủy</button><button class="qt-btn qt-btn-danger" id="qt-ok">${esc(okLabel)}</button></div>`, () => res(false));
    $('#qt-ok').onclick = () => { acceptModal(); res(true); };
  });
}
function openPreview() {
  const fr = $('#qt-preview-frame');
  fr.srcdoc = renderPreviewPage(A);
  $('#qt-preview').hidden = false;
}
$('#qt-preview').addEventListener('click', e => {
  const w = e.target.closest('[data-w]');
  if (w) { $$('#qt-preview [data-w]').forEach(b => b.classList.toggle('active', b === w)); $('#qt-preview-frame').style.width = w.dataset.w + 'px'; }
  if (e.target.id === 'qt-preview-close') $('#qt-preview').hidden = true;
});

boot().catch(e => { app.innerHTML = `<div class="qt-alert">Không khởi động được trang quản trị: ${esc(e.message)}</div>`; });
