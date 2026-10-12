// Khởi động trang, điều hướng hash, render các section homepage, form liên hệ.

const HOME_TITLE = document.title;
const HOME_SECTIONS = ['chim-dang-tim-chu', 'cach-nhan-chim', 'hop-voi-ban', 'mau-dong-home', 'hau-truong', 'cam-nang-home', 'faq', 'lien-he'];

// ---------- BRAND / CONTACT (đọc từ config) ----------
// Chiều cao header (sticky) → dùng cho thanh chọn Level dính và scroll-margin.
function syncHeaderHeight(){
  document.documentElement.style.setProperty('--header-h', document.querySelector('header').offsetHeight + 'px');
}

function renderBrand(){
  document.querySelectorAll('[data-brand]').forEach(el => el.textContent = SITE.brandName);
  document.querySelectorAll('[data-tagline]').forEach(el => el.textContent = SITE.tagline);
  document.querySelectorAll('[data-phone]').forEach(el => el.textContent = SITE.phone);
  document.querySelectorAll('[data-tel]').forEach(el => el.setAttribute('href', 'tel:' + SITE.phone));
  document.querySelectorAll('[data-zalo]').forEach(el => el.setAttribute('href', SITE.zaloUrl));
  const logo = SITE.assets.logo;
  if (logo.ready) {
    document.querySelector('.brand').innerHTML = `<img class="brand-logo" src="${attr(logo.path)}" width="${logo.width}" height="${logo.height}" alt="${attr(SITE.brandName)}">`;
  }
}

function renderHero(){
  document.getElementById('hero-lead').textContent = CONTENT.hero.lead;
  document.getElementById('hero-points').innerHTML = SITE.positioning.map(p => `<li>${esc(p)}</li>`).join('');
  const box = document.getElementById('hero-visual');
  const hero = SITE.assets.hero;
  if (hero.ready) {
    box.className = 'hero-visual';
    box.removeAttribute('data-asset-id');
    box.innerHTML = `<img src="${attr(hero.path)}"${hero.srcset ? ` srcset="${attr(hero.srcset)}" sizes="${attr(hero.sizes)}"` : ''} width="${hero.width || ''}" height="${hero.height || ''}" alt="${attr(hero.alt)}" loading="eager" fetchpriority="high" decoding="async">`;
  } else {
    // HERO-01 chưa có: khối thương hiệu trung tính, không có hình chim.
    box.className = 'hero-brand-panel';
    box.setAttribute('data-asset-id', hero.id);
    box.innerHTML = `
      <div class="ph-brand">${esc(SITE.brandName)}</div>
      <div class="ph-tag">${esc(SITE.tagline)}</div>
      <ul class="hero-facts">
        <li><strong>Trại</strong>${esc(SITE.location)}</li>
        <li><strong>Liên hệ</strong>${esc(SITE.contactName)} · <a href="tel:${attr(SITE.phone)}">${esc(SITE.phone)}</a></li>
        <li><strong>Tư vấn</strong>${esc(SITE.consultHours)}</li>
      </ul>`;
  }
}

// Các nhóm chim tại trại (Phase 1L). CTA mở Zalo và copy sẵn câu hỏi của nhóm (data-zalo-msg, ui.js).
function renderBirdGroups(){
  const G = CONTENT.groups;
  document.getElementById('groups-eyebrow').textContent = G.eyebrow;
  document.getElementById('groups-title').textContent = G.title;
  document.getElementById('groups-lead').textContent = G.lead;
  document.getElementById('groups-note').textContent = G.note;
  document.getElementById('group-grid').innerHTML = G.items.map((g, n) => `
    <article class="group-card tone-${attr(g.tone)}" id="nhom-${attr(g.id)}">
      <div class="group-photo">
        <img src="${attr(g.image)}" alt="${attr(g.alt)}" width="${g.width}" height="${g.height}" loading="lazy" decoding="async">
        <span class="group-num" aria-hidden="true">0${n + 1}</span>
        ${AI_BADGE}
      </div>
      <div class="group-body">
        <h3>${esc(g.name)}</h3>
        <p class="group-meta">${esc(g.meta)}</p>
        <p class="group-price"><span class="gp-label">${esc(g.priceLabel)}</span><strong>${esc(g.price)}</strong><span class="gp-tag">${esc(g.priceTag)}</span></p>
        <ul class="group-points">${g.points.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
        ${g.warning ? `<p class="group-warning" role="note"><strong>Lưu ý quan trọng:</strong> ${esc(g.warning)}</p>` : ''}
        ${g.caution ? `<p class="group-caution">${esc(g.caution)}</p>` : ''}
        <a class="btn btn-lg btn-block group-cta" href="${attr(SITE.zaloUrl)}" target="_blank" rel="noopener" data-zalo-msg="${attr(g.zaloMsg)}">${esc(g.cta)}</a>
      </div>
    </article>`).join('');
}

