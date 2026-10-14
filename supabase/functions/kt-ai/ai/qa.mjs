// BẢN SAO TỰ ĐỘNG từ assets/kt/ai/qa.mjs — KHÔNG sửa ở đây. Sửa bản gốc rồi chạy: node tools/build-edge.mjs
// Phase 1S — kiểm tra chất lượng bài AI TRƯỚC khi đưa OWNER duyệt.
// "errors" chặn duyệt; "warnings" hiện cho OWNER xem. Đây là lưới an toàn tự động, KHÔNG thay việc OWNER đọc bài.
// Quy tắc chuyên môn bắt buộc (OWNER):
//  1. Không kết luận giới tính chắc chắn khi không đủ dấu hiệu; không dùng ảnh làm bằng chứng.
//  2. Không suy gene ẩn (split) từ phenotype.
//  3. Không đưa lời khuyên thú y thiếu căn cứ: không liều thuốc, không tên kháng sinh kèm liều, không tự chẩn đoán.
//  4. Không khuyến khích người mới tự đút bột chim chưa cai sữa.
//  5. Không bịa nguồn: nguồn phải có tên; link (nếu có) là https; nguồn ngoài danh sách tin cậy → OWNER xác minh.
//  6. Ảnh AI luôn gắn nhãn "Ảnh minh họa", không dùng làm bằng chứng khoa học.
import { fold, wordCount } from './text.mjs';
import { pendingSlots } from './compose.mjs';

// Tên miền nguồn đã được KIỂM TRA truy cập được và đọc nội dung (2026-10-14). Thêm tên miền mới khi OWNER duyệt.
// en.wikipedia.org là nguồn thứ cấp (bách khoa) — chấp nhận nhưng QA nhắc ưu tiên nguồn gốc.
export const TRUSTED_DOMAINS = ['australian.museum', 'merckvetmanual.com', 'en.wikipedia.org'];

// Quy tắc "raw: true" so trên chữ CÓ DẤU (NFC, chữ thường) — cần vì "trống"/"mái" bỏ dấu sẽ trùng "trong"/"mai".
const NEG = /(^|[^\p{L}])(không|chưa|đừng|tránh|chẳng)(?![\p{L}])/u;
const RULES = [
  { id: 'sex-certain', level: 'error', rule: 1, raw: true,
    re: /(chắc chắn|100 ?%|khẳng định|đảm bảo|cam kết|chính xác là)[^.\n]{0,40}(là )?(trống|mái)(?![\p{L}])|(nhìn|xem|qua|dựa vào) (ảnh|hình)[^.\n]{0,40}(biết|xác định|kết luận|khẳng định)[^.\n]{0,30}(trống|mái|giới tính)/u,
    neg: NEG,
    msg: 'Có câu khẳng định giới tính chắc chắn hoặc xác định giới tính qua ảnh.' },
  { id: 'split-from-phenotype', level: 'error', rule: 2, raw: true,
    re: /(nhìn|qua|dựa vào|từ) (màu|ngoại hình|phenotype|kiểu hình)[^.\n]{0,50}(biết|đoán|xác định|suy ra|kết luận)[^.\n]{0,30}(gen|gene|split)|chắc chắn mang gen|chắc chắn (là )?split/u,
    neg: NEG,
    msg: 'Có câu suy gene ẩn (split) từ màu lông / phenotype.' },
  { id: 'vet-dose', level: 'error', rule: 3,
    re: /\b\d+([.,]\d+)? ?(mg|ml|mcg|g\/kg|mg\/kg|giot|vien)\b[^.\n]{0,40}(thuoc|khang sinh|cho uong|pha vao|nho)|(thuoc|khang sinh)[^.\n]{0,40}\b\d+([.,]\d+)? ?(mg|ml|giot|vien)\b|(enrofloxacin|baytril|doxycycline|tetracycline|amoxicillin|metronidazole|ivermectin|toltrazuril)/,
    msg: 'Có liều thuốc hoặc tên thuốc điều trị cụ thể — không được đưa trong bài kiến thức.' },
  { id: 'vet-diagnose', level: 'warning', rule: 3,
    re: /(chac chan|chinh xac) (la|bi) (benh|nhiem)|tu chua (tai nha|cho chim)|khong can (di )?(bac si|kham)/,
    msg: 'Có câu có thể khiến người đọc tự chẩn đoán / bỏ qua bác sĩ thú y.' },
  { id: 'handfeed', level: 'error', rule: 4,
    re: /(nguoi moi|moi nuoi|ban co the|hay|nen)[^.\n]{0,40}(tu )?(dut bot|bom bot|dut chim non)/,
    neg: /(khong (nen|khuyen)|tranh|chi (danh cho|nen de)|nguoi co kinh nghiem|bac si)[^.\n]{0,60}(dut bot|bom bot)|(dut bot|bom bot)[^.\n]{0,60}(khong (nen|khuyen)|nguy hiem|ri ro|danh cho nguoi co kinh nghiem)/,
    msg: 'Có câu khuyến khích người mới tự đút bột chim non.' },
  { id: 'sale-promise', level: 'warning', rule: 1, raw: true,
    re: /(bảo hành|cam kết|đảm bảo)[^.\n]{0,30}(giới tính|trống mái|trống|mái|sống lâu|không bệnh|sức khỏe)/u,
    neg: NEG,
    msg: 'Có lời hứa về giới tính / sức khỏe — kiểm tra lại cách diễn đạt.' }
];

