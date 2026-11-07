// Trang /doi-tac/ V2.0. Không gửi dữ liệu đi đâu: chỉ sao chép câu chào và đánh dấu checklist trên máy người xem.
(function () {
  'use strict';

  function legacyCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(() => true, () => legacyCopy(text));
    return Promise.resolve(legacyCopy(text));
  }

  const toast = document.getElementById('toast');
  let toastTimer;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 4200);
  }

  // Nút Zalo: link vẫn mở bình thường; nếu sao chép được thì nhắc khách dán để tự gửi.
  document.querySelectorAll('a[data-msg]').forEach(a => a.addEventListener('click', () => {
    copyText(a.dataset.msg).then(ok => {
      showToast(ok ? 'Đã sao chép câu chào. Hãy dán vào Zalo rồi gửi cho Ji nhé!' : 'Zalo đang mở, bạn hãy chào Ji một câu nhé!');
    });
  }));

  const boxes = document.querySelectorAll('#prep-form input[type="checkbox"]');
  const progress = document.getElementById('prep-progress');
  boxes.forEach(b => b.addEventListener('change', () => {
    const n = [...boxes].filter(x => x.checked).length;
    progress.textContent = n === boxes.length ? 'Đủ 8/8 món rồi! Nhắn Ji để cùng xem lại nhé.' : 'Bạn đã có ' + n + '/8 món';
  }));

  // Hiện dần khi cuộn; bỏ qua nếu người xem chọn giảm chuyển động hoặc trình duyệt không hỗ trợ.
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
    const items = document.querySelectorAll('.v2-stories article, .v2-mosaic li, .v2-line li, .v2-tip-list li, .v2-steps li');
    const io = new IntersectionObserver(entries => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.remove('v2-pre'); io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -6% 0px' });
    items.forEach(el => {
      if (el.getBoundingClientRect().top > window.innerHeight) { el.classList.add('v2-pre'); io.observe(el); }
    });
  }
})();
