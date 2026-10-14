// Phase 1R — tương tác trang công khai "Kiến thức chuyên sâu": lọc chủ đề, tìm kiếm, sao chép link,
// chia sẻ, phóng to ảnh. Nội dung đã được dựng sẵn ở server; script này chỉ là phần tăng cường.
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  let toastTimer;
  function toast(msg) {
    const t = $('#toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
  }
  function legacyCopy(text) {
    try { const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch (e) { return false; }
  }
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(() => true, () => legacyCopy(text));
    return Promise.resolve(legacyCopy(text));
  }

  // ---- lọc + tìm kiếm (trang thư viện) ----
  const grid = $('#kt-grid');
  if (grid && $('.kt-filters')) {
    const q = $('#kt-q'); const empty = $('#kt-empty');
    const params = new URLSearchParams(location.search);
    let topic = params.get('chu-de') || '';
    const apply = () => {
      const term = (q.value || '').trim().toLowerCase();
      let shown = 0;
      $$('.kt-card', grid).forEach(c => {
        const ok = (!topic || c.dataset.topic === topic) && (!term || c.dataset.search.includes(term));
        c.hidden = !ok; if (ok) shown++;
      });
      $$('.kt-filter').forEach(b => b.classList.toggle('active', b.dataset.topic === topic));
      if (empty && $$('.kt-card', grid).length) { empty.hidden = shown > 0; empty.textContent = 'Không tìm thấy bài phù hợp.'; }
    };
    $$('.kt-filter').forEach(b => b.addEventListener('click', () => {
      topic = b.dataset.topic;
      const u = new URL(location.href); topic ? u.searchParams.set('chu-de', topic) : u.searchParams.delete('chu-de');
      history.replaceState(null, '', u); apply();
    }));
    q.addEventListener('input', apply);
    apply();
  }

  // ---- sao chép link / chia sẻ ----
  document.addEventListener('click', e => {
    const c = e.target.closest('[data-copy-link]');
    if (c) {
      const link = c.getAttribute('data-copy-link') || location.href.split('#')[0];
      copy(link).then(ok => toast(ok ? 'Đã sao chép link — dán vào Zalo hoặc Facebook để gửi.' : link));
      return;
    }
    const s = e.target.closest('[data-share]');
    if (s) {
      const url = s.dataset.share, title = s.dataset.title;
      if (navigator.share) navigator.share({ title, url }).catch(() => {});
      else copy(url).then(ok => toast(ok ? 'Đã sao chép link bài viết.' : url));
      return;
    }
    const z = e.target.closest('[data-zoom]');
    if (z) {
      const lb = $('#kt-lightbox'); if (!lb) return;
      const img = $('img', lb); const inner = $('img', z);
      img.src = z.dataset.zoom; img.alt = inner ? inner.alt : '';
      lb.hidden = false; $('.kt-lb-close', lb).focus();
    }
  });
  // ---- thanh tiến độ đọc + đánh dấu mục đang đọc trong mục lục (trang bài) ----
  const bar = $('.kt-progress span'), body = $('.kt-body');
  if (bar && body) {
    const links = $$('.kt-toc a'); const heads = links.map(a => document.getElementById(decodeURIComponent(a.hash.slice(1)))).filter(Boolean);
    let ticking = false;
    const update = () => {
      ticking = false;
      const r = body.getBoundingClientRect(); const total = r.height - window.innerHeight * 0.6;
      bar.style.transform = `scaleX(${Math.min(1, Math.max(0, -r.top / (total > 0 ? total : 1)))})`;
      let cur = -1; heads.forEach((h, i) => { if (h.getBoundingClientRect().top < 120) cur = i; });
      links.forEach((a, i) => a.classList.toggle('on', i === cur));
    };
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }

  const lb = $('#kt-lightbox');
  if (lb) {
    const close = () => { lb.hidden = true; $('img', lb).src = ''; };
    lb.addEventListener('click', e => { if (e.target === lb || e.target.closest('.kt-lb-close')) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !lb.hidden) close(); });
  }
})();