const textOf = a => {
  const parts = [a.title, a.subtitle, a.excerpt];
  for (const b of a.blocks || []) {
    if (!b) continue;
    parts.push(b.md, b.title, b.caption);
    if (Array.isArray(b.items)) b.items.forEach(i => parts.push(typeof i === 'string' ? i : `${i.q || ''} ${i.a_md || ''}`));
    if (Array.isArray(b.rows)) parts.push(b.rows.flat().join(' '));
  }
  return parts.filter(Boolean).join('\n');
};
const sentences = s => String(s).split(/(?<=[.!?\n])\s+/);

export function qaArticle(a, { group = '', risk = [] } = {}) {
  const errors = [], warnings = [], passed = [];
  const add = (lvl, code, msg, where = '') => (lvl === 'error' ? errors : warnings).push({ code, msg, where });
  // --- đủ thông tin để xuất bản (khớp trigger kt_articles_before_write) ---
  if (!a.title || a.title.length < 10) add('error', 'title', 'Tiêu đề quá ngắn.');
  if (!a.seo_description || a.seo_description.length < 50) add('error', 'seo', 'Mô tả SEO thiếu hoặc quá ngắn (cần 50–170 ký tự).'); else passed.push('Mô tả SEO');
  if ((a.seo_title || a.title || '').length > 70) add('warning', 'seo-title', 'Tiêu đề SEO dài hơn 70 ký tự.');
  if (!(a.sources || []).length) add('error', 'sources', 'Chưa có nguồn tham khảo.'); else passed.push('Có nguồn tham khảo');
  // --- ảnh ---
  const pend = pendingSlots(a);
  if (!a.cover || !a.cover.path) add('error', 'cover', pend.some(p => p.path === 'cover') ? 'Ảnh bìa chưa được tạo.' : 'Chưa có ảnh bìa.');
  const pendInner = pend.filter(p => p.path !== 'cover').length;
  if (pendInner) add('error', 'images-pending', `${pendInner} ảnh minh họa trong bài chưa được tạo (đang hiện ô giữ chỗ).`);
  const imgs = [a.cover, ...(a.blocks || []).flatMap(b => (b ? [b.img, ...(b.imgs || [])] : []))].filter(im => im && (im.path || im.prompt));
  const noAlt = imgs.filter(im => !String(im.alt || '').trim()).length;
  if (noAlt) add('warning', 'alt', `${noAlt} ảnh chưa có Alt text.`); else if (imgs.length) passed.push('Alt text đầy đủ');
  if (imgs.some(im => im.prompt && im.ai === false)) add('error', 'ai-label', 'Ảnh do AI tạo phải gắn nhãn "Ảnh minh họa".');
  // --- độ dài, cấu trúc ---
  const wc = wordCount(textOf(a));
  if (wc < 450) add('warning', 'length', `Bài khá ngắn (${wc} từ). Bài chuyên sâu nên từ 800 từ.`); else passed.push(`Độ dài ${wc} từ`);
  if (wc > 4500) add('warning', 'length', `Bài rất dài (${wc} từ) — cân nhắc tách bài.`);
  const h2 = (a.blocks || []).reduce((n, b) => n + ((b && b.md && (b.md.match(/^##\s/gm) || []).length) || 0), 0);
  if (h2 < 3) add('warning', 'structure', 'Ít hơn 3 tiêu đề mục — mục lục sẽ không hiện.'); else passed.push(`${h2} mục (có mục lục)`);
  // --- nguồn ---
  for (const s of a.sources || []) {
    const o = typeof s === 'string' ? { title: s } : s;
    if (!o.url) { add('warning', 'source-unverified', `Nguồn "${o.title}" không có link — OWNER cần xác minh nguồn có thật.`); continue; }
    let host = ''; try { host = new URL(o.url).hostname.replace(/^www\./, ''); } catch { add('error', 'source-url', `Link nguồn không hợp lệ: ${o.url}`); continue; }
    if (!TRUSTED_DOMAINS.some(d => host === d || host.endsWith('.' + d))) add('warning', 'source-unverified', `Nguồn ngoài danh sách tin cậy (${host}) — OWNER cần mở link kiểm tra.`);
  }
  // --- quy tắc chuyên môn ---
  const txt = textOf(a);
  for (const s of sentences(txt)) {
    const f = fold(s), raw = s.normalize('NFC').toLowerCase();
    for (const r of RULES) {
      const t = r.raw ? raw : f;
      if (r.re.test(t) && !(r.neg && r.neg.test(t))) add(r.level, r.id, r.msg, s.trim().slice(0, 160));
    }
  }
  const health = a.topic === 'cham-soc-suc-khoe' || risk.includes('vet') || /benh|thuoc|thu y|suc khoe/.test(fold(a.title));
  if (health && !(a.blocks || []).some(b => b && b.type === 'warning')) add('warning', 'vet-disclaimer', 'Bài về sức khỏe nên có khung cảnh báo khuyên gặp bác sĩ thú y chim.');
  const sexTopic = risk.includes('sex') || /trong mai|gioi tinh|cere/.test(fold(a.title));
  if (sexTopic && !/(xet nghiem|dna|adn)/.test(fold(txt))) add('warning', 'sex-dna', 'Bài về giới tính nên nhắc xét nghiệm DNA là cách xác định chắc chắn.');
  if (sexTopic && !(a.blocks || []).some(b => b && b.type === 'warning')) add('warning', 'sex-warning', 'Bài về giới tính nên có khung cảnh báo "không kết luận chắc chắn từ ảnh".');
  const genTopic = risk.includes('genetics') || /gen|mutation|split|di truyen/.test(fold(a.title));
  if (genTopic && !/(khong the|khong nen|chi biet chac)[^.]{0,60}(gen an|split)|(gen an|split)[^.]{0,80}(khong the|phai|chi)/.test(fold(txt))) add('warning', 'split-note', 'Bài genetics nên nói rõ: không thể biết gene ẩn (split) chỉ qua ngoại hình.');
  // --- bảo vệ trạng thái ---
  if (a.status && a.status !== 'draft') add('error', 'status', 'Bài AI phải ở trạng thái nháp.');
  if (a.reviewed_by_owner) add('error', 'reviewed', 'Bài AI không được tự đánh dấu "OWNER đã duyệt".');
  if (!errors.some(e => ['sex-certain', 'split-from-phenotype', 'vet-dose', 'handfeed'].includes(e.code))) passed.push('Không vi phạm 4 quy tắc chuyên môn bắt buộc');
  const score = Math.max(0, 100 - errors.length * 20 - warnings.length * 4);
  return { ok: errors.length === 0, score, errors, warnings, passed, words: wc };
}
