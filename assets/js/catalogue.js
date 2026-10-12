// Catalogue "50 màu & dòng Yến Phụng" (Phase 1B).
// CATALOGUE = kiến thức / tham khảo. Hoàn toàn tách khỏi INVENTORY (chim đang bán):
// không gán chim vào mục catalogue, không suy giá từ Level, không suy kiểu hình từ ảnh.

const CATALOGUE_ERRORS = validateCatalogue(CATALOGUE_ITEMS, CATALOGUE_LEVELS);
if (CATALOGUE_ERRORS.length) {
  console.error('[Catalogue] Dữ liệu catalogue KHÔNG hợp lệ — catalogue sẽ không hiển thị:', CATALOGUE_ERRORS);
}
const CATALOGUE_OK = CATALOGUE_ERRORS.length === 0;

function catalogueEnabled(){ return SITE.features.catalogue && CATALOGUE_OK; }
function catalogueDetailEnabled(){ return catalogueEnabled() && !!SITE.features.catalogueDetail; }

// ---------- HỒ SƠ CHI TIẾT (Phase 1D — 10 mục) ----------
// Hồ sơ lỗi chỉ bị coi là chưa xuất bản, không làm hỏng catalogue.
const CATALOGUE_PROFILE_ERRORS = validateCatalogueProfiles(CATALOGUE_PROFILES, CATALOGUE_ITEMS, CATALOGUE_PROFILE_SCOPE);
if (CATALOGUE_PROFILE_ERRORS.length) {
  console.error('[Catalogue] Hồ sơ chi tiết KHÔNG hợp lệ — các mục này sẽ không được xuất bản:', CATALOGUE_PROFILE_ERRORS);
}
const CATALOGUE_BAD_PROFILES = new Set(CATALOGUE_PROFILE_ERRORS.map(e => e.slice(1, 3)));

// Ảnh dùng cho trang chi tiết: ảnh riêng đã duyệt > vùng cắt poster đã duyệt.
// draft = true (chỉ xem trước): cho phép ảnh/vùng cắt chưa duyệt để OWNER đánh giá.
function profileImage(p, draft){
  if (!p) return null;
  if (p.image && p.image.src && (p.image.approved || draft)) return { kind: 'image', approved: !!p.image.approved, src: p.image.src, alt: p.image.alt };
  if (p.posterCrop && (p.posterCropApproved || draft)) return { kind: 'crop', approved: !!p.posterCropApproved, crop: p.posterCrop };
  return null;
}

// Trạng thái xuất bản của một mục: published + danh sách điều kiện còn thiếu.
function profileStatus(code){
  const p = CATALOGUE_PROFILES[code];
  const missing = [];
  const inScope = CATALOGUE_PROFILE_SCOPE.includes(code);
  if (!inScope) missing.push('ngoài phạm vi 10 hồ sơ');
  else if (!p) missing.push('chưa có hồ sơ');
  else {
    if (CATALOGUE_BAD_PROFILES.has(code)) missing.push('hồ sơ sai cấu trúc (xem console)');
    if (p.status !== 'verified') missing.push('chưa được duyệt (status ≠ verified)');
    if (!p.source || !p.reviewedBy || !p.reviewedAt) missing.push('nguồn / người duyệt / ngày duyệt');
    if (!p.nameVietnamese) missing.push('tên tiếng Việt');
    if (!p.identification || !p.identification.length) missing.push('đặc điểm nhận dạng');
    if (CATALOGUE_PUBLISH_RULES.requireImage && !profileImage(p, false)) missing.push('ảnh minh họa đã duyệt (ảnh riêng hoặc vùng cắt poster)');
  }
  return { inScope, profile: p || null, missing, published: inScope && !!p && missing.length === 0 };
}

// Xem trước bản nháp: CHỈ trên máy local (127.0.0.1 / localhost) với ?preview=1.
// Trên website thật, tham số này không có tác dụng.
function catalogueDraftPreview(){
  return ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname)
    && new URLSearchParams(location.search).get('preview') === '1';
}

