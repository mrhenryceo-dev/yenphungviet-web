// Phase 1R — BỘ RENDER DÙNG CHUNG cho "Kiến thức chuyên sâu".
// Dùng ở 2 nơi: Vercel Function (HTML công khai, có SEO) và /quan-tri/ (xem trước).
// → Bản xem trước luôn giống hệt bài khi lên web.
//
// AN TOÀN: nội dung bài là DỮ LIỆU (JSON blocks), không phải HTML.
// - Mọi chữ đều được escape. Chỉ hiểu Markdown rút gọn: ## ### - 1. **đậm** *nghiêng* [chữ](link).
// - Link chỉ nhận https://, đường dẫn nội bộ "/…", tel:.  Ảnh chỉ nhận đường dẫn trong bucket hoặc /assets/.
// - Loại khối không có trong danh sách 11 khối sẽ bị bỏ qua.

import { KT, topicName } from './config.mjs';

// ---------- tiện ích an toàn ----------
export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const clamp = (n, lo, hi, d) => { n = Number(n); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const isSlug = s => typeof s === 'string' && s.length >= 3 && s.length <= 80 && SLUG_RE.test(s);

export function safeUrl(u) {
  u = String(u || '').trim();
  if (/[*\`]/.test(u)) return null;          // không cho ký tự định dạng / thoát chuỗi trong link
  if (/^https:\/\/[^\s"'<>]+$/i.test(u)) return u;
  if (/^\/(?!\/)[^\s"'<>]*$/.test(u)) return u;
  if (/^tel:\+?[0-9 .-]{6,20}$/i.test(u)) return u.replace(/\s/g, '');
  return null;
}

// Đường dẫn ảnh: "/assets/…" (ảnh có sẵn của website) hoặc khóa trong bucket "kien-thuc".
export function imgSrc(path) {
  path = String(path || '').trim();
  if (/^\/assets\/[a-z0-9/_.-]+\.(webp|jpe?g|png)$/i.test(path)) return path;
  if (/^[a-z0-9][a-z0-9/_.-]*\.(webp|jpe?g|png)$/i.test(path) && !path.includes('..')) {
    return `${KT.supabaseUrl}/storage/v1/object/public/${KT.bucket}/${path}`;
  }
  return null;
}
const absUrl = u => (u && u.startsWith('/') ? KT.siteUrl + u : u);

// ---------- Markdown rút gọn ----------
export function inline(md) {
  let s = esc(md);
  // [chữ](link) — link phải qua safeUrl (kiểm tra trên bản gốc, đã unescape &amp;)
  s = s.replace(/\[([^\]\n]{1,200})\]\(([^)\s]{1,500})\)/g, (m, text, url) => {
    const raw = url.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    const ok = safeUrl(raw);
    if (!ok) return text;
    const ext = /^https:/i.test(ok) && !ok.startsWith(KT.siteUrl);
    return `<a href="${esc(ok)}"${ext ? ' target="_blank" rel="noopener nofollow"' : ''}>${text}</a>`;
  });
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  return s;
}

export function mdToHtml(md) {
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  const out = []; let para = []; let list = null;
  const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<${list.tag}>${list.items.map(i => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if ((m = line.match(/^###\s+(.+)/))) { flushPara(); flushList(); out.push(`<h3>${inline(m[1])}</h3>`); continue; }
    if ((m = line.match(/^##\s+(.+)/)))  { flushPara(); flushList(); out.push(`<h2>${inline(m[1])}</h2>`); continue; }
    if ((m = line.match(/^\s*[-•]\s+(.+)/))) { flushPara(); if (!list || list.tag !== 'ul') { flushList(); list = { tag: 'ul', items: [] }; } list.items.push(m[1]); continue; }
    if ((m = line.match(/^\s*\d+[.)]\s+(.+)/))) { flushPara(); if (!list || list.tag !== 'ol') { flushList(); list = { tag: 'ol', items: [] }; } list.items.push(m[1]); continue; }
    flushList(); para.push(line.trim());
  }
  flushPara(); flushList();
  return out.join('');
}
const plain = md => String(md || '').replace(/[#*\[\]()>_-]/g, ' ');

// ---------- ảnh ----------
const RATIOS = { '16:9': '16 / 9', '4:3': '4 / 3', '1:1': '1 / 1', '3:4': '3 / 4' };
export function figure(img, { ratio, cls = '', sizes = '(max-width: 760px) 100vw, 760px', zoom = false } = {}) {
  if (!img) return '';
  const src = imgSrc(img.path);
  if (!src) return `<div class="kt-img-missing ${cls}">Chưa có ảnh</div>`;
  const sm = imgSrc(img.path_sm);
  const fx = clamp(img.focus && img.focus.x, 0, 100, 50), fy = clamp(img.focus && img.focus.y, 0, 100, 50);
  const w = clamp(img.w, 1, 8000, 1600), h = clamp(img.h, 1, 8000, 1000);  const ar = RATIOS[ratio];
  const style = `object-position:${fx}% ${fy}%` + (ar ? `;aspect-ratio:${ar}` : '');
  const wsm = clamp(img.w_sm, 1, 8000, Math.min(800, w));   // độ rộng thật của bản nhỏ (R4 lưu sẵn)
  const srcset = sm && wsm < w ? ` srcset="${esc(sm)} ${wsm}w, ${esc(src)} ${w}w" sizes="${esc(sizes)}"` : '';
  const ai = img.ai !== false ? '<span class="ai-badge">Ảnh minh họa</span>' : '';
  const zoomAttr = zoom ? ` data-zoom="${esc(src)}"` : '';
  return `<figure class="kt-fig ${cls}${ar ? ' kt-fig--ratio' : ''}"><div class="kt-fig-media"${zoomAttr}>`
    + `<img src="${esc(src)}"${srcset} width="${w}" height="${h}" alt="${esc(img.alt || '')}" loading="lazy" decoding="async" style="${style}">${ai}</div>`
    + (img.caption ? `<figcaption>${inline(img.caption)}</figcaption>` : '') + '</figure>';
}

// ---------- 11 khối ----------
const BLOCKS = {
  text: b => `<div class="kt-b kt-text">${mdToHtml(b.md)}</div>`,
  image: b => `<div class="kt-b kt-image">${figure(b.img, { ratio: b.ratio || '16:9', sizes: '(max-width: 960px) 100vw, 960px', zoom: true })}</div>`,
  image_text: b => {
    const side = b.side === 'right' ? 'right' : 'left';
    const split = b.split === 40 ? 40 : 50;
    return `<div class="kt-b kt-split kt-split--${side} kt-split--${split}">`
      + `<div class="kt-split-media">${figure(b.img, { ratio: b.ratio || '4:3', sizes: '(max-width: 760px) 100vw, 420px', zoom: true })}</div>`
      + `<div class="kt-split-text">${mdToHtml(b.md)}</div></div>`;
  },
  gallery: b => {
    const imgs = (Array.isArray(b.imgs) ? b.imgs : []).slice(0, 4);
    if (!imgs.length) return '';
    return `<div class="kt-b kt-gallery kt-gallery--${imgs.length}">${imgs.map(i => figure(i, { ratio: b.ratio || '1:1', sizes: '(max-width: 760px) 50vw, 320px', zoom: true })).join('')}</div>`
      + (b.caption ? `<p class="kt-gallery-cap">${inline(b.caption)}</p>` : '');
  },
  note: b => `<aside class="kt-b kt-box kt-box--note"><div class="kt-box-ic" aria-hidden="true">${esc(['💡','📌','✅'].includes(b.icon) ? b.icon : '💡')}</div><div>`
    + (b.title ? `<p class="kt-box-title">${inline(b.title)}</p>` : '') + mdToHtml(b.md) + '</div></aside>',
  warning: b => `<aside class="kt-b kt-box kt-box--warn" role="note"><div class="kt-box-ic" aria-hidden="true">⚠️</div><div>`
    + `<p class="kt-box-title">${inline(b.title || 'Lưu ý quan trọng')}</p>` + mdToHtml(b.md) + '</div></aside>',
  checklist: b => {
    const items = (Array.isArray(b.items) ? b.items : []).filter(Boolean);
    return `<div class="kt-b kt-check">${b.title ? `<p class="kt-check-title">${inline(b.title)}</p>` : ''}<ul>${items.map(i => `<li>${inline(i)}</li>`).join('')}</ul></div>`;
  },
  table: b => {
    const head = (Array.isArray(b.head) ? b.head : []).slice(0, 5);
    const rows = (Array.isArray(b.rows) ? b.rows : []).slice(0, 40);
    if (!head.length) return '';
    return `<div class="kt-b kt-table">${b.caption ? `<p class="kt-table-cap">${inline(b.caption)}</p>` : ''}<table><thead><tr>${head.map(h => `<th scope="col">${inline(h)}</th>`).join('')}</tr></thead><tbody>`
      + rows.map(r => `<tr>${head.map((h, i) => `<td data-label="${esc(h)}">${inline((r || [])[i] || '')}</td>`).join('')}</tr>`).join('')
      + '</tbody></table></div>';
  },
  faq: b => {
    const items = (Array.isArray(b.items) ? b.items : []).filter(i => i && i.q);
    return `<div class="kt-b kt-faq">${b.title ? `<h2>${inline(b.title)}</h2>` : ''}${items.map(i => `<details><summary>${inline(i.q)}</summary><div class="kt-faq-a">${mdToHtml(i.a_md)}</div></details>`).join('')}</div>`;
  },
  cta: b => {
    const kind = b.kind;
    if (kind === 'zalo') return `<div class="kt-b kt-cta"><a class="btn btn-zalo btn-lg" href="${esc(KT.zaloUrl)}" target="_blank" rel="noopener">${esc(b.label || 'Nhắn Zalo ' + KT.phone)}</a></div>`;
    if (kind === 'article' && isSlug(b.slug)) return `<div class="kt-b kt-cta"><a class="btn btn-outline btn-lg" href="${KT.basePath}${esc(b.slug)}/">${esc(b.label || 'Đọc bài liên quan')} →</a></div>`;
    if (kind === 'copy_link') return `<div class="kt-b kt-cta"><button type="button" class="btn btn-outline btn-lg" data-copy-link>${esc(b.label || 'Sao chép link bài viết')}</button></div>`;
    return '';
  }
};
export const BLOCK_TYPES = Object.keys(BLOCKS);

export function renderBlocks(blocks) {
  const list = Array.isArray(blocks) ? blocks.slice(0, 200) : [];
  return list.map(b => (b && BLOCKS[b.type] ? BLOCKS[b.type](b) : '')).join('');
}
export const hasWarning = a => (a.blocks || []).some(b => b && b.type === 'warning');

export function readingMinutes(a) {
  let txt = [a.title, a.subtitle].join(' ');
  for (const b of a.blocks || []) {
    if (!b) continue;
    txt += ' ' + [b.md, b.title, b.caption, (b.items || []).map(i => (typeof i === 'string' ? i : (i.q || '') + ' ' + (i.a_md || ''))).join(' '),
      (b.rows || []).flat().join(' ')].join(' ');
  }
  const words = plain(txt).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
export function fmtDate(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || isNaN(d)) return '';
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}
export const articleUrl = a => `${KT.basePath}${a.slug}/`;

// ---------- khung trang ----------
const NAV = `<header><div class="header-inner kt-header">
  <a class="brand" href="/" aria-label="Trang chủ ${esc(KT.brand)}"><img class="brand-logo" src="/assets/brand/logo-yenphungpet.webp" width="545" height="180" alt="${esc(KT.brand)}"></a>
  <nav class="kt-nav" aria-label="Điều hướng"><a href="/#chim-dang-tim-chu">Chim Đang Có Tại Trại</a><a href="${KT.basePath}" class="active">Kiến thức</a><a href="/chon-nhom-choi">Chọn nhóm chơi</a></nav>
  <a class="btn btn-zalo btn-sm kt-head-zalo" href="${esc(KT.zaloUrl)}" target="_blank" rel="noopener">Nhắn Zalo</a>
</div></header>`;
const FOOT = `<footer><div class="wrap"><p><strong>${esc(KT.brand)}</strong> — Thế giới Yến Phụng dành cho người yêu chim</p>
  <p>Di Linh – Lâm Đồng · Zalo/Điện thoại: <a href="tel:${KT.phone}">${KT.phone}</a></p><p><a href="/">Trang chủ</a> · <a href="${KT.basePath}">Kiến thức chuyên sâu</a></p></div></footer>
<div class="mobile-bar" role="navigation" aria-label="Liên hệ nhanh"><a class="btn btn-zalo" href="${esc(KT.zaloUrl)}" target="_blank" rel="noopener">Nhắn Zalo</a><a class="btn btn-outline" href="tel:${KT.phone}">Gọi</a></div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>`;

export function pageHtml({ title, description, canonical, ogImage, ogType = 'website', jsonLd, body, noindex = false, banner = '' }) {
  const canon = canonical ? absUrl(canonical) : '';
  const og = ogImage ? absUrl(ogImage) : `${KT.siteUrl}/assets/brand/og-yenphungpet.jpg`;
  const ld = jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : '';
  return `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex">' : ''}${canon ? `<link rel="canonical" href="${esc(canon)}">` : ''}
<meta name="theme-color" content="#3A7358">
<meta property="og:type" content="${esc(ogType)}"><meta property="og:locale" content="vi_VN"><meta property="og:site_name" content="${esc(KT.brand)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">
${canon ? `<meta property="og:url" content="${esc(canon)}">` : ''}<meta property="og:image" content="${esc(og)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(og)}">
<link rel="icon" href="/assets/brand/favicon.ico" sizes="any"><link rel="apple-touch-icon" href="/assets/brand/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,500&family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/site.css"><link rel="stylesheet" href="/assets/css/kien-thuc.css">
${ld}</head><body class="kt">${banner}${NAV}<main>${body}</main>${FOOT}
<div class="kt-lightbox" id="kt-lightbox" hidden><button type="button" class="kt-lb-close" aria-label="Đóng">✕</button><img alt=""></div>
<script src="/assets/js/kien-thuc.js" defer></script></body></html>`;
}

// ---------- thẻ bài + trang danh sách ----------
export function cardHtml(a) {
  const url = articleUrl(a);
  const cover = a.cover && a.cover.path ? figure({ ...a.cover, caption: '' }, { ratio: '16:9', cls: 'kt-card-img', sizes: '(max-width: 640px) 100vw, 360px' }) : '<div class="kt-img-missing kt-card-img">Chưa có ảnh bìa</div>';
  return `<article class="kt-card" data-topic="${esc(a.topic)}" data-search="${esc((a.title + ' ' + (a.excerpt || '') + ' ' + topicName(a.topic)).toLowerCase())}">
  <a class="kt-card-link" href="${esc(url)}">${cover}<div class="kt-card-body"><span class="kt-chip">${esc(topicName(a.topic))}</span>
  <h2 class="kt-card-title">${esc(a.title)}</h2><p class="kt-card-ex">${esc(a.excerpt || a.subtitle || '')}</p></div></a>
  <button type="button" class="kt-card-copy" data-copy-link="${esc(absUrl(url))}" aria-label="Sao chép link bài ${esc(a.title)}">🔗 Sao chép link</button>
</article>`;
}

export function renderListPage(articles, { topic = '' } = {}) {
  const list = Array.isArray(articles) ? articles : [];
  const counts = Object.fromEntries(KT.topics.map(t => [t.id, list.filter(a => a.topic === t.id).length]));
  const chips = `<button type="button" class="kt-filter${!topic ? ' active' : ''}" data-topic="">Tất cả <span>${list.length}</span></button>`
    + KT.topics.map(t => `<button type="button" class="kt-filter${topic === t.id ? ' active' : ''}" data-topic="${t.id}">${t.icon} ${esc(t.name)} <span>${counts[t.id]}</span></button>`).join('');
  const body = `<section class="kt-hero"><div class="wrap">
    <span class="eyebrow">Thư viện ${esc(KT.brand)}</span><h1>${esc(KT.sectionName)}</h1>
    <p class="kt-hero-lead">Những bài viết chuyên sâu về Yến Phụng: vòng đời, nhận dạng, dinh dưỡng, chăm sóc, sinh sản và môi trường nuôi. Biên soạn có nguồn tham khảo, trình bày dễ đọc trên điện thoại.</p>
    <div class="kt-search"><input type="search" id="kt-q" placeholder="Tìm bài viết… (ví dụ: cere, thức ăn, aviary)" aria-label="Tìm bài viết"></div>
  </div></section>
  <section class="wrap kt-lib"><div class="kt-filters" role="toolbar" aria-label="Lọc theo chủ đề">${chips}</div>
    <div class="kt-grid" id="kt-grid">${list.map(cardHtml).join('')}</div>
    <p class="kt-empty" id="kt-empty"${list.length ? ' hidden' : ''}>${list.length ? 'Không tìm thấy bài phù hợp.' : 'Thư viện đang được biên soạn — các bài viết đầu tiên sẽ sớm ra mắt.'}</p>
    <p class="kt-more"><a class="link-arrow" href="/#cam-nang">Xem thêm 25 bài Cẩm nang cơ bản →</a></p>
  </section>`;
  return pageHtml({
    title: `${KT.sectionName} — ${KT.brand}`,
    description: 'Thư viện kiến thức chuyên sâu về Yến Phụng: vòng đời, giới tính & nhận dạng, dinh dưỡng, chăm sóc & sức khỏe, sinh sản & genetics, AVI & môi trường nuôi.',
    canonical: KT.basePath,
    jsonLd: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: KT.sectionName, url: KT.siteUrl + KT.basePath, inLanguage: 'vi' },
    body
  });
}

// ---------- trang bài viết ----------
export function articleBodyHtml(a, related = [], { preview = false } = {}) {
  const warn = hasWarning(a);
  const url = absUrl(articleUrl(a));
  const cover = a.cover && a.cover.path ? figure(a.cover, { ratio: '16:9', cls: 'kt-cover', sizes: '100vw' }) : '';
  const date = fmtDate(a.updated_at || a.published_at);
  const sources = (Array.isArray(a.sources) ? a.sources : []).filter(Boolean);
  const rel = related.filter(r => r.slug !== a.slug).slice(0, 3);
  return `<article class="kt-article">
  ${preview ? '<div class="kt-preview-bar">BẢN XEM TRƯỚC — chưa công khai</div>' : ''}
  <div class="kt-art-head wrap"><a class="back-link" href="${KT.basePath}">← ${esc(KT.sectionName)}</a>
    <a class="kt-chip" href="${KT.basePath}?chu-de=${esc(a.topic)}">${esc(topicName(a.topic))}</a>
    <h1>${esc(a.title)}</h1>${a.subtitle ? `<p class="kt-sub">${esc(a.subtitle)}</p>` : ''}
    <p class="kt-meta">${date ? `Cập nhật ${esc(date)} · ` : ''}${readingMinutes(a)} phút đọc
      <button type="button" class="kt-share" data-share="${esc(url)}" data-title="${esc(a.title)}">↗ Chia sẻ</button></p>
  </div>
  ${cover ? `<div class="kt-cover-wrap">${cover}</div>` : ''}
  <div class="kt-body wrap">${renderBlocks(a.blocks)}
    ${sources.length ? `<section class="kt-sources"><h2>Nguồn tham khảo</h2><ol>${sources.map(s => `<li>${inline(typeof s === 'string' ? s : (s.title || '') + (s.url ? ` [${s.url}](${s.url})` : ''))}</li>`).join('')}</ol></section>` : ''}
    <p class="kt-disclaimer">${warn ? 'Nội dung chỉ nhằm cung cấp kiến thức chăm sóc cơ bản, <strong>không thay thế việc khám và chẩn đoán của bác sĩ thú y</strong>.' : 'Nội dung mang tính tham khảo, được biên soạn từ các nguồn ghi ở trên. Mỗi cá thể chim có thể khác nhau.'}</p>
    ${warn ? '' : `<div class="kt-end-cta"><p>Cần tư vấn chọn chim phù hợp?</p><a class="btn btn-zalo btn-lg" href="${esc(KT.zaloUrl)}" target="_blank" rel="noopener">Nhắn Zalo ${KT.phone}</a></div>`}
  </div>
  ${rel.length ? `<section class="kt-related wrap"><h2>Bài liên quan</h2><div class="kt-grid">${rel.map(cardHtml).join('')}</div></section>` : ''}
</article>`;
}

export function renderArticlePage(a, related = []) {
  const title = a.seo_title || `${a.title} — ${KT.brand}`;
  const description = a.seo_description || a.excerpt || a.subtitle || '';
  const og = a.cover && (imgSrc(a.cover.og_path) || imgSrc(a.cover.path));
  return pageHtml({
    title, description, canonical: articleUrl(a), ogImage: og, ogType: 'article',
    jsonLd: [{
      '@context': 'https://schema.org', '@type': 'Article', headline: a.title, description,
      image: og ? [absUrl(og)] : undefined, datePublished: a.published_at || undefined, dateModified: a.updated_at || a.published_at || undefined,
      inLanguage: 'vi', mainEntityOfPage: absUrl(articleUrl(a)),
      author: { '@type': 'Organization', name: KT.brand }, publisher: { '@type': 'Organization', name: KT.brand, logo: { '@type': 'ImageObject', url: KT.siteUrl + '/assets/brand/logo-yenphungpet.webp' } }
    }, {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Trang chủ', item: KT.siteUrl + '/' },
        { '@type': 'ListItem', position: 2, name: KT.sectionName, item: KT.siteUrl + KT.basePath },
        { '@type': 'ListItem', position: 3, name: a.title, item: absUrl(articleUrl(a)) }]
    }],
    body: articleBodyHtml(a, related)
  });
}

export function renderNotFound() {
  return pageHtml({
    title: `Không tìm thấy bài viết — ${KT.brand}`, description: 'Bài viết không tồn tại hoặc đã được gỡ.', noindex: true,
    body: `<section class="wrap kt-404"><h1>Không tìm thấy bài viết</h1><p>Bài viết có thể đã được cập nhật đường dẫn hoặc tạm ẩn.</p><a class="btn btn-primary" href="${KT.basePath}">Về thư viện ${esc(KT.sectionName)}</a></section>`
  });
}

export function sitemapXml(articles) {
  const urls = [
    { loc: KT.siteUrl + '/' }, { loc: KT.siteUrl + '/chon-nhom-choi' }, { loc: KT.siteUrl + KT.basePath },
    ...(articles || []).map(a => ({ loc: absUrl(articleUrl(a)), lastmod: (a.updated_at || a.published_at || '').slice(0, 10) }))
  ];
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.map(u => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${esc(u.lastmod)}</lastmod>` : ''}</url>`).join('\n') + '\n</urlset>\n';
}

// Bản xem trước trong /quan-tri/: cùng template công khai, có dải "BẢN XEM TRƯỚC", noindex.
export function renderPreviewPage(a) {
  return pageHtml({ title: `[Xem trước] ${a.title || ''}`, description: a.seo_description || '', noindex: true,
    body: articleBodyHtml({ ...a, slug: isSlug(a.slug) ? a.slug : 'ban-nhap' }, [], { preview: true }) });
}
