// Inventory — từng bé đăng riêng (dữ liệu từ Supabase bảng `birds`). Trang chủ bán theo 3 nhóm chim;
// danh sách #chim không còn hiển thị, chỉ trang chi tiết của bé THẬT (không thuộc SITE.demoBirdCodes) mở được.
// Ảnh trên website là ẢNH MINH HỌA màu/dòng (có thể dùng lại cho nhiều bé); video thực tế
// của đúng bé được gửi qua Zalo trước khi chốt. Ảnh không bao giờ dùng để chứng minh giới tính,
// tuổi, sức khỏe… — các thông tin đó chỉ lấy từ dữ liệu của bé.
// Quy tắc: không Level, không ảnh chưa duyệt, không bịa dữ liệu, trường trống = ẩn.

const sb = (window.supabase && window.supabase.createClient)
  ? window.supabase.createClient(SITE.supabase.url, SITE.supabase.anonKey)
  : null;

let birdsPromise = null;
function loadBirds(){
  if (!birdsPromise) {
    birdsPromise = (async () => {
      if (!sb) throw new Error('Supabase client unavailable');
      const { data, error } = await sb.from('birds').select('*')
        .eq('published', true)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    })();
    birdsPromise.catch(err => console.error('Lỗi tải danh sách chim:', err));
  }
  return birdsPromise;
}

const STATUS_ORDER = { available: 0, held: 1, watch: 2, sold: 3 };

// Chỉ chuẩn hoá khoảng trắng hiển thị — không đổi dữ liệu gốc.
function cleanText(s){
  if (s == null) return '';
  return String(s).replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();
}
function hasVal(v){ return v != null && cleanText(v) !== ''; }

function isDemoCode(code){ return (SITE.demoBirdCodes || []).some(c => c.toLowerCase() === cleanText(code).toLowerCase()); }
function isDemoBird(b){ return isDemoCode(b.code); }
const demoTag = () => `<span class="demo-tag">${esc(CONTENT.birds.demoLabel)}</span>`;
const demoNoteHtml = () => `<p class="demo-note" role="note"><strong>${esc(CONTENT.birds.demoLabel)}:</strong> ${esc(CONTENT.birds.demoNote)}</p>`;

function birdStatus(b){ return SITE.statusLabels[b.status] || SITE.statusLabels.available; }
function birdTitle(b){ return cleanText(b.color_name) || cleanText(b.name) || ('Bé ' + cleanText(b.code)); }
function birdHref(b){ return '#chim/' + encodeURIComponent(cleanText(b.code)); }

// Chọn ảnh minh họa cho một bé — thứ tự giải thích trong config.js (inventoryVisuals).
function birdVisuals(b){
  const own = [b.image_url].concat(Array.isArray(b.gallery_urls) ? b.gallery_urls : []);
  const urls = Array.from(new Set(own.filter(isApprovedMedia)));
  const lib = SITE.inventoryVisuals.filter(v => v.ready);
  const norm = s => cleanText(s).toLowerCase();
  const byCode = lib.find(v => v.id === SITE.inventoryVisualByCode[cleanText(b.code)]);
  const byColor = hasVal(b.color_name) ? lib.find(v => (v.match || []).some(m => norm(m) === norm(b.color_name))) : null;
  const visual = byCode || byColor;
  if (!urls.length && visual) urls.push(visual.path);
  const subject = cleanText(b.color_name) || (visual && visual.label) || 'Yến Phụng';
  return { urls, alt: 'Ảnh minh họa ' + subject };
}
const AI_BADGE = '<span class="ai-badge">Ảnh minh họa</span>';
function visualPlaceholder(code){ return assetPlaceholder('INV-' + code, 'Ảnh minh họa đang cập nhật'); }

function birdFacts(b){
  const f = [];
  if (hasVal(b.sex_text)) f.push(cleanText(b.sex_text));
  if (hasVal(b.age_text)) f.push(cleanText(b.age_text));
  if (hasVal(b.self_feeding_text)) f.push(cleanText(b.self_feeding_text));
  if (hasVal(b.tame_level)) f.push('Quen người: ' + cleanText(b.tame_level));
  return f;
}