// Gắn trạng thái vào mục (chỉ trong bộ nhớ — MASTER LIST không bị sửa).
// Tên Việt chỉ lấy từ hồ sơ hợp lệ có nguồn tên chính thức (nameSource).
function applyCatalogueProfiles(){
  CATALOGUE_ITEMS.forEach(i => {
    const s = profileStatus(i.code);
    const p = s.profile;
    i.profileAvailable = s.published;
    // Tên Việt hiển thị khi có nguồn chính thức (nameSource), độc lập với việc trang đã xuất bản hay chưa.
    i.nameVietnamese = p && !CATALOGUE_BAD_PROFILES.has(i.code) && p.nameVietnamese && p.nameSource ? p.nameVietnamese : null;
  });
}
applyCatalogueProfiles();
// Mục có thể mở trang chi tiết: đã xuất bản, hoặc thuộc phạm vi khi đang xem trước ở local.
function itemHasPage(i){ return i.profileAvailable || (catalogueDraftPreview() && CATALOGUE_PROFILE_SCOPE.includes(i.code)); }
function levelItems(level){ return CATALOGUE_ITEMS.filter(i => i.level === level).sort((a, b) => a.no - b.no); }
function itemLabel(i){ return i.nameVietnamese ? `${i.nameInternational} — ${i.nameVietnamese}` : i.nameInternational; }

// ---------- HOMEPAGE TEASER ----------
function renderHomeCatalogueTeaser(){
  const sec = document.getElementById('mau-dong-home');
  if (!catalogueEnabled()) { sec.hidden = true; return; }
  const C = CONTENT.catalogue;
  sec.hidden = false;
  document.getElementById('cat-teaser-eyebrow').textContent = C.eyebrow;
  document.getElementById('cat-teaser-title').textContent = C.title;
  document.getElementById('cat-teaser-body').textContent = C.teaserBody;
  document.getElementById('cat-teaser-note').textContent = C.teaserLevelNote;
  document.getElementById('cat-teaser-cta').textContent = C.cta;
  // 5 thẻ Level có cùng kích thước / kiểu — không sao, không huy hiệu, không tăng dần.
  document.getElementById('cat-teaser-grid').innerHTML = CATALOGUE_LEVELS.map(l => `
    <a class="lv-card" href="#catalogue/${l.id}">
      <span class="lv-card-media">
        <img src="${attr(l.teaser)}" width="480" height="242" loading="lazy" decoding="async" alt="Xem trước catalogue minh họa ${attr(l.title)}">
        <span class="ai-badge">Ảnh minh họa</span>
      </span>
      <span class="lv-card-body"><strong>${esc(l.title)}</strong><span>${levelItems(l.level).length} màu & dòng</span></span>
    </a>`).join('');
}

// ---------- CATALOGUE PAGE ----------
// Hai hộp gọn: tóm tắt luôn hiện, chi tiết đầy đủ nằm trong <details> (đóng mặc định).
function catalogueNoticeHtml(){
  const C = CONTENT.catalogue;
  return `
    <div class="cat-intro">
      <section class="cat-box" aria-labelledby="cat-level-title">
        <h2 id="cat-level-title">${esc(C.levelTitle)}</h2>
        ${C.levelSummary.map(t => `<p>${esc(t)}</p>`).join('')}
        <details class="cat-more">
          <summary>${esc(C.levelMoreLabel)}</summary>
          <div class="cat-more-body">
            <p>${esc(C.levelIntro)}</p>
            <p class="cat-sub">${esc(C.levelFactorsLead)}</p>
            <ul class="cat-factors">${C.levelFactors.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
            <p class="cat-sub">${esc(C.levelNotLead)}</p>
            <ul class="cat-not">${C.levelNot.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
          </div>
        </details>
      </section>
      <section class="cat-box cat-box-notice" aria-labelledby="cat-notice-title">
        <h2 id="cat-notice-title"><span class="vn-icon" aria-hidden="true">ⓘ</span>${esc(C.noticeTitle)}</h2>
        <p>${esc(C.noticeSummary)}</p>
        <details class="cat-more">
          <summary>${esc(C.noticeMoreLabel)}</summary>
          <div class="cat-more-body">
            <p><strong>Giá trên poster:</strong> ${esc(C.priceDisclaimer)}</p>
            <p><strong>Ảnh minh họa:</strong> ${esc(C.aiDisclosure)}</p>
          </div>
        </details>
      </section>
    </div>`;
}

