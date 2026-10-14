// BẢN SAO TỰ ĐỘNG từ assets/kt/ai/package.mjs — KHÔNG sửa ở đây. Sửa bản gốc rồi chạy: node tools/build-edge.mjs
// Phase 1S — "gói bài" AI trả về (định dạng yp-kt-ai/1): kiểm tra + chuẩn hóa TRƯỚC khi dàn trang.
// Nguyên tắc: AI chỉ cung cấp NỘI DUNG. Trạng thái, quyền, HTML, script, SQL… đều bị từ chối hoặc bỏ qua.
// Mọi giới hạn độ dài khớp với ràng buộc của bảng kt_articles.
import { GROUPS, groupById } from './taxonomy.mjs';
import { clip } from './text.mjs';

export const FORMAT = 'yp-kt-ai/1';
export const TOPICS = ['co-ban', 'gioi-tinh-nhan-dang', 'dinh-duong', 'cham-soc-suc-khoe', 'sinh-san-genetics', 'avi-moi-truong'];
export const LAYOUT_IDS = ['chuan', 'tap-chi', 'huong-dan', 'so-sanh', 'hoi-dap'];
export const LIMITS = { sections: [2, 14], faq: 12, sources: [1, 12], images: 8, keyPoints: 8, warnings: 4, mdChars: 6000, totalChars: 60000, jsonBytes: 300000 };

// Khóa tuyệt đối không được có (yêu cầu đổi quyền / chạy mã) → TỪ CHỐI cả gói
const FORBIDDEN = /^(sql|query|script|scripts|js|javascript|html|raw_html|policy|policies|grant|grants|role|kt_role|app_metadata|service_role|permission|permissions|rls|exec|eval|webhook|endpoint|api_key|apikey|token|password)$/i;
// Khóa trạng thái → BỎ QUA (bài luôn là nháp, chỉ OWNER xuất bản)
const IGNORED = /^(status|published_at|reviewed_by_owner|id|created_at|updated_at|origin)$/i;
const DANGEROUS_TEXT = /<\s*script|javascript\s*:|on[a-z]+\s*=\s*["']|<\s*iframe|data\s*:\s*text\/html|drop\s+table|alter\s+table|create\s+policy|grant\s+all|service_role|sb_secret_/i;

const str = v => (typeof v === 'string' ? v : v == null ? '' : String(v));
// Ký tự điều khiển + ký tự định hướng/ẩn (zero-width, line/paragraph separator, bidi) → bỏ
const CTRL = new RegExp('[' + [[0, 8], [11, 12], [14, 31], [127, 127], [0x200B, 0x200F], [0x2028, 0x2029], [0x202A, 0x202E]]
  .map(([a, b]) => String.fromCharCode(a) + '-' + String.fromCharCode(b)).join('') + ']', 'g');
const clean = v => str(v).replace(/\r\n?/g, '\n').replace(CTRL, '').trim();

function scanKeys(obj, path, out) {
  if (Array.isArray(obj)) { obj.forEach((v, i) => scanKeys(v, `${path}[${i}]`, out)); return; }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (FORBIDDEN.test(k)) out.forbidden.push(`${path}.${k}`);
      else if (IGNORED.test(k) && path === '$') out.ignored.push(k);
      scanKeys(v, `${path}.${k}`, out);
    }
  } else if (typeof obj === 'string' && DANGEROUS_TEXT.test(obj)) out.dangerous.push(path);
}

