// Phase 1M — trang /chon-nhom-choi: khách chọn nhu cầu → soạn tin nhắn → copy → mở Zalo.
// Chỉ chạy trong trình duyệt của khách. KHÔNG gửi dữ liệu đi đâu, KHÔNG ghi Supabase.

(function () {
  const form = document.getElementById('ncp-form');
  const msgBox = document.getElementById('ncp-message');
  const budget = document.getElementById('ncp-budget');
  let edited = false; // khách tự sửa tin nhắn → không ghi đè nữa cho tới khi đổi lựa chọn

  const picked = name => {
    const el = form.querySelector(`input[name="${name}"]:checked`);
    return el ? el.value : '';
  };

  function buildMessage(){
    return 'Chào Ji, mình đã đọc bài 4 nhóm chơi Yến Phụng.\n\n'
      + 'Nhóm mình quan tâm: ' + (picked('group') || '...') + '\n'
      + 'Số lượng dự kiến: ' + (picked('qty') || '...') + '\n'
      + 'Kinh nghiệm: ' + (picked('exp') || '...') + '\n'
      + 'Ngân sách: ' + (budget.value.trim() || '...') + '\n\n'
      + 'Nhờ Ji tư vấn giúp mình chọn chim phù hợp.';
  }
  function refresh(){ edited = false; msgBox.value = buildMessage(); }

  form.addEventListener('change', e => { if (e.target !== msgBox) refresh(); });
  budget.addEventListener('input', refresh);
  msgBox.addEventListener('input', () => { edited = true; });
  form.addEventListener('submit', e => e.preventDefault());
  refresh();

  // Nút "Tôi thuộc nhóm …" trong từng khu vực: chọn sẵn nhóm rồi cuộn tới phần tự chọn.
  document.querySelectorAll('[data-pick]').forEach(btn => btn.addEventListener('click', () => {
    const input = form.querySelector(`input[name="group"][value="${btn.dataset.pick}"]`);
    if (input) { input.checked = true; refresh(); }
    document.getElementById('chon-nhom').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));

  // ---------- copy + toast ----------
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
  function copyText(text){
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(() => true, () => legacyCopy(text));
    }
    return Promise.resolve(legacyCopy(text));
  }
  let toastTimer;
  function showToast(text){
    const t = document.getElementById('toast');
    t.textContent = text; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3600);
  }
  const currentMessage = () => (edited ? msgBox.value : buildMessage()).trim();

  // Nút chính: copy tin nhắn rồi để link Zalo mở như thường (không chặn điều hướng).
  document.getElementById('ncp-send').addEventListener('click', () => {
    copyText(currentMessage()).then(ok => showToast(ok
      ? 'Đã sao chép tin nhắn — dán vào Zalo để gửi cho Ji nhé.'
      : 'Chưa sao chép được. Hãy giữ ngón tay trên khung tin nhắn để sao chép thủ công.'));
  });
  document.getElementById('ncp-copy').addEventListener('click', () => {
    copyText(currentMessage()).then(ok => {
      showToast(ok ? 'Đã sao chép tin nhắn.' : 'Chưa sao chép được. Hãy chọn và sao chép trong khung tin nhắn.');
      if (!ok) { msgBox.focus(); msgBox.select(); }
    });
  });
})();
