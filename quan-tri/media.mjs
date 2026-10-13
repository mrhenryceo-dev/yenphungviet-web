// Phase 1R / R4 — xử lý ảnh trong trình duyệt trước khi tải lên bucket "kien-thuc".
// - Chỉ nhận JPEG / PNG / WebP từ máy (tối đa 30 MB, 50 megapixel). Ảnh được vẽ lại qua canvas
//   → tự BỎ toàn bộ EXIF (vị trí GPS, thông tin máy chụp) trước khi rời máy OWNER.
// - Tạo 3 bản: lớn (≤1600px), nhỏ cho điện thoại (≤800px), ảnh chia sẻ link 1200×630 (JPEG, cắt theo điểm lấy nét).
// - Tên file ngẫu nhiên (UUID) trong thư mục img/ → không đoán được đường dẫn ảnh của bài nháp.
// Các hàm "thuần" (không cần trình duyệt) được export để test bằng Node.

export const LIMITS = { inputBytes: 30 * 1024 * 1024, inputPixels: 50e6, outputBytes: 4.8 * 1024 * 1024, lg: 1600, sm: 800, og: { w: 1200, h: 630 } };
export const INPUT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const NAME_RE = /^img\/([0-9a-f-]{36})-(1600|800|og)\.(webp|jpg)$/;

export function checkInput(file) {
  if (!file) return 'Chưa chọn ảnh.';
  if (!INPUT_TYPES.includes(file.type)) return `“${file.name || 'ảnh'}” không phải JPEG/PNG/WebP. Ảnh HEIC của iPhone: mở ảnh → Chia sẻ → lưu dạng JPEG rồi tải lại.`;
  if (file.size > LIMITS.inputBytes) return `“${file.name}” quá lớn (${(file.size / 1048576).toFixed(1)} MB, tối đa 30 MB).`;
  return '';
}
// Thu nhỏ giữ tỉ lệ, không phóng to.
export function fitSize(w, h, max) {
  if (w <= max && h <= max) return { w, h };
  const k = max / Math.max(w, h);
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}
// Vùng cắt theo tỉ lệ đích, đặt tâm gần điểm lấy nét nhất có thể (focus tính bằng %).
export function cropRect(w, h, ratio, focus = { x: 50, y: 50 }) {
  let cw = w, ch = Math.round(w / ratio);
  if (ch > h) { ch = h; cw = Math.round(h * ratio); }
  const pct = v => { const n = Number(v); return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) / 100 : 0.5; };   // 0% là hợp lệ
  const fx = pct(focus && focus.x), fy = pct(focus && focus.y);
  const x = Math.min(w - cw, Math.max(0, Math.round(fx * w - cw / 2)));
  const y = Math.min(h - ch, Math.max(0, Math.round(fy * h - ch / 2)));
  return { x, y, w: cw, h: ch };
}
export const newId = () => crypto.randomUUID();
export const variantPath = (id, kind, ext) => `img/${id}-${kind}.${ext}`;
export function parseName(path) {
  const m = NAME_RE.exec(String(path || '')); return m ? { id: m[1], kind: m[2], ext: m[3] } : null;
}
// Gom danh sách file trong bucket thành từng ảnh { id, lg, sm, og, created }.
export function groupLibrary(entries) {
  const by = new Map();
  for (const e of entries || []) {
    const p = parseName(e.name.startsWith('img/') ? e.name : 'img/' + e.name); if (!p) continue;
    const g = by.get(p.id) || { id: p.id, lg: '', sm: '', og: '', created: '' };
    g[{ 1600: 'lg', 800: 'sm', og: 'og' }[p.kind]] = variantPath(p.id, p.kind, p.ext);
    if (e.created_at && (!g.created || e.created_at > g.created)) g.created = e.created_at;
    by.set(p.id, g);
  }
  return [...by.values()].filter(g => g.lg).sort((a, b) => String(b.created).localeCompare(String(a.created)));
}
// Mọi đường dẫn ảnh một bài đang dùng (để cảnh báo trước khi xóa ảnh khỏi thư viện).
export function imagePathsOf(article) {
  const out = new Set(); const add = im => { if (im) for (const k of ['path', 'path_sm', 'og_path']) if (im[k]) out.add(im[k]); };
  add(article && article.cover);
  for (const b of (article && article.blocks) || []) { if (!b) continue; add(b.img); (b.imgs || []).forEach(add); }
  return out;
}

