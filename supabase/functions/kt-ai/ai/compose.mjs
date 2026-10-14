// BẢN SAO TỰ ĐỘNG từ assets/kt/ai/compose.mjs — KHÔNG sửa ở đây. Sửa bản gốc rồi chạy: node tools/build-edge.mjs
// Phase 1S — tự dàn trang: gói bài đã kiểm tra (package.mjs) → một dòng kt_articles (NHÁP) + danh sách ô ảnh.
// 5 bố cục cho nhịp đọc khác nhau, dùng đúng 11 khối sẵn có của bộ render (không cần đổi schema).
// Ảnh chưa tạo: path rỗng + prompt → trang hiện ô giữ chỗ có ghi rõ "ảnh minh họa đang tạo".
import { GUIDES } from './taxonomy.mjs';
import { slugify, uniqueSlug, clip, stripMd, similarity, words } from './text.mjs';

const IMG = (spec, ratio) => ({
  path: '', path_sm: '', w: 1600, h: ratio === '1:1' ? 1600 : ratio === '4:3' ? 1200 : 900, w_sm: 0,
  alt: spec.alt || '', caption: spec.caption || '', focus: { x: 50, y: 50 }, ai: true, prompt: spec.prompt
});
const sec = s => `## ${s.heading}\n${s.md}`;

const CATALOGUE = { title: 'Catalogue 50 màu & dòng Yến Phụng', url: '/#catalogue', keywords: 'mutation mau long dong lutino albino opaline cinnamon spangle pied clearwing greywing fallow genetics gene' };
// Liên kết nội bộ: tối đa 3 trang liên quan (Catalogue + 25 Cẩm nang + bài Kiến thức đã xuất bản)
export function relatedLinks(pkg, existing = []) {
  const text = [pkg.title, ...pkg.sections.map(s => s.heading)].join(' ');
  const tw = words(text + ' ' + pkg.sections.map(s => s.md).join(' ').slice(0, 4000));
  const pool = [CATALOGUE, ...GUIDES, ...existing.filter(a => a.slug && a.status === 'published').map(a => ({ title: a.title, url: `/kien-thuc/${a.slug}/` }))];
  return pool.map(p => ({ ...p, score: similarity(text, p.title) + words(p.title + ' ' + (p.keywords || '')).filter(w => tw.includes(w)).length * 0.04 }))
    .filter(p => p.score >= 0.1).sort((a, b) => b.score - a.score).slice(0, 3);
}

