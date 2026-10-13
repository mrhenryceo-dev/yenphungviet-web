// Phase 1R / R4 — test các hàm xử lý ảnh không cần trình duyệt (chạy: node tools/kt-media-test.mjs).
import assert from 'node:assert/strict';
import { checkInput, fitSize, cropRect, variantPath, parseName, groupLibrary, imagePathsOf, newId, LIMITS } from '../quan-tri/media.mjs';
import { imgSrc, figure } from '../assets/kt/render.mjs';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('✓', name); };

t('Chỉ nhận JPEG/PNG/WebP, chặn SVG/HEIC/GIF/HTML', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) assert.equal(checkInput({ type, size: 1000, name: 'a' }), '');
  for (const type of ['image/svg+xml', 'image/heic', 'image/gif', 'text/html', 'application/octet-stream', '']) assert.ok(checkInput({ type, size: 10, name: 'x' }));
});
t('Chặn file > 30 MB', () => {
  assert.ok(checkInput({ type: 'image/jpeg', size: LIMITS.inputBytes + 1, name: 'to.jpg' }));
});
t('Thu nhỏ giữ tỉ lệ, không phóng to', () => {
  assert.deepEqual(fitSize(4000, 3000, 1600), { w: 1600, h: 1200 });
  assert.deepEqual(fitSize(3000, 4000, 1600), { w: 1200, h: 1600 });
  assert.deepEqual(fitSize(900, 600, 1600), { w: 900, h: 600 });
});
t('Khung cắt OG 1200×630 bám điểm lấy nét, không vượt ra ngoài ảnh', () => {
  const R = 1200 / 630;
  const c = cropRect(1600, 1200, R, { x: 50, y: 50 });
  assert.equal(c.w, 1600); assert.ok(Math.abs(c.w / c.h - R) < 0.01); assert.equal(c.y, Math.round(600 - c.h / 2));
  assert.equal(cropRect(1600, 1200, R, { x: 50, y: 0 }).y, 0);
  const bottom = cropRect(1600, 1200, R, { x: 50, y: 100 }); assert.equal(bottom.y + bottom.h, 1200);
  const tall = cropRect(800, 2000, R, { x: 10, y: 90 }); assert.ok(tall.x >= 0 && tall.y >= 0 && tall.y + tall.h <= 2000 && tall.x + tall.w <= 800);
  const wide = cropRect(4000, 1000, R, { x: 100, y: 50 }); assert.equal(wide.x + wide.w, 4000); assert.equal(wide.h, 1000);
});
t('Tên file ngẫu nhiên UUID trong img/, hợp lệ với imgSrc của trang công khai', () => {
  const id = newId(); assert.match(id, /^[0-9a-f-]{36}$/);
  const p = variantPath(id, 1600, 'webp'); assert.equal(p, `img/${id}-1600.webp`);
  assert.ok(imgSrc(p).endsWith('/storage/v1/object/public/kien-thuc/' + p));
  assert.deepEqual(parseName(p), { id, kind: '1600', ext: 'webp' });
  assert.equal(parseName('img/../../x-1600.webp'), null); assert.equal(parseName('img/abc-1600.webp'), null);
  assert.notEqual(newId(), newId());
});
t('Thư viện gom 3 bản thành 1 ảnh, bỏ file lạ, mới nhất trước', () => {
  const a = newId(), b = newId();
  const g = groupLibrary([
    { name: `${a}-1600.webp`, created_at: '2026-10-01T00:00:00Z' }, { name: `${a}-800.webp`, created_at: '2026-10-01T00:00:00Z' }, { name: `${a}-og.jpg`, created_at: '2026-10-02T00:00:00Z' },
    { name: `${b}-1600.jpg`, created_at: '2026-10-05T00:00:00Z' }, { name: 'la.png' }, { name: '.emptyFolderPlaceholder' }, { name: `${newId()}-og.jpg` }
  ]);
  assert.equal(g.length, 2); assert.equal(g[0].id, b); assert.equal(g[0].sm, '');
  assert.deepEqual([g[1].lg, g[1].sm, g[1].og], [`img/${a}-1600.webp`, `img/${a}-800.webp`, `img/${a}-og.jpg`]);
});
t('Liệt kê mọi ảnh một bài đang dùng (bìa, OG, ảnh lớn, ảnh cạnh chữ, bộ ảnh)', () => {
  const s = imagePathsOf({ cover: { path: 'img/c-1600.webp', path_sm: 'img/c-800.webp', og_path: 'img/o-og.jpg' },
    blocks: [{ type: 'image', img: { path: 'img/i-1600.webp' } }, { type: 'gallery', imgs: [{ path: 'img/g1-1600.webp' }, { path: '' }] }, null, { type: 'text', md: 'x' }] });
  assert.deepEqual([...s].sort(), ['img/c-1600.webp', 'img/c-800.webp', 'img/g1-1600.webp', 'img/i-1600.webp', 'img/o-og.jpg']);
});
t('srcset dùng độ rộng thật của bản nhỏ; ảnh nhỏ (không có bản 800) không có srcset', () => {
  const h = figure({ path: 'img/a-1600.webp', path_sm: 'img/a-800.webp', w: 1200, h: 1600, w_sm: 600 }, {});
  assert.ok(h.includes(' 600w, ') && h.includes(' 1200w"'), h);
  assert.ok(!figure({ path: 'img/a-1600.webp', w: 700, h: 500 }, {}).includes('srcset'));
});

console.log(`\n${n} test xử lý ảnh đạt.`);
