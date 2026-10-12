// Cẩm nang — dữ liệu ở data/guides.js. Trang danh sách (#cam-nang) và trang bài (#cam-nang/<id>).

const GUIDE_HEALTH_CATEGORY = 'Sức khỏe và an toàn';
let guideState = { cat: 'Tất cả', q: '' };

function guideById(id){ return guideData.find(g => g.id === id); }

function renderHomeGuides(){
  const grid = document.getElementById('home-guide-grid');
  const items = CONTENT.homeGuideIds.map(guideById).filter(Boolean);
  grid.innerHTML = items.map(g => `
    <article class="guide-card">
      <span class="guide-cat-tag">${esc(g.category)}</span>
      <h3>${esc(g.title)}</h3>
      <p>${esc(g.excerpt)}</p>
      <a class="btn btn-outline btn-sm" href="#cam-nang/${attr(g.id)}">Đọc bài</a>
    </article>`).join('');
}

function renderGuideListPage(el){
  el.innerHTML = `
    <a class="back-link" href="#">← Trang chủ</a>
    <h1>Cẩm nang nuôi Yến Phụng</h1>
    <p class="page-lead">Kiến thức nền tảng giúp bạn chuẩn bị đúng trước khi đón chim về, chăm sóc an toàn và nhận biết sớm các dấu hiệu bất thường.</p>
    <input type="search" class="guide-search" id="guide-search-input" placeholder="Tìm theo tiêu đề hoặc nội dung..." aria-label="Tìm bài cẩm nang" value="${attr(guideState.q)}">
    <div class="guide-filter-row" id="guide-filter-row"></div>
    <div class="guide-page-list" id="guide-list"></div>`;
  el.querySelector('#guide-search-input').addEventListener('input', e => { guideState.q = e.target.value; renderGuideList(); });
  renderGuideFilters();
  renderGuideList();
}

function renderGuideFilters(){
  const row = document.getElementById('guide-filter-row');
  row.innerHTML = guideCategories.map(c =>
    `<button type="button" class="chip ${c === guideState.cat ? 'active' : ''}" data-cat="${attr(c)}">${esc(c)}</button>`).join('');
  row.querySelectorAll('.chip').forEach(btn => btn.addEventListener('click', () => {
    guideState.cat = btn.dataset.cat; renderGuideFilters(); renderGuideList();
  }));
}

function renderGuideList(){
  const listEl = document.getElementById('guide-list');
  const q = guideState.q.trim().toLowerCase();
  let items = guideData.filter(g => guideState.cat === 'Tất cả' || g.category === guideState.cat);
  if (q) items = items.filter(g => (g.title + ' ' + g.excerpt + ' ' + g.content).toLowerCase().includes(q));
  listEl.innerHTML = items.length
    ? items.map(g => `
      <a class="guide-list-item" href="#cam-nang/${attr(g.id)}">
        <span class="guide-cat-tag">${esc(g.category)}</span>
        <h2 style="font-size:15px;font-weight:600;margin-bottom:4px">${esc(g.title)}</h2>
        <p>${esc(g.excerpt)}</p>
      </a>`).join('')
    : '<div class="guide-list-empty">Không tìm thấy bài viết phù hợp.</div>';
}

function renderGuideArticlePage(el, id){
  const g = guideById(id);
  if (!g) {
    document.title = 'Không tìm thấy bài — ' + SITE.brandName;
    el.innerHTML = `<a class="back-link" href="#cam-nang">← Tất cả bài cẩm nang</a>
      <div class="notice"><h1>Không tìm thấy bài viết</h1><p>Bài này có thể đã được đổi tên. Xem danh sách bài cẩm nang để tìm lại.</p>
      <a class="btn btn-outline" href="#cam-nang">Xem cẩm nang</a></div>`;
    return;
  }
  document.title = g.title + ' — ' + SITE.brandName;
  // Không đặt lời mời mua chim sau nội dung về bệnh / cấp cứu.
  const isHealth = g.category === GUIDE_HEALTH_CATEGORY || g.warning;
  const foot = isHealth
    ? `<a class="btn btn-outline" href="#cam-nang">← Các bài cẩm nang khác</a>`
    : `<a class="btn btn-outline" href="#cam-nang">← Các bài cẩm nang khác</a>
       <a class="btn btn-primary" href="#chim">Xem các bé đang tìm chủ</a>`;
  el.innerHTML = `
    <a class="back-link" href="#cam-nang">← Tất cả bài cẩm nang</a>
    <article class="guide-article">
      <span class="guide-article-cat">${esc(g.category)}</span>
      <h1 class="guide-article-title">${esc(g.title)}</h1>
      <div class="guide-article-content">${g.content}</div>
      ${g.warning ? guideWarningBox : ''}
      <div class="guide-article-foot">${foot}</div>
    </article>`;
}