export function composeArticle(pkg, { existing = [], layout } = {}) {
  const L = layout || pkg.layout;
  const B = [];                                   // khối nội dung
  const push = b => { B.push(b); return B.length - 1; };
  const extras = s => {                           // ghi chú / cảnh báo / checklist / bảng đi kèm một phần
    if (s.table && s.table.rows.length) push({ type: 'table', caption: s.table.caption, head: s.table.head, rows: s.table.rows });
    if (s.checklist && s.checklist.items.length) push({ type: 'checklist', title: s.checklist.title, items: s.checklist.items });
    if (s.note && s.note.md) push({ type: 'note', icon: '💡', title: s.note.title, md: s.note.md });
    if (s.warning && s.warning.md) push({ type: 'warning', title: s.warning.title || 'Lưu ý quan trọng', md: s.warning.md });
  };
  const gallery = (s, ratio) => push({ type: 'gallery', ratio, caption: '', imgs: s.images.map(x => IMG(x, ratio)) });
  const warnings = () => pkg.warnings.forEach(w => push({ type: 'warning', title: w.title || 'Lưu ý quan trọng', md: w.md }));
  const keyPoints = (title = 'Ghi nhớ nhanh') => { if (pkg.key_points.length) push({ type: 'note', icon: '📌', title, md: pkg.key_points.map(k => `- ${k}`).join('\n') }); };
  const faq = () => { if (pkg.faq.length) push({ type: 'faq', title: 'Câu hỏi thường gặp', items: pkg.faq.map(f => ({ q: f.q, a_md: f.a })) }); };
  if (pkg.intro) push({ type: 'text', md: pkg.intro });

  if (L === 'huong-dan') {
    warnings();                                   // an toàn trước tiên
    if (pkg.sections.length >= 3) push({ type: 'checklist', title: 'Các bước chính', items: pkg.sections.map(s => s.heading) });
    pkg.sections.forEach(s => {
      if (s.images) { push({ type: 'text', md: sec(s) }); gallery(s, '1:1'); }
      else if (s.image) push({ type: 'image_text', side: 'left', split: 40, ratio: '1:1', img: IMG(s.image, '1:1'), md: sec(s) });
      else push({ type: 'text', md: sec(s) });
      extras(s);
    });
    keyPoints('Tóm tắt các bước'); faq();
  } else if (L === 'so-sanh') {
    const withTable = pkg.sections.findIndex(s => s.table && s.table.rows.length);
    if (withTable >= 0) { const t = pkg.sections[withTable].table; push({ type: 'table', caption: t.caption || 'So sánh nhanh', head: t.head, rows: t.rows }); }
    pkg.sections.forEach((s, i) => {
      push({ type: 'text', md: sec(s) });
      if (s.images) gallery(s, '1:1');
      else if (s.image) push({ type: 'image', ratio: '4:3', img: IMG(s.image, '4:3') });
      extras(i === withTable ? { ...s, table: null } : s);
    });
    keyPoints('Điểm cần nhớ'); warnings(); faq();
  } else if (L === 'hoi-dap') {
    faq();                                        // hỏi đáp nổi bật ngay sau mở bài
    pkg.sections.forEach(s => {
      push({ type: 'text', md: sec(s) });
      if (s.image) push({ type: 'image', ratio: '16:9', img: IMG(s.image, '16:9') });
      if (s.images) gallery(s, '1:1');
      extras(s);
    });
    keyPoints(); warnings();
  } else if (L === 'tap-chi') {
    pkg.sections.forEach((s, i) => {
      if (s.image) push({ type: 'image', ratio: '16:9', img: IMG(s.image, '16:9') });
      push({ type: 'text', md: sec(s) });
      if (s.images) gallery(s, '4:3');
      extras(s);
      if (i === 1) keyPoints('Điều đáng nhớ');
    });
    if (pkg.sections.length < 2) keyPoints('Điều đáng nhớ');
    warnings(); faq();
  } else {                                        // 'chuan'
    let alt = 0;
    pkg.sections.forEach((s, i) => {
      if (s.image && i === 0) { push({ type: 'image', ratio: '16:9', img: IMG(s.image, '16:9') }); push({ type: 'text', md: sec(s) }); }
      else if (s.image) push({ type: 'image_text', side: alt++ % 2 ? 'right' : 'left', split: 50, ratio: '4:3', img: IMG(s.image, '4:3'), md: sec(s) });
      else push({ type: 'text', md: sec(s) });
      if (s.images) gallery(s, '1:1');
      extras(s);
    });
    keyPoints(); warnings(); faq();
  }

  const links = relatedLinks(pkg, existing);
  if (links.length) push({ type: 'note', icon: '✅', title: 'Đọc thêm trên YẾN PHỤNG PET', md: links.map(l => `- [${l.title}](${l.url})`).join('\n') });

  // tối đa 8 ảnh có prompt → ô ảnh còn lại bỏ prompt (giữ chỗ)
  const slots = [];
  const cover = pkg.cover ? IMG(pkg.cover, '16:9') : { ...IMG({ prompt: '', alt: '', caption: '' }, '16:9'), prompt: '' };
  if (pkg.cover) slots.push({ path: 'cover', prompt: pkg.cover.prompt, ratio: '16:9' });
  B.forEach((b, i) => {
    if (b.img && b.img.prompt) slots.push({ path: `blocks.${i}.img`, prompt: b.img.prompt, ratio: b.ratio || '4:3' });
    (b.imgs || []).forEach((im, j) => { if (im.prompt) slots.push({ path: `blocks.${i}.imgs.${j}`, prompt: im.prompt, ratio: b.ratio || '1:1' }); });
  });
  const kept = slots.slice(0, 8);

  const firstText = stripMd(pkg.intro || (pkg.sections[0] && pkg.sections[0].md) || '');
  const taken = existing.map(a => a.slug);
  const article = {
    slug: uniqueSlug(slugify(pkg.title), taken),
    topic: pkg.topic, title: pkg.title, subtitle: pkg.subtitle,
    excerpt: pkg.excerpt || clip(firstText, 280),
    seo_title: pkg.seo_title || clip(pkg.title, 70),
    seo_description: pkg.seo_description || clip(pkg.excerpt || firstText, 160),
    cover: { ...cover, layout: L, alt: cover.alt || pkg.title, caption: cover.caption || '' },
    blocks: B,
    sources: pkg.sources.map(s => ({ title: s.publisher && !s.title.includes(s.publisher) ? `${s.title} — ${s.publisher}` : s.title, url: s.url || '' })),
    reviewed_by_owner: false,
    status: 'draft'
  };
  // Alt text: tự sinh khi AI bỏ trống
  let n = 0;
  const fixAlt = im => { if (im && !String(im.alt || '').trim()) im.alt = clip(im.caption || `${pkg.title} — ảnh minh họa ${++n}`, 200); };
  fixAlt(article.cover); B.forEach(b => { fixAlt(b.img); (b.imgs || []).forEach(fixAlt); });
  return { article, slots: kept, dropped: slots.length - kept.length, links };
}

// Đặt kết quả ảnh vào đúng ô (path dạng "cover" | "blocks.3.img" | "blocks.5.imgs.1")
export function applyImage(article, slotPath, data) {
  const ks = slotPath.split('.'); let o = article;
  for (const k of ks) { o = o[/^\d+$/.test(k) ? Number(k) : k]; if (!o) throw new Error('Ô ảnh không tồn tại: ' + slotPath); }
  Object.assign(o, data, { ai: true });
  return article;
}
export function pendingSlots(article) {
  const out = []; const chk = (im, p, ratio) => { if (im && !im.path && im.prompt) out.push({ path: p, prompt: im.prompt, ratio }); };
  chk(article.cover, 'cover', '16:9');
  (article.blocks || []).forEach((b, i) => { if (!b) return; chk(b.img, `blocks.${i}.img`, b.ratio || '4:3'); (b.imgs || []).forEach((im, j) => chk(im, `blocks.${i}.imgs.${j}`, b.ratio || '1:1')); });
  return out;
}