// ---------- phần chạy trong trình duyệt ----------
function canvasBlob(canvas, type, quality) {
  return new Promise(res => canvas.toBlob(b => res(b), type, quality));
}
async function encode(src, sx, sy, sw, sh, dw, dh, prefer) {
  const c = document.createElement('canvas'); c.width = dw; c.height = dh;
  const ctx = c.getContext('2d', { alpha: prefer === 'image/webp' });
  if (prefer === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, dw, dh); }   // PNG trong suốt → nền trắng cho JPEG
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, dw, dh);
  for (const q of [0.82, 0.72, 0.6, 0.5]) {
    let b = await canvasBlob(c, prefer, q);
    if (b && prefer === 'image/webp' && b.type !== 'image/webp') b = await canvasBlob(c, 'image/jpeg', q);   // trình duyệt cũ không nén được WebP
    if (b && b.size <= LIMITS.outputBytes) return b;
  }
  throw new Error('Ảnh sau khi nén vẫn quá 5 MB.');
}
const extOf = blob => (blob.type === 'image/webp' ? 'webp' : 'jpg');

async function decode(fileOrBlob) {
  try { return await createImageBitmap(fileOrBlob, { imageOrientation: 'from-image' }); }
  catch { throw new Error('Không đọc được ảnh (file hỏng hoặc định dạng không hỗ trợ).'); }
}

// Nén 1 file → { id, files: [{path, blob}], img: {path, path_sm, w, h, w_sm, og_path?} }
export async function processFile(file, { focus = { x: 50, y: 50 }, withOg = false } = {}) {
  const err = checkInput(file); if (err) throw new Error(err);
  const bmp = await decode(file);
  try {
    if (bmp.width * bmp.height > LIMITS.inputPixels) throw new Error('Ảnh quá nhiều điểm ảnh (tối đa 50 megapixel).');
    const id = newId(); const files = [];
    const lg = fitSize(bmp.width, bmp.height, LIMITS.lg);
    const lgBlob = await encode(bmp, 0, 0, bmp.width, bmp.height, lg.w, lg.h, 'image/webp');
    const img = { path: variantPath(id, 1600, extOf(lgBlob)), path_sm: '', w: lg.w, h: lg.h, w_sm: 0 };
    files.push({ path: img.path, blob: lgBlob });
    if (Math.max(lg.w, lg.h) > LIMITS.sm) {
      const sm = fitSize(bmp.width, bmp.height, LIMITS.sm);
      const smBlob = await encode(bmp, 0, 0, bmp.width, bmp.height, sm.w, sm.h, 'image/webp');
      img.path_sm = variantPath(id, 800, extOf(smBlob)); img.w_sm = sm.w;
      files.push({ path: img.path_sm, blob: smBlob });
    }
    if (withOg) { const og = await ogBlob(bmp, focus); img.og_path = variantPath(id, 'og', 'jpg'); files.push({ path: img.og_path, blob: og }); }
    return { id, files, img };
  } finally { bmp.close && bmp.close(); }
}
async function ogBlob(src, focus) {
  const r = cropRect(src.width, src.height, LIMITS.og.w / LIMITS.og.h, focus);
  return encode(src, r.x, r.y, r.w, r.h, LIMITS.og.w, LIMITS.og.h, 'image/jpeg');
}
// Tạo lại ảnh chia sẻ link khi OWNER đổi điểm lấy nét của ảnh bìa (đọc lại bản 1600 đã tải lên).
export async function ogFromUrl(url, focus) {
  const r = await fetch(url, { mode: 'cors', cache: 'no-store' });
  if (!r.ok) throw new Error('Không tải lại được ảnh bìa.');
  const bmp = await decode(await r.blob());
  try { return await ogBlob(bmp, focus); } finally { bmp.close && bmp.close(); }
}