function renderSteps(){
  document.getElementById('steps').innerHTML = CONTENT.steps.map(s => `<li><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></li>`).join('');
  document.getElementById('steps-note').textContent = CONTENT.stepsNote;
}

function renderFit(){
  document.getElementById('fit-intro').textContent = CONTENT.fit.intro;
  document.getElementById('fit-grid').innerHTML = CONTENT.fit.cards.map(c => `<div class="fit-card"><h3>${esc(c.title)}</h3><p>${esc(c.text)}</p></div>`).join('');
}

// Hậu trường: chỉ nội dung THẬT tại trại do OWNER cung cấp (không dùng AI).
// Đang tắt (features.farm=false). Ít hơn 3 ảnh → ẩn cả section.
function renderFarm(){
  const sec = document.getElementById('hau-truong');
  const items = SITE.features.farm ? SITE.assets.farm.filter(a => a.ready) : [];
  if (items.length < 3) { sec.hidden = true; return; }
  sec.hidden = false;
  document.getElementById('farm-title').textContent = CONTENT.farm.title;
  document.getElementById('farm-lead').textContent = CONTENT.farm.lead;
  const urls = items.map(a => a.path);
  const grid = document.getElementById('farm-grid');
  grid.innerHTML = items.map((a, i) => `<button type="button" class="farm-item" data-fi="${i}" aria-label="Phóng to ảnh"><img src="${attr(a.path)}" alt="${attr(a.alt || 'Ảnh thật tại trại ' + SITE.brandName)}" loading="lazy"></button>`).join('');
  grid.querySelectorAll('.farm-item').forEach(b => b.addEventListener('click', () => openLightbox(urls, Number(b.dataset.fi))));
  const tiktok = document.getElementById('farm-tiktok');
  if (SITE.social.tiktok) { tiktok.href = SITE.social.tiktok; tiktok.hidden = false; }
}

function renderFaq(){
  let i = 0;
  document.getElementById('faq-list').innerHTML = FAQ_GROUPS.map(g => `
    <div class="faq-group">
      <h3>${esc(g.title)}</h3>
      ${g.items.map(f => { const n = i++; return `
        <div class="faq-item" id="faq-${n}">
          <button type="button" class="faq-q" aria-expanded="false" aria-controls="faq-a-${n}" data-faq="${n}"><span>${esc(f[0])}</span><span class="ic" aria-hidden="true">+</span></button>
          <div class="faq-a" id="faq-a-${n}" role="region"><div class="faq-a-inner">${esc(f[1])}</div></div>
        </div>`; }).join('')}
    </div>`).join('');
  document.querySelectorAll('.faq-q').forEach(b => b.addEventListener('click', () => toggleFaq(Number(b.dataset.faq))));
}
function toggleFaq(n){
  const item = document.getElementById('faq-' + n);
  const body = document.getElementById('faq-a-' + n);
  const isOpen = item.classList.contains('open');
  document.querySelectorAll('.faq-item.open').forEach(el => {
    el.classList.remove('open'); el.querySelector('.faq-a').style.maxHeight = null;
    el.querySelector('.faq-q').setAttribute('aria-expanded', 'false');
  });
  if (!isOpen) {
    item.classList.add('open'); body.style.maxHeight = body.scrollHeight + 'px';
    item.querySelector('.faq-q').setAttribute('aria-expanded', 'true');
  }
}

