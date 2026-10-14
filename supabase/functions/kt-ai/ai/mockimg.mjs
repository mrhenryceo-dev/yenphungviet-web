// BẢN SAO TỰ ĐỘNG từ assets/kt/ai/mockimg.mjs — KHÔNG sửa ở đây. Sửa bản gốc rồi chạy: node tools/build-edge.mjs
// Phase 1S — ảnh GIỮ CHỖ cho mock provider (không gọi mạng, không chi phí).
// Sinh PNG thật (để đi qua đúng pipeline nén WebP) gồm nền chuyển màu + sọc chéo + khung — KHÔNG phải ảnh chim.
// Trang bài vẫn gắn nhãn "Ảnh minh họa"; chú thích ghi rõ "[MÔ PHỎNG]".

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const u32 = n => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
function chunk(type, data) {
  const t = new TextEncoder().encode(type); const body = new Uint8Array(t.length + data.length); body.set(t); body.set(data, t.length);
  const out = new Uint8Array(12 + data.length); out.set(u32(data.length)); out.set(body, 4); out.set(u32(crc32(body)), 8 + data.length); return out;
}
async function deflate(raw) {
  const cs = new CompressionStream('deflate');           // zlib (đúng chuẩn PNG IDAT)
  const ab = await new Response(new Blob([raw]).stream().pipeThrough(cs)).arrayBuffer();
  return new Uint8Array(ab);
}
// seed: chuỗi bất kỳ (prompt) → màu ổn định
function hue(seed) { let h = 0; for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 360; }
function hsl(h, s, l) {
  s /= 100; l /= 100; const k = n => (n + h / 30) % 12; const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
export async function placeholderPng(seed, ratio = '16:9') {
  const [w, h] = ratio === '1:1' ? [720, 720] : ratio === '4:3' ? [800, 600] : [960, 540];
  const base = hue(seed), c1 = hsl(base, 38, 78), c2 = hsl((base + 40) % 360, 42, 62), stripe = hsl(base, 30, 88);
  const raw = new Uint8Array(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    const row = y * (1 + w * 3); raw[row] = 0;
    for (let x = 0; x < w; x++) {
      const t = (x / w + y / h) / 2; let r = c1[0] + (c2[0] - c1[0]) * t, g = c1[1] + (c2[1] - c1[1]) * t, b = c1[2] + (c2[2] - c1[2]) * t;
      if (((x + y) >> 4) % 6 === 0) { r = stripe[0]; g = stripe[1]; b = stripe[2]; }
      if (x < 6 || y < 6 || x >= w - 6 || y >= h - 6) { r = 255; g = 255; b = 255; }
      const i = row + 1 + x * 3; raw[i] = r; raw[i + 1] = g; raw[i + 2] = b;
    }
  }
  const ihdr = new Uint8Array(13); ihdr.set(u32(w)); ihdr.set(u32(h), 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', await deflate(raw)), chunk('IEND', new Uint8Array())];
  const len = parts.reduce((s, p) => s + p.length, 0); const png = new Uint8Array(len); let o = 0; for (const p of parts) { png.set(p, o); o += p.length; }
  return png;
}
export function toBase64(u8) {
  let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return typeof btoa === 'function' ? btoa(s) : Buffer.from(u8).toString('base64');
}
export function fromBase64(b64) {
  if (typeof atob === 'function') { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
  return new Uint8Array(Buffer.from(b64, 'base64'));
}