// Thẻ mục catalogue:
// - nameVietnamese null → không có dòng trống
// - CHỈ mục đã xuất bản (profileAvailable) mới là link + nhãn "Xem chi tiết →";
//   mục chưa xuất bản chỉ hiện tên, không bấm được (Blueprint 5.5)
function catalogueItemHtml(i){
  const body = `<span class="cat-no">#${esc(i.code)}</span>
    <span class="cat-text">
      <span class="cat-name">${esc(i.nameInternational)}</span>
      ${i.nameVietnamese ? `<span class="cat-name-vi">${esc(i.nameVietnamese)}</span>` : ''}
      ${i.profileAvailable ? '<span class="cat-more-link">Xem chi tiết →</span>' : ''}
    </span>`;
  return `<li class="cat-item" id="cat-item-${i.code}">${catalogueDetailEnabled() && itemHasPage(i)
    ? `<a href="#catalogue/${i.code}">${body}</a>`
    : `<span class="cat-item-inner">${body}</span>`}</li>`;
}

function levelSectionHtml(l, eager){
  const C = CONTENT.catalogue;
  const items = levelItems(l.level);
  return `
    <section class="lv-section" id="cat-${l.id}" aria-labelledby="cat-${l.id}-title">
      <h2 id="cat-${l.id}-title">${esc(l.title)}</h2>
      <p class="lv-intro">${esc(C.levelSectionIntro.replace('{level}', l.title))}</p>
      <figure class="poster">
        <button type="button" class="poster-thumb" data-poster-level="${l.level}" aria-label="Phóng to poster ${attr(l.title)}">
          <img src="${attr(l.posterMid)}" srcset="${attr(l.posterMid)} 960w, ${attr(l.poster)} 1536w" sizes="(max-width: 980px) 100vw, 916px"
               width="1536" height="1024" loading="${eager ? 'eager' : 'lazy'}" decoding="async"
               alt="Poster catalogue minh họa ${attr(l.title)}: ${attr(items.map(i => '#' + i.code + ' ' + i.nameInternational).join(', '))}">
          <span class="ai-badge">Ảnh minh họa</span>
          <span class="poster-hint" aria-hidden="true">⤢ ${esc(C.posterHint)}</span>
        </button>
        <figcaption>${esc(C.posterCaption)}</figcaption>
      </figure>
      <ol class="cat-items" aria-label="10 màu & dòng ${attr(l.title)}">
        ${items.map(catalogueItemHtml).join('')}
      </ol>
    </section>`;
}