function renderContact(){
  document.getElementById('contact-lead').textContent = CONTENT.contact.lead;
  document.getElementById('form-title').textContent = CONTENT.contact.formTitle;
  document.getElementById('form-lead').textContent = CONTENT.contact.formLead;
  const list = document.getElementById('contact-list');
  let html = `<li><span class="lbl">Người phụ trách</span><span>${esc(SITE.contactName)}</span></li>`;
  html += `<li><span class="lbl">Khu vực</span><span>${esc(SITE.location)}</span></li>`;
  html += `<li><span class="lbl">Tư vấn</span><span>${esc(SITE.consultHours)}</span></li>`;
  if (SITE.social.tiktok) html += `<li><span class="lbl">TikTok</span><a href="${attr(SITE.social.tiktok)}" target="_blank" rel="noopener">Xem video trên TikTok</a></li>`;
  if (SITE.social.facebook) html += `<li><span class="lbl">Facebook</span><a href="${attr(SITE.social.facebook)}" target="_blank" rel="noopener">Trang Facebook</a></li>`;
  if (SITE.social.youtube) html += `<li><span class="lbl">YouTube</span><a href="${attr(SITE.social.youtube)}" target="_blank" rel="noopener">Kênh YouTube</a></li>`;
  list.innerHTML = html;
  const p = SITE.assets.contactPortrait;
  if (SITE.features.contactPortrait && p.ready) {
    const box = document.getElementById('contact-person');
    box.innerHTML = `<img src="${attr(p.path)}" alt="${attr(p.alt)}"><span>${esc(SITE.contactName)}</span>`;
    box.hidden = false;
  }
}

function renderFooter(){
  document.getElementById('year').textContent = new Date().getFullYear();
  document.getElementById('footer-location').textContent = SITE.location;
  const tt = document.getElementById('footer-tiktok');
  if (SITE.social.tiktok) { tt.href = SITE.social.tiktok; tt.hidden = false; }
}

// ---------- FORM ----------
// notify-lead (Edge Function) chưa được kiểm tra nội dung. Để giữ tương thích, vẫn gửi đủ
// các khoá của form cũ; các trường đã bỏ khỏi form gửi chuỗi rỗng (không gửi giá trị mặc định).
function detectSource(){
  const p = new URLSearchParams(location.search);
  const s = (p.get('source') || p.get('utm_source') || '').toLowerCase();
  if (s.includes('tiktok')) return 'TikTok';
  if (s.includes('youtube')) return 'YouTube';
  if (s.includes('facebook') || s.includes('fb')) return 'Facebook';
  if (s.includes('zalo')) return 'Zalo';
  return s || 'Link trực tiếp';
}

function initForm(){
  const form = document.getElementById('lead-form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('submit-btn');
    const msg = document.getElementById('form-msg');
    msg.className = 'form-msg';
    const lead = {
      full_name: document.getElementById('f-name').value.trim(),
      contact: document.getElementById('f-contact').value.trim(),
      province: '',
      bird_code: document.getElementById('f-bird').value.trim(),
      interest_type: '',
      budget_range: '',
      experience_level: '',
      customer_note: document.getElementById('f-note').value.trim(),
      source_page: location.href,
      source: detectSource()
    };
    if (!lead.full_name || !lead.contact) {
      msg.textContent = 'Vui lòng nhập họ tên và số điện thoại / Zalo.'; msg.classList.add('show', 'err'); return;
    }
    if (!document.getElementById('f-consent').checked) {
      msg.textContent = 'Vui lòng đồng ý để chúng tôi có thể liên hệ lại.'; msg.classList.add('show', 'err'); return;
    }
    btn.disabled = true; btn.textContent = 'Đang gửi...';
    try {
      if (!sb) throw new Error('Supabase client unavailable');
      const { error } = await sb.functions.invoke(SITE.supabase.leadFunction, { body: lead });
      if (error) throw error;
      msg.textContent = 'Đã gửi thành công! ' + SITE.contactName + ' sẽ liên hệ lại với bạn.';
      msg.classList.add('show', 'ok');
      showToast('Gửi thành công — sẽ liên hệ lại sớm nhé!');
      form.reset();
    } catch (err) {
      console.error('Lỗi gửi form:', err);
      msg.textContent = 'Gửi không thành công. Vui lòng nhắn Zalo hoặc gọi ' + SITE.phone + '.';
      msg.classList.add('show', 'err');
    } finally {
      btn.disabled = false; btn.textContent = 'Gửi thông tin';
    }
  });
}