// Đơn vị giá chỉ hiển thị khi dữ liệu có (cột price_unit chưa tồn tại ở Phase 1A).
function priceText(b){
  if (b.price == null || b.price === '') return '';
  const unit = b.price_unit === 'con' ? ' / con' : b.price_unit === 'cap' ? ' / cặp' : '';
  return Number(b.price).toLocaleString('vi-VN') + 'đ' + unit;
}

function availableBirds(list, excludeCode){
  return list
    .filter(b => b.status !== 'sold' && !isDemoBird(b) && cleanText(b.code) !== excludeCode)
    .sort((a, b) => (STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0));
}

function birdCard(b){
  const code = cleanText(b.code);
  const st = birdStatus(b);
  const vis = birdVisuals(b);
  const facts = birdFacts(b);
  const price = priceText(b);
  const photo = vis.urls.length
    ? `<img src="${attr(vis.urls[0])}" alt="${attr(vis.alt)}" loading="lazy" onerror="this.nextElementSibling&&this.nextElementSibling.remove();this.outerHTML=visualPlaceholder('${attr(code)}')">${AI_BADGE}`
    : visualPlaceholder(code);
  return `
  <article class="bird-card">
    <a class="bird-photo" href="${birdHref(b)}" aria-label="Xem chi tiết bé ${attr(code)}">
      <span class="bird-code-tag">${esc(code)}</span>
      <span class="bird-status ${st.cls}">${st.label}</span>
      ${photo}
    </a>
    <div class="bird-body">
      ${isDemoBird(b) ? demoTag() : ''}
      <h3 class="bird-title">${esc(birdTitle(b))}</h3>
      ${facts.length ? `<ul class="bird-facts">${facts.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      <div class="bird-price-row">${price ? `<span class="bird-price">${esc(price)}</span>` : `<span class="bird-price-ask">Hỏi giá qua Zalo</span>`}</div>
      <div class="bird-actions">
        ${b.status === 'sold' ? '' : `<a class="btn btn-zalo btn-block" href="${attr(SITE.zaloUrl)}" target="_blank" rel="noopener" data-zalo-code="${attr(code)}">Nhắn Zalo về bé này</a>`}
        <a class="link-arrow" href="${birdHref(b)}">Xem chi tiết →</a>
      </div>
    </div>
  </article>`;
}

function emptyBirdsHtml(){
  return `<div class="birds-empty">Hiện chưa có bé nào được đăng riêng. Xem <a href="#chim-dang-tim-chu">3 nhóm chim tại trại</a> hoặc nhắn Zalo cho ${esc(SITE.contactName)} để được báo khi có bé mới.</div>`;
}
function errorBirdsHtml(){
  return `<div class="birds-empty">Chưa tải được danh sách chim. Vui lòng thử lại sau hoặc nhắn Zalo ${esc(SITE.phone)}.</div>`;
}

async function renderHomeBirds(){
  const grid = document.getElementById('home-birds-grid');
  try {
    const list = availableBirds(await loadBirds());
    grid.innerHTML = list.length ? list.slice(0, CONTENT.birds.homeLimit).map(birdCard).join('') : emptyBirdsHtml();
  } catch (e) { grid.innerHTML = errorBirdsHtml(); }
}

async function renderBirdListPage(el){
  el.innerHTML = `
    <a class="back-link" href="#">← Trang chủ</a>
    <h1>${esc(CONTENT.birds.title)}</h1>
    <p class="page-lead">${esc(CONTENT.birds.lead)}</p>
    <p class="visual-note"><span class="vn-icon" aria-hidden="true">ⓘ</span>${esc(CONTENT.birds.visualNote)}</p>
    <div class="birds-grid" id="page-birds-grid"><div class="loading">Đang tải danh sách chim…</div></div>
    <p class="section-note">${esc(CONTENT.birds.infoNote)}</p>`;
  const grid = el.querySelector('#page-birds-grid');
  try {
    const list = availableBirds(await loadBirds());
    grid.innerHTML = list.length ? list.map(birdCard).join('') : emptyBirdsHtml();
    if (list.some(isDemoBird)) grid.insertAdjacentHTML('beforebegin', demoNoteHtml());
  } catch (e) { grid.innerHTML = errorBirdsHtml(); }
}

function contactBoxHtml(code){
  const zalo = code
    ? `<a class="btn btn-zalo btn-lg btn-block" href="${attr(SITE.zaloUrl)}" target="_blank" rel="noopener" data-zalo-code="${attr(code)}">Nhận video thực tế qua Zalo</a>`
    : `<a class="btn btn-zalo btn-lg btn-block" href="${attr(SITE.zaloUrl)}" target="_blank" rel="noopener">Nhắn Zalo cho ${esc(SITE.contactName)}</a>`;
  return `
    <div class="contact-box">
      ${zalo}
      <div class="phone-line">Hoặc gọi ${esc(SITE.contactName)}: <a href="tel:${attr(SITE.phone)}">${esc(SITE.phone)}</a></div>
      ${code ? `<button type="button" class="copy-btn" data-copy-code="${attr(code)}">Copy mã bé ${esc(code)}</button>` : ''}
      <p class="hint">Không mở được Zalo? Lưu số ${esc(SITE.phone)} vào Zalo, hoặc mở trang này bằng trình duyệt (Chrome/Safari).</p>
    </div>`;
}

async function renderBirdDetailPage(el, rawCode){
  const code = cleanText(rawCode);
  el.innerHTML = `<a class="back-link" href="#chim-dang-tim-chu">← Xem 3 nhóm chim tại trại</a><div class="loading">Đang tải thông tin bé…</div>`;
  let list;
  try { list = await loadBirds(); }
  catch (e) {
    el.innerHTML = `<a class="back-link" href="#chim-dang-tim-chu">← Xem 3 nhóm chim tại trại</a>
      <div class="notice"><h1>Chưa tải được thông tin</h1><p>Vui lòng thử lại sau, hoặc nhắn Zalo kèm mã bé ${esc(code)}.</p></div>${contactBoxHtml(code)}`;
    return;
  }
  const b = list.find(x => cleanText(x.code).toLowerCase() === code.toLowerCase());
  const others = availableBirds(list, b ? cleanText(b.code) : null).slice(0, 3);
  const othersHtml = others.length
    ? `<h2 class="more-title">Các bé khác đang có tại trại</h2><div class="birds-grid">${others.map(birdCard).join('')}</div>`
    : '';

  if (!b) {
    document.title = 'Không tìm thấy bé — ' + SITE.brandName;
    el.innerHTML = `<a class="back-link" href="#chim-dang-tim-chu">← Xem 3 nhóm chim tại trại</a>
      <div class="notice"><h1>Không tìm thấy bé ${esc(code)}</h1>
      <p>Bé này có thể đã được cập nhật mã hoặc không còn hiển thị. Bạn xem 3 nhóm chim tại trại, hoặc nhắn Zalo để hỏi trực tiếp.</p>
      <a class="btn btn-zalo" href="${attr(SITE.zaloUrl)}" target="_blank" rel="noopener">Nhắn Zalo</a></div>
      ${othersHtml || emptyBirdsHtml()}`;
    return;
  }

  const realCode = cleanText(b.code);
  const st = birdStatus(b);
  document.title = 'Bé ' + realCode + ' — ' + SITE.brandName;

  if (b.status === 'sold') {
    el.innerHTML = `<a class="back-link" href="#chim-dang-tim-chu">← Xem 3 nhóm chim tại trại</a>
      <div class="notice"><h1>Bé ${esc(realCode)} đã có chủ</h1>
      <p>Cảm ơn bạn đã quan tâm. Bạn xem các bé khác đang có tại trại bên dưới, hoặc nhắn Zalo để được báo khi có bé tương tự.</p>
      <a class="btn btn-zalo" href="${attr(SITE.zaloUrl)}" target="_blank" rel="noopener">Nhắn Zalo</a></div>
      ${othersHtml || emptyBirdsHtml()}`;
    return;
  }

  const vis = birdVisuals(b);
  const imgs = vis.urls;
  const rows = [];
  if (hasVal(b.color_name) && cleanText(b.color_name) !== birdTitle(b)) rows.push(['Màu', b.color_name]);
  if (hasVal(b.sex_text)) rows.push(['Giới tính', b.sex_text]);
  if (hasVal(b.age_text)) rows.push(['Tuổi', b.age_text]);
  if (hasVal(b.self_feeding_text)) rows.push(['Tự ăn', b.self_feeding_text]);
  if (hasVal(b.tame_level)) rows.push(['Quen người', b.tame_level]);
  const note = hasVal(b.short_description) && cleanText(b.short_description) !== birdTitle(b) && cleanText(b.short_description) !== cleanText(b.name)
    ? cleanText(b.short_description) : '';
  const price = priceText(b);
  const video = b.video_url && isApprovedMedia(b.video_url)
    ? `<div class="detail-video"><video src="${attr(b.video_url)}" controls playsinline preload="metadata"></video></div>` : '';

  const gallery = imgs.length
    ? `<button type="button" class="gallery-main" id="gallery-main" aria-label="Phóng to ảnh minh họa"><img id="gallery-main-img" src="${attr(imgs[0])}" alt="${attr(vis.alt)}">${AI_BADGE}</button>
       ${imgs.length > 1 ? `<div class="gallery-thumbs">${imgs.map((u, i) => `<button type="button" data-gi="${i}" class="${i === 0 ? 'active' : ''}" aria-label="Ảnh ${i + 1}"><img src="${attr(u)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}`
    : `<div class="gallery-main" style="cursor:default">${visualPlaceholder(realCode)}</div>`;

  el.innerHTML = `
    <a class="back-link" href="#chim-dang-tim-chu">← Xem 3 nhóm chim tại trại</a>
    <div class="detail-grid">
      <div>${gallery}<p class="visual-note"><span class="vn-icon" aria-hidden="true">ⓘ</span>${esc(CONTENT.birds.visualNote)}</p>${video}</div>
      <div class="detail-info">
        <div class="detail-tags"><span class="detail-code">${esc(realCode)}</span><span class="detail-status ${st.cls}">${st.label}</span>${isDemoBird(b) ? demoTag() : ''}</div>
        ${isDemoBird(b) ? demoNoteHtml() : ''}
        <h1>${esc(birdTitle(b))}</h1>
        ${price ? `<div class="detail-price">${esc(price)}</div>` : `<p class="bird-price-ask">Hỏi giá qua Zalo</p>`}
        ${rows.length ? `<dl>${rows.map(r => `<dt>${esc(r[0])}</dt><dd>${esc(cleanText(r[1]))}</dd>`).join('')}</dl>` : ''}
        ${note ? `<div class="detail-note"><strong>Ghi chú</strong>${esc(note)}</div>` : ''}
        <p class="section-note" style="margin:0 0 14px">${esc(CONTENT.birds.infoNote)}</p>
        ${contactBoxHtml(realCode)}
      </div>
    </div>
    ${othersHtml}`;

  const main = el.querySelector('#gallery-main');
  if (main && imgs.length) {
    let cur = 0;
    main.addEventListener('click', () => openLightbox(imgs, cur, 'Ảnh minh họa'));
    el.querySelectorAll('.gallery-thumbs button').forEach(btn => btn.addEventListener('click', () => {
      cur = Number(btn.dataset.gi);
      el.querySelector('#gallery-main-img').src = imgs[cur];
      el.querySelectorAll('.gallery-thumbs button').forEach(x => x.classList.toggle('active', x === btn));
    }));
  }
}
