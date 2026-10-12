// Tiện ích giao diện dùng chung: escape, toast, copy, Zalo, lightbox, placeholder asset.

function esc(s){ const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
function attr(s){ return esc(s).replace(/"/g, '&quot;'); }

function showToast(text){
  const t = document.getElementById('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove('show'), 3200);
}

// Clipboard API cần secure context (https/localhost); có fallback cho file:// và trình duyệt cũ.
function copyText(text){
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).then(() => true, () => legacyCopy(text));
  }
  return Promise.resolve(legacyCopy(text));
}
function legacyCopy(text){
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) { return false; }
}

function zaloMessageFor(code){ return SITE.zaloCopyTemplate.replace('{code}', code); }

// Gắn vào <a href="zaloUrl" data-zalo-code="..."> : copy câu hỏi kèm mã trước khi trình duyệt mở Zalo.
// Không chặn điều hướng — nếu copy thất bại, link Zalo vẫn mở và số điện thoại luôn hiển thị.
document.addEventListener('click', e => {
  const a = e.target.closest('[data-zalo-code]');
  if (a) {
    const code = a.getAttribute('data-zalo-code');
    copyText(zaloMessageFor(code)).then(ok => {
      showToast(ok ? 'Đã copy mã bé — dán vào Zalo để nhận video thực tế nhé.' : 'Nhớ gửi mã bé ' + code + ' khi nhắn Zalo nhé.');
    });
    return;
  }
  const c = e.target.closest('[data-copy-code]');
  if (c) {
    const code = c.getAttribute('data-copy-code');
    copyText(code).then(ok => showToast(ok ? 'Đã copy mã ' + code : 'Mã bé: ' + code));
  }
});

// Khối giữ chỗ trung tính cho asset OWNER chưa cung cấp. Không bao giờ là hình chim.
function assetPlaceholder(assetId, text){
  return `<div class="asset-ph" data-asset-id="${attr(assetId)}" role="img" aria-label="${attr(text || 'Ảnh đang được cập nhật')}"><strong>${esc(text || 'Ảnh đang được cập nhật')}</strong></div>`;
}

// Ảnh chim chỉ hiển thị khi không nằm trong danh sách ảnh cũ chưa được duyệt.
function isApprovedMedia(url){
  return !!url && !SITE.legacyUnapprovedMedia.includes(url);
}

// ---------- LIGHTBOX ----------
const LB = { urls: [], idx: 0, startX: null, label: '' };
function openLightbox(urls, idx, label){
  if (!urls || !urls.length) return;
  LB.urls = urls; LB.idx = idx || 0; LB.label = label || '';
  renderLightbox();
  document.getElementById('lightbox').classList.add('open');
}
function renderLightbox(){
  document.getElementById('lightbox-img').src = LB.urls[LB.idx] || '';
  const multi = LB.urls.length > 1;
  document.querySelectorAll('.lightbox-nav').forEach(b => b.hidden = !multi);
  document.getElementById('lightbox-count').textContent = [LB.label, multi ? (LB.idx + 1) + ' / ' + LB.urls.length : ''].filter(Boolean).join(' · ');
}
function closeLightbox(){ document.getElementById('lightbox').classList.remove('open'); }
function lightboxNav(dir){
  if (LB.urls.length < 2) return;
  LB.idx = (LB.idx + dir + LB.urls.length) % LB.urls.length;
  renderLightbox();
}
(function initLightbox(){
  const lb = document.getElementById('lightbox');
  lb.addEventListener('click', e => { if (e.target === lb) closeLightbox(); });
  lb.addEventListener('touchstart', e => { LB.startX = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', e => {
    if (LB.startX == null) return;
    const dx = e.changedTouches[0].clientX - LB.startX;
    if (Math.abs(dx) > 40) lightboxNav(dx < 0 ? 1 : -1);
    LB.startX = null;
  });
  document.addEventListener('keydown', e => {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowRight') lightboxNav(1);
    if (e.key === 'ArrowLeft') lightboxNav(-1);
  });
})();

// ---------- POSTER VIEWER (catalogue) ----------
// Modal xem poster: nút đóng, Esc, bấm nền để đóng, khoá cuộn trang, giữ focus trong modal,
// trả focus về nút đã mở. Nút "Phóng to" (hoặc chạm vào ảnh) chuyển sang kích thước gốc để
// kéo/cuộn đọc chữ trên mobile. Không dùng thư viện ngoài.
const PV = { opener: null };
function openPosterViewer(opts, opener){
  const v = document.getElementById('poster-viewer');
  const img = document.getElementById('pv-img');
  PV.opener = opener || document.activeElement;
  img.src = opts.src;
  img.alt = opts.alt || '';
  document.getElementById('pv-title').textContent = opts.title || '';
  document.getElementById('pv-note').textContent = opts.note || '';
  setPosterZoom(false);
  v.classList.add('open');
  v.setAttribute('aria-hidden', 'false');
  document.documentElement.classList.add('scroll-lock');
  document.getElementById('pv-close').focus();
}
function closePosterViewer(){
  const v = document.getElementById('poster-viewer');
  if (!v.classList.contains('open')) return;
  v.classList.remove('open');
  v.setAttribute('aria-hidden', 'true');
  document.documentElement.classList.remove('scroll-lock');
  if (PV.opener && PV.opener.focus) PV.opener.focus();
}
function setPosterZoom(on){
  const v = document.getElementById('poster-viewer');
  v.classList.toggle('zoomed', on);
  const b = document.getElementById('pv-zoom');
  b.textContent = on ? 'Thu nhỏ' : 'Phóng to';
  b.setAttribute('aria-pressed', String(on));
  document.getElementById('pv-body').scrollTo(0, 0);
}
(function initPosterViewer(){
  const v = document.getElementById('poster-viewer');
  if (!v) return;
  document.getElementById('pv-close').addEventListener('click', closePosterViewer);
  document.getElementById('pv-zoom').addEventListener('click', () => setPosterZoom(!v.classList.contains('zoomed')));
  document.getElementById('pv-img').addEventListener('click', () => setPosterZoom(!v.classList.contains('zoomed')));
  // Bấm vào nền (ngoài ảnh và thanh công cụ) để đóng
  v.addEventListener('click', e => { if (e.target === v || e.target.id === 'pv-body') closePosterViewer(); });
  document.addEventListener('keydown', e => {
    if (!v.classList.contains('open')) return;
    if (e.key === 'Escape') { e.preventDefault(); closePosterViewer(); }
    if (e.key === 'Tab') {
      const f = [document.getElementById('pv-zoom'), document.getElementById('pv-close')];
      const i = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  });
})();