function renderCataloguePage(el, arg){
  const C = CONTENT.catalogue;
  if (!CATALOGUE_OK) {
    el.innerHTML = `<a class="back-link" href="#">← Trang chủ</a>
      <div class="notice"><h1>Catalogue tạm thời chưa hiển thị</h1><p>Dữ liệu catalogue đang được kiểm tra. Vui lòng quay lại sau.</p></div>`;
    return;
  }

  // Trang chi tiết một mục (#catalogue/01 hoặc #catalogue/<slug>)
  if (arg && !/^lv[1-5]$/.test(arg)) return renderCatalogueItemPage(el, arg);

  document.title = C.title + ' — ' + SITE.brandName;
  el.innerHTML = `
    <a class="back-link" href="#">← Trang chủ</a>
    <div class="cat-hero">
      <span class="eyebrow">${esc(C.eyebrow)}</span>
      <h1>${esc(C.title)}</h1>
      <p class="page-lead">${esc(C.pageSubtitle)}</p>
    </div>
    ${catalogueNoticeHtml()}
    <nav class="lv-nav" aria-label="Chuyển nhanh giữa các Level">
      ${CATALOGUE_LEVELS.map(l => `<button type="button" class="chip" data-lv="${l.id}">${esc(l.title)}</button>`).join('')}
    </nav>
    ${CATALOGUE_LEVELS.map((l, idx) => levelSectionHtml(l, idx === 0)).join('')}
    <div class="cat-bridge">
      <p>${esc(C.inventoryBridge)}</p>
      <a class="btn btn-primary" href="#chim">Xem các bé đang tìm chủ</a>
    </div>`;

  el.querySelectorAll('.poster-thumb').forEach(b => b.addEventListener('click', () => {
    const l = CATALOGUE_LEVELS.find(x => x.level === Number(b.dataset.posterLevel));
    openPosterViewer({ src: l.poster, title: 'Poster ' + l.title, alt: b.querySelector('img').alt, note: C.posterCaption }, b);
  }));

  const chips = el.querySelectorAll('.lv-nav .chip');
  const goLevel = id => {
    const target = document.getElementById('cat-' + id);
    if (!target) return;
    target.scrollIntoView({ block: 'start' });
    history.replaceState(null, '', '#catalogue/' + id);
    chips.forEach(c => c.classList.toggle('active', c.dataset.lv === id));
  };
  chips.forEach(c => c.addEventListener('click', () => goLevel(c.dataset.lv)));

  // Đánh dấu Level đang xem khi cuộn
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting) {
          const id = en.target.id.replace('cat-', '');
          chips.forEach(c => c.classList.toggle('active', c.dataset.lv === id));
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    el.querySelectorAll('.lv-section').forEach(s => io.observe(s));
  }

  if (arg) requestAnimationFrame(() => goLevel(arg));
}

// Trang chi tiết (#catalogue/01 hoặc #catalogue/<slug>).
// Chỉ hiển thị khi hồ sơ ĐÃ XUẤT BẢN (đủ CATALOGUE_PUBLISH_RULES). Mục chưa xuất bản →
// trang chờ trung tính, không có khung trống. Xem trước bản nháp chỉ ở local với ?preview=1.
function cropHtml(crop, lv, alt){
  // Cắt bằng CSS trên poster 1536×1024 sẵn có — không tạo file ảnh, không sửa poster.
  const pct = v => (Math.round(v * 10000) / 10000) + '%';
  return `<div class="cd-crop" style="aspect-ratio:${crop.w}/${crop.h}">
      <img src="${attr(lv.poster)}" alt="${attr(alt)}" decoding="async"
           style="width:${pct(1536 / crop.w * 100)};left:${pct(-crop.x / crop.w * 100)};top:${pct(-crop.y / crop.h * 100)}">
    </div>`;
}