export function validatePackage(input) {
  const errors = [], warnings = [];
  let pkg = input;
  if (typeof pkg === 'string') {
    if (pkg.length > LIMITS.jsonBytes) return { ok: false, errors: ['Gói bài quá lớn.'], warnings };
    try { pkg = JSON.parse(pkg); } catch { return { ok: false, errors: ['Gói bài không phải JSON hợp lệ.'], warnings }; }
  }
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) return { ok: false, errors: ['Gói bài phải là một đối tượng JSON.'], warnings };
  const scan = { forbidden: [], ignored: [], dangerous: [] }; scanKeys(pkg, '$', scan);
  if (scan.forbidden.length) errors.push('Gói chứa khóa bị cấm (yêu cầu quyền / mã thực thi): ' + scan.forbidden.slice(0, 5).join(', '));
  if (scan.dangerous.length) errors.push('Gói chứa nội dung nguy hiểm (script / SQL / khóa bí mật) tại: ' + scan.dangerous.slice(0, 5).join(', '));
  if (scan.ignored.length) warnings.push('Đã bỏ qua: ' + scan.ignored.join(', ') + ' — bài AI luôn là NHÁP, chỉ OWNER xuất bản.');
  if (pkg.format && pkg.format !== FORMAT) warnings.push(`Định dạng "${clean(pkg.format)}" khác ${FORMAT}, vẫn thử đọc.`);

  const g = groupById(clean(pkg.group)) || null;
  if (!g) warnings.push('Nhóm nội dung không hợp lệ → dùng "Kiến thức cho người mới".');
  const group = g || GROUPS[0];
  const topic = TOPICS.includes(clean(pkg.topic)) ? clean(pkg.topic) : group.topic;
  const layout = LAYOUT_IDS.includes(clean(pkg.layout)) ? clean(pkg.layout) : group.layout;

  const lim = (v, n, label, req = false, min = 0) => {
    let s = clean(v);
    if (!s && req) errors.push(`Thiếu ${label}.`);
    if (s && s.length < min) errors.push(`${label} quá ngắn (tối thiểu ${min} ký tự).`);
    if (s.length > n) { warnings.push(`${label} dài ${s.length} ký tự → cắt còn ${n}.`); s = clip(s, n); }
    return s;
  };
  const img = (o, label) => {
    if (!o || typeof o !== 'object') return null;
    const prompt = lim(o.prompt, 1000, `${label}: mô tả ảnh`);
    if (!prompt) { warnings.push(`${label}: không có mô tả ảnh → bỏ ảnh.`); return null; }
    return { prompt, alt: lim(o.alt, 200, `${label}: alt`), caption: lim(o.caption, 240, `${label}: chú thích`) };
  };
  const md = (v, label) => lim(v, LIMITS.mdChars, label);

  const out = {
    format: FORMAT, group: group.id, topic, layout,
    title: lim(pkg.title, 140, 'Tiêu đề', true, 10),
    subtitle: lim(pkg.subtitle, 220, 'Phụ đề'),
    excerpt: lim(pkg.excerpt, 300, 'Mô tả ngắn'),
    seo_title: lim(pkg.seo_title, 70, 'Tiêu đề SEO'),
    seo_description: lim(pkg.seo_description, 170, 'Mô tả SEO'),
    cover: img(pkg.cover, 'Ảnh bìa'),
    intro: md(pkg.intro, 'Mở bài'),
    sections: [], key_points: [], warnings: [], faq: [], sources: []
  };
  if (!out.cover) warnings.push('Chưa có ảnh bìa → bài sẽ cần ảnh trước khi xuất bản.');

  const secs = Array.isArray(pkg.sections) ? pkg.sections : [];
  if (secs.length < LIMITS.sections[0]) errors.push(`Cần ít nhất ${LIMITS.sections[0]} phần nội dung.`);
  for (const [i, s] of secs.slice(0, LIMITS.sections[1]).entries()) {
    if (!s || typeof s !== 'object') continue;
    const L = `Phần ${i + 1}`;
    const sec = { heading: lim(s.heading, 120, `${L}: tiêu đề`, true), md: md(s.md, `${L}: nội dung`), kind: ['text', 'step', 'compare'].includes(s.kind) ? s.kind : 'text' };
    if (!sec.md) errors.push(`${L}: thiếu nội dung.`);
    const im = img(s.image, `${L}: ảnh`); if (im) sec.image = im;
    const ims = (Array.isArray(s.images) ? s.images : []).slice(0, 4).map((x, j) => img(x, `${L}: ảnh ${j + 1}`)).filter(Boolean);
    if (ims.length >= 2) sec.images = ims;
    if (s.note && typeof s.note === 'object') sec.note = { title: lim(s.note.title, 120, `${L}: tiêu đề ghi chú`), md: md(s.note.md, `${L}: ghi chú`) };
    if (s.warning && typeof s.warning === 'object') sec.warning = { title: lim(s.warning.title, 120, `${L}: tiêu đề cảnh báo`), md: md(s.warning.md, `${L}: cảnh báo`) };
    if (s.checklist && Array.isArray(s.checklist.items)) sec.checklist = { title: lim(s.checklist.title, 120, `${L}: checklist`), items: s.checklist.items.slice(0, 15).map(x => lim(x, 300, `${L}: mục checklist`)).filter(Boolean) };
    if (s.table && Array.isArray(s.table.head) && s.table.head.length >= 2) {
      const head = s.table.head.slice(0, 5).map(h => lim(h, 60, `${L}: cột bảng`));
      const rows = (Array.isArray(s.table.rows) ? s.table.rows : []).slice(0, 40).filter(Array.isArray).map(r => head.map((_, k) => lim(r[k], 300, `${L}: ô bảng`)));
      sec.table = { caption: lim(s.table.caption, 140, `${L}: tiêu đề bảng`), head, rows };
    }
    out.sections.push(sec);
  }
  if (secs.length > LIMITS.sections[1]) warnings.push(`Chỉ giữ ${LIMITS.sections[1]} phần đầu.`);
  out.key_points = (Array.isArray(pkg.key_points) ? pkg.key_points : []).slice(0, LIMITS.keyPoints).map(x => lim(x, 240, 'Ý chính')).filter(Boolean);
  out.warnings = (Array.isArray(pkg.warnings) ? pkg.warnings : []).slice(0, LIMITS.warnings).filter(w => w && typeof w === 'object')
    .map(w => ({ title: lim(w.title, 120, 'Tiêu đề cảnh báo'), md: md(w.md, 'Nội dung cảnh báo') })).filter(w => w.md);
  out.faq = (Array.isArray(pkg.faq) ? pkg.faq : []).slice(0, LIMITS.faq).filter(f => f && typeof f === 'object')
    .map(f => ({ q: lim(f.q, 200, 'Câu hỏi FAQ'), a: md(f.a, 'Trả lời FAQ') })).filter(f => f.q && f.a);
  const srcs = Array.isArray(pkg.sources) ? pkg.sources : [];
  for (const s of srcs.slice(0, LIMITS.sources[1])) {
    const o = typeof s === 'string' ? { title: s } : (s && typeof s === 'object' ? s : null); if (!o) continue;
    const title = lim(o.title, 200, 'Tên nguồn'); let url = clean(o.url);
    if (url && !/^https:\/\/[^\s"'<>]+$/i.test(url)) { warnings.push(`Nguồn "${title}": link không phải https → bỏ link.`); url = ''; }
    if (title) out.sources.push({ title, url, publisher: lim(o.publisher, 120, 'Đơn vị phát hành') });
  }
  if (out.sources.length < LIMITS.sources[0]) errors.push('Cần ít nhất 1 nguồn tham khảo.');
  out.review_notes = (Array.isArray(pkg.review_notes) ? pkg.review_notes : []).slice(0, 12).map(x => lim(x, 400, 'Ghi chú cho OWNER')).filter(Boolean);
  const imgCount = (out.cover ? 1 : 0) + out.sections.reduce((n, s) => n + (s.image ? 1 : 0) + (s.images ? s.images.length : 0), 0);
  if (imgCount > LIMITS.images) warnings.push(`${imgCount} ảnh > giới hạn ${LIMITS.images}: chỉ tạo ${LIMITS.images} ảnh đầu, phần còn lại để ô trống.`);
  const total = JSON.stringify(out).length;
  if (total > LIMITS.totalChars) errors.push(`Bài quá dài (${total} ký tự, tối đa ${LIMITS.totalChars}).`);
  return { ok: errors.length === 0, errors, warnings, value: out };
}

// Schema JSON gửi kèm yêu cầu cho AI (OpenAI structured output / hướng dẫn cho nhà cung cấp khác).
export const JSON_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['format', 'group', 'topic', 'layout', 'title', 'subtitle', 'excerpt', 'seo_title', 'seo_description', 'cover', 'intro', 'sections', 'key_points', 'warnings', 'faq', 'sources'],
  properties: {
    format: { type: 'string', enum: [FORMAT] }, group: { type: 'string', enum: GROUPS.map(g => g.id) }, topic: { type: 'string', enum: TOPICS }, layout: { type: 'string', enum: LAYOUT_IDS },
    title: { type: 'string' }, subtitle: { type: 'string' }, excerpt: { type: 'string' }, seo_title: { type: 'string' }, seo_description: { type: 'string' },
    cover: { $ref: '#/$defs/img' }, intro: { type: 'string' },
    sections: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['heading', 'md', 'kind', 'image'],
      properties: { heading: { type: 'string' }, md: { type: 'string' }, kind: { type: 'string', enum: ['text', 'step', 'compare'] }, image: { anyOf: [{ $ref: '#/$defs/img' }, { type: 'null' }] },
        images: { type: 'array', items: { $ref: '#/$defs/img' } }, note: { $ref: '#/$defs/box' }, warning: { $ref: '#/$defs/box' },
        checklist: { type: 'object', properties: { title: { type: 'string' }, items: { type: 'array', items: { type: 'string' } } } },
        table: { type: 'object', properties: { caption: { type: 'string' }, head: { type: 'array', items: { type: 'string' } }, rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } } } } } } },
    key_points: { type: 'array', items: { type: 'string' } }, warnings: { type: 'array', items: { $ref: '#/$defs/box' } },
    faq: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['q', 'a'], properties: { q: { type: 'string' }, a: { type: 'string' } } } },
    sources: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['title', 'url', 'publisher'], properties: { title: { type: 'string' }, url: { type: 'string' }, publisher: { type: 'string' } } } }
  },
  $defs: {
    img: { type: 'object', additionalProperties: false, required: ['prompt', 'alt', 'caption'], properties: { prompt: { type: 'string' }, alt: { type: 'string' }, caption: { type: 'string' } } },
    box: { type: 'object', additionalProperties: false, required: ['title', 'md'], properties: { title: { type: 'string' }, md: { type: 'string' } } }
  }
};