// ---------- ROUTER ----------
// ---------- MOBILE MENU (≤ 600px) ----------
function setMenu(open){
  const btn = document.getElementById('nav-toggle');
  document.getElementById('site-nav').classList.toggle('open', open);
  btn.setAttribute('aria-expanded', String(open));
  btn.setAttribute('aria-label', open ? 'Đóng menu' : 'Mở menu');
}
function initMenu(){
  const btn = document.getElementById('nav-toggle');
  btn.addEventListener('click', e => { e.stopPropagation(); setMenu(btn.getAttribute('aria-expanded') !== 'true'); });
  document.getElementById('site-nav').addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('click', e => { if (!e.target.closest('header')) setMenu(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });
}

function setNavActive(key){
  document.querySelectorAll('.site-nav a').forEach(a => a.classList.toggle('active', a.dataset.nav === key));
}

function route(){
  const raw = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  let [head, ...rest] = raw.split('/');
  const arg = rest.join('/');
  const home = document.getElementById('home');
  const page = document.getElementById('page');

  const showPage = (key, render) => {
    home.hidden = true; page.hidden = false; setNavActive(key);
    render(page);
    window.scrollTo(0, 0);
  };

  if (head === 'chim') {
    // Bé THẬT (không thuộc SITE.demoBirdCodes) vẫn có trang chi tiết riêng.
    if (arg && !isDemoCode(arg)) return showPage('chim', el => renderBirdDetailPage(el, arg));
    // Danh sách #chim cũ và hồ sơ demo không còn hiển thị → về 3 nhóm chim trên trang chủ.
    history.replaceState(null, '', location.pathname + location.search + '#chim-dang-tim-chu');
    if (arg) showToast(CONTENT.birds.demoRedirect);
    head = 'chim-dang-tim-chu';
  }
  if (head === 'cam-nang') {
    if (arg) return showPage('cam-nang', el => renderGuideArticlePage(el, arg));
    document.title = 'Cẩm nang — ' + SITE.brandName;
    return showPage('cam-nang', renderGuideListPage);
  }
  if (head === 'catalogue' || head === 'mau-dong') {
    if (catalogueEnabled()) {
      if (!arg) document.title = CONTENT.catalogue.title + ' — ' + SITE.brandName;
      return showPage('catalogue', el => renderCataloguePage(el, arg));
    }
    history.replaceState(null, '', location.pathname + location.search);
  }

  // Homepage (kể cả #lien-he, #faq… để cuộn tới section)
  const wasPage = !page.hidden;
  page.hidden = true; page.innerHTML = ''; home.hidden = false;
  // Teaser catalogue chỉ render khi homepage thực sự hiển thị → mở thẳng #catalogue
  // không tải 5 ảnh xem trước của homepage.
  if (!route.teaserDone) { renderHomeCatalogueTeaser(); route.teaserDone = true; }
  document.title = HOME_TITLE; setNavActive('');
  if (HOME_SECTIONS.includes(head)) {
    const target = document.getElementById(head);
    if (target && !target.hidden) requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
  } else if (wasPage) {
    window.scrollTo(0, 0);
  }
}

// ---------- INIT ----------
renderBrand();
renderHero();
renderBirdGroups();
renderSteps();
renderFit();
renderFarm();
renderHomeGuides();
renderFaq();
renderContact();
renderFooter();
initForm();
initMenu();
syncHeaderHeight();
if ('ResizeObserver' in window) new ResizeObserver(syncHeaderHeight).observe(document.querySelector('header'));
window.addEventListener('resize', syncHeaderHeight);
window.addEventListener('load', syncHeaderHeight);
document.querySelectorAll('[data-feature="catalogue"]').forEach(el => { el.hidden = !catalogueEnabled(); });
window.addEventListener('hashchange', () => { setMenu(false); closePosterViewer(); route(); });
route();