function renderCatalogueItemPage(el, arg){
  const C = CONTENT.catalogue;
  const D = C.detail;
  const key = String(arg).toLowerCase();
  const item = CATALOGUE_ITEMS.find(i => i.code === key.padStart(2, '0') || i.slug === key);
  if (!item) {
    document.title = 'Không tìm thấy — ' + SITE.brandName;
    el.innerHTML = `<a class="back-link" href="#catalogue">← ${esc(C.title)}</a>
      <div class="notice"><h1>Không tìm thấy mục này</h1><p>Xem danh sách đầy đủ 50 màu & dòng trong catalogue.</p>
      <a class="btn btn-outline" href="#catalogue">${esc(C.cta)}</a></div>`;
    return;
  }
  const lv = CATALOGUE_LEVELS.find(l => l.level === item.level);
  document.title = '#' + item.code + ' ' + itemLabel(item) + ' — ' + SITE.brandName;
  const st = profileStatus(item.code);
  const preview = !st.published && catalogueDraftPreview() && st.inScope;

  // Chưa xuất bản (hoặc tắt trang chi tiết) → trang chờ trung tính của Phase 1B.
  if (!catalogueDetailEnabled() || (!st.published && !preview)) {
    el.innerHTML = `<a class="back-link" href="#catalogue/${lv.id}">← ${esc(lv.title)}</a>
      <div class="notice cat-unpublished">
        <span class="eyebrow">${esc(lv.title)} · #${esc(item.code)}</span>
        <h1>${esc(itemLabel(item))}</h1>
        <p>${esc(C.profilePending)}.</p>
        <a class="btn btn-outline" href="#catalogue/${lv.id}">Xem ${esc(lv.title)}</a>
      </div>`;
    return;
  }

  const p = st.profile;
  const L = t => t.replace('{level}', lv.title);
  const vi = item.nameVietnamese;
  const draftNote = `<p class="cd-pending">${esc(D.draftMissing)}</p>`;
  const list = arr => arr && arr.length ? `<ul class="cd-list">${arr.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : draftNote;
  const byCode = c => CATALOGUE_ITEMS.find(i => i.code === c);
  // Khối không có nội dung: ẩn trên trang công khai, chỉ hiện "Chưa có nội dung" khi xem trước.
  const box = (id, title, html, has) => (has || preview)
    ? `<section class="cd-box" aria-labelledby="${id}"><h2 id="${id}">${esc(title)}</h2>${html}</section>` : '';
  const confusedHtml = p.confusedWith && p.confusedWith.length
    ? `<ul class="cd-list">${p.confusedWith.map(c => { if (c.code == null) return `<li>${esc(c.label)}</li>`;
        const o = byCode(c.code); const label = `#${esc(o.code)} ${esc(itemLabel(o))}`;
        return `<li>${itemHasPage(o) ? `<a href="#catalogue/${o.code}">${label}</a>` : label}${c.note ? ' — ' + esc(c.note) : ''}</li>`; }).join('')}</ul>`
    : draftNote;

  const pic = profileImage(p, preview);
  const picAlt = 'Ảnh minh họa #' + item.code + ' ' + itemLabel(item);
  let media;
  if (pic && pic.kind === 'image') {
    media = `<div class="cd-frame"><img src="${attr(pic.src)}" alt="${attr(pic.alt || picAlt)}" decoding="async"><span class="ai-badge">Ảnh minh họa</span></div>`;
  } else if (pic && pic.kind === 'crop') {
    media = `<div class="cd-frame cd-frame-crop">${cropHtml(pic.crop, lv, picAlt + ' (cắt từ poster ' + lv.title + ')')}<span class="ai-badge">Ảnh minh họa</span></div>
      <p class="cd-media-note cd-ai-note">${esc(D.aiImageNote)}</p>
      <p class="cd-media-note">${esc(pic.approved ? L(D.cropNote) : D.previewCrop)}</p>`;
  } else {
    media = `<div class="cd-frame">${assetPlaceholder('CAT-' + item.code, D.imageDraft)}</div>`;
  }

  // Mục trước / sau: chỉ trong các trang đang mở được (đã xuất bản; hoặc phạm vi khi xem trước).
  const pages = CATALOGUE_ITEMS.filter(itemHasPage);
  const idx = pages.findIndex(i => i.code === item.code);
  const prev = idx > 0 ? pages[idx - 1] : null, next = idx >= 0 ? pages[idx + 1] : null;
  const step = (o, dir, label) => o
    ? `<a class="cd-step cd-${dir}" href="#catalogue/${o.code}" rel="${dir}">
        <span class="cd-step-label">${dir === 'prev' ? '← ' : ''}${esc(label)}${dir === 'next' ? ' →' : ''}</span>
        <span class="cd-step-name">#${esc(o.code)} ${esc(o.nameVietnamese || o.nameInternational)}</span></a>`
    : `<span class="cd-step cd-${dir} is-empty" aria-hidden="true"></span>`;

  el.innerHTML = `
    <a class="back-link" href="#catalogue/${lv.id}">← ${esc(L(D.backTop))}</a>
    ${preview ? `<div class="cd-preview" role="note"><strong class="cd-preview-title">${esc(D.previewTitle)}</strong>
      <details class="cd-preview-more"><summary>${esc(D.previewAdmin)}</summary><div class="cd-preview-body">
      ${p.draft ? `<span>${esc(D.previewEditorial)}: ${esc(p.draft.editorialStatus || '—')} · ${esc(p.draft.publicationStatus || '—')} · ${esc(D.previewVisual)}: ${esc(p.draft.visualApprovalStatus || '—')}</span>
      ${p.draft.expertReviewRequired ? `<span><strong>${esc(D.previewExpert)}</strong></span>` : ''}
      ${p.draft.sourceDocuments && p.draft.sourceDocuments.length ? `<span>${esc(D.previewSources)}: ${esc(p.draft.sourceDocuments.join(' · '))}${p.draft.sourceScope ? ' — ' + esc(p.draft.sourceScope) : ''}</span>` : ''}` : ''}
      <span>${esc(D.previewMissing)}: ${esc(st.missing.join(' · '))}</span></div></details></div>` : ''}
    <article class="cd" aria-labelledby="cd-title">
      <div class="cd-head">
        <div class="cd-tags">
          <a class="cd-tag" href="#catalogue/${lv.id}">${esc(lv.title)}</a>
          <span class="cd-tag">${esc(D.codeLabel)} #${esc(item.code)}</span>
        </div>
        <h1 id="cd-title">${esc(vi || item.nameInternational)}</h1>
        ${vi ? `<p class="cd-intl" lang="en">${esc(item.nameInternational)}</p>` : ''}
      </div>

      <div class="cd-grid">
        <section class="cd-media" aria-label="${attr(D.imageTitle)}">
          ${media}
          <button type="button" class="btn btn-outline btn-sm cd-poster-btn" id="cd-poster-btn">⤢ ${esc(L(D.posterButton))}</button>
        </section>
        <div class="cd-sections">
          ${box('cd-id-title', D.idTitle, list(p.identification), p.identification && p.identification.length)}
          ${box('cd-cf-title', D.confusedTitle, confusedHtml, p.confusedWith && p.confusedWith.length)}
          ${box('cd-nt-title', D.notesTitle, list(p.notes), p.notes && p.notes.length)}
          ${p.source || p.reviewedBy ? `<p class="cd-source">${esc(D.sourceLabel)}: ${esc(p.source || '—')}${p.masterListVersion ? ' (v' + esc(p.masterListVersion) + ')' : ''} · ${esc(D.reviewedLabel)}: ${esc(p.reviewedBy || '—')}${p.reviewedAt ? ', ' + esc(p.reviewedAt) : ''}</p>` : ''}
        </div>
      </div>
    </article>

    ${prev || next ? `<nav class="cd-nav" aria-label="Chuyển mục">
      ${step(prev, 'prev', D.prev)}
      ${step(next, 'next', D.next)}
    </nav>` : ''}
    <div class="cd-actions">
      <a class="btn btn-primary" href="#catalogue/${lv.id}">← ${esc(D.backToCatalogue)}</a>
      <a class="btn btn-zalo" href="${attr(SITE.zaloUrl)}" target="_blank" rel="noopener">${esc(D.zalo)}</a>
    </div>`;

  const posterBtn = el.querySelector('#cd-poster-btn');
  posterBtn.addEventListener('click', () => openPosterViewer({
    src: lv.poster, title: 'Poster ' + lv.title,
    alt: 'Poster catalogue minh họa ' + lv.title + ': ' + levelItems(lv.level).map(i => '#' + i.code + ' ' + i.nameInternational).join(', '),
    note: C.posterCaption
  }, posterBtn));
}
