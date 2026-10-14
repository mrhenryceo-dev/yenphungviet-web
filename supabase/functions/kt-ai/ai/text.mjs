// BẢN SAO TỰ ĐỘNG từ assets/kt/ai/text.mjs — KHÔNG sửa ở đây. Sửa bản gốc rồi chạy: node tools/build-edge.mjs
// Phase 1S — tiện ích chữ tiếng Việt: bỏ dấu, slug, tách từ, độ giống nhau (chống trùng chủ đề).

export function fold(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
}
export function slugify(s, max = 80) {
  return fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '');
}
// Từ dừng (CÓ DẤU — so chủ đề bằng chữ có dấu vì bỏ dấu gây trùng nghĩa: "ẩn"/"ăn" → "an", "trống"/"trong" → "trong")
const STOP = new Set(('và là của cho khi nào thế như những các một hai ba có không để được trong ngoài với hay hoặc về từ đến '
  + 'bao nhiêu gì sao vì nên cần phải cách yến phụng chim bé con làm ở tại này đó mới dấu hiệu nhận biết theo thường gặp mỗi').split(' '));
export function words(s) {
  return String(s || '').normalize('NFC').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w && !STOP.has(w) && !/^\d+$/.test(w));
}
// Jaccard trên tập từ khóa + cặp từ liên tiếp (ổn định với cách đặt câu khác nhau)
export function similarity(a, b) {
  const grams = s => { const w = words(s); const g = new Set(w); for (let i = 0; i < w.length - 1; i++) g.add(w[i] + ' ' + w[i + 1]); return g; };
  const A = grams(a), B = grams(b); if (!A.size || !B.size) return 0;
  let inter = 0; for (const x of A) if (B.has(x)) inter++;
  const jac = inter / (A.size + B.size - inter);
  // Bao hàm: mọi từ khóa của tiêu đề ngắn đều có trong tiêu đề dài ("Ăn gì?" ⊂ "Ăn gì mỗi ngày?") → gần như trùng chủ đề
  const wa = new Set(words(a)), wb = new Set(words(b)); const small = wa.size <= wb.size ? wa : wb, big = small === wa ? wb : wa;
  let cov = 0; for (const w of small) if (big.has(w)) cov++;
  const contain = small.size ? cov / small.size : 0;
  // Chỉ coi là "trùng" khi tiêu đề ngắn có ≥3 từ khóa; ít hơn → tối đa "gần trùng" (cảnh báo, OWNER quyết)
  return Math.max(jac, contain === 1 && small.size >= 3 ? 0.7 : contain * 0.45);
}
// So một tiêu đề với danh sách { title, slug?, kind } → mức trùng cao nhất
export function nearest(title, pool) {
  let best = { score: 0, item: null };
  for (const it of pool || []) {
    const sc = Math.max(similarity(title, it.title || ''), it.slug ? similarity(title, String(it.slug).replace(/-/g, ' ')) : 0);
    if (sc > best.score) best = { score: sc, item: it };
  }
  return best;
}
export const DUP = { block: 0.6, warn: 0.34 };   // ≥0.6 coi là trùng, ≥0.34 gần trùng (cảnh báo)
export function dupCheck(title, pool) {
  const n = nearest(title, pool);
  return { level: n.score >= DUP.block ? 'trung' : n.score >= DUP.warn ? 'gan-trung' : 'moi', score: Math.round(n.score * 100) / 100, with: n.item };
}
export function uniqueSlug(base, taken) {
  const t = new Set(taken || []); let s = base && base.length >= 3 ? base : (base || 'bai-viet') + '-moi';
  if (!t.has(s)) return s;
  for (let i = 2; i < 1000; i++) { const c = `${s.slice(0, 76)}-${i}`; if (!t.has(c)) return c; }
  return `${s.slice(0, 60)}-${Date.now().toString(36)}`;
}
export function clip(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); if (s.length <= n) return s; const c = s.slice(0, n - 1); return c.slice(0, Math.max(c.lastIndexOf(' '), n - 20)).replace(/[,;:.\-–— ]+$/, '') + '…'; }
export function stripMd(md) { return String(md || '').replace(/^#+\s+/gm, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_`>#-]/g, ' ').replace(/\s+/g, ' ').trim(); }
export const wordCount = s => stripMd(s).split(/\s+/).filter(Boolean).length;
