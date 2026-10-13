// Phase 1R — test bộ render (chạy: node tools/kt-render-test.mjs). Không gọi mạng.
import assert from 'node:assert/strict';
import * as R from '../assets/kt/render.mjs';
import { KT } from '../assets/kt/config.mjs';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('✓', name); };

t('escape HTML trong văn bản', () => {
  const h = R.renderBlocks([{ type: 'text', md: '<script>alert(1)</script> <img src=x onerror=alert(1)>' }]);
  assert.ok(!h.includes('<script'), 'không được có <script'); assert.ok(!h.includes('<img src=x'), 'không được có <img thô');
  assert.ok(h.includes('&lt;script&gt;'));
});
t('chặn link javascript:, data:, //', () => {
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', '//evil.com', 'http://insecure.com', 'https://a.com/"onmouseover="x', 'https://a.com/**x**']) {
    const h = R.inline(`[x](${bad})`); assert.ok(!/<a /.test(h), 'không tạo link cho: ' + bad);
  }
});
t('cho phép link https, nội bộ, tel', () => {
  assert.ok(R.inline('[a](https://example.com)').includes('href="https://example.com"'));
  assert.ok(R.inline('[a](https://example.com)').includes('rel="noopener nofollow"'));
  assert.ok(R.inline('[a](/kien-thuc/abc/)').includes('href="/kien-thuc/abc/"'));
  assert.ok(R.inline('[a](tel:0967653899)').includes('href="tel:0967653899"'));
});
t('đậm, nghiêng, H2/H3, danh sách', () => {
  const h = R.mdToHtml('## A\n### B\n**đậm** *nghiêng*\n\n- x\n- y\n\n1. m\n2. n');
  for (const s of ['<h2>A</h2>', '<h3>B</h3>', '<strong>đậm</strong>', '<em>nghiêng</em>', '<ul><li>x</li><li>y</li></ul>', '<ol><li>m</li><li>n</li></ol>']) assert.ok(h.includes(s), s);
});
t('khối lạ bị bỏ qua', () => { assert.equal(R.renderBlocks([{ type: 'html', html: '<b>x</b>' }, { type: 'script_thu' }]), ''); });
t('ảnh: chỉ nhận /assets/ hoặc khóa bucket, chặn URL ngoài và ../', () => {
  assert.equal(R.imgSrc('https://evil.com/a.webp'), null);
  assert.equal(R.imgSrc('../secret.webp'), null);
  assert.equal(R.imgSrc('a/../b.webp'), null);
  assert.ok(R.imgSrc('/assets/nhom-choi/pet-02.webp'));
  assert.ok(R.imgSrc('abc/123-1600.webp').startsWith(KT.supabaseUrl + '/storage/v1/object/public/kien-thuc/'));
});
t('focus ảnh bị giới hạn 0–100, không chèn CSS', () => {
  const h = R.figure({ path: '/assets/x.webp', focus: { x: '50;background:url(x)', y: 500 } });
  assert.ok(h.includes('object-position:50% 100%') || h.includes('object-position:50% 100%'), h);
  assert.ok(!h.includes('background:url'));
});
t('nhãn Ảnh minh họa mặc định, tắt được khi ai=false', () => {
  assert.ok(R.figure({ path: '/assets/x.webp' }).includes('Ảnh minh họa'));
  assert.ok(!R.figure({ path: '/assets/x.webp', ai: false }).includes('Ảnh minh họa'));
});
t('đủ 11 kiểu khối render ra nội dung', () => {
  const img = { path: '/assets/x.webp' };
  const blocks = [
    { type: 'text', md: 'a' }, { type: 'image', img }, { type: 'image_text', side: 'left', img, md: 'b' }, { type: 'image_text', side: 'right', img, md: 'c' },
    { type: 'gallery', imgs: [img, img] }, { type: 'note', md: 'd' }, { type: 'warning', md: 'e' }, { type: 'checklist', items: ['f'] },
    { type: 'table', head: ['h'], rows: [['g']] }, { type: 'faq', items: [{ q: 'q', a_md: 'a' }] }, { type: 'cta', kind: 'zalo' }];
  for (const b of blocks) assert.ok(R.renderBlocks([b]).length > 20, b.type);
});
t('CTA zalo cố định 0967653899, slug sai bị bỏ', () => {
  assert.ok(R.renderBlocks([{ type: 'cta', kind: 'zalo' }]).includes('https://zalo.me/0967653899'));
  assert.equal(R.renderBlocks([{ type: 'cta', kind: 'article', slug: '../x' }]), '');
});
t('bảng có data-label cho mobile', () => { assert.ok(R.renderBlocks([{ type: 'table', head: ['Tuổi'], rows: [['1']] }]).includes('data-label="Tuổi"')); });
t('trang bài: canonical, OG tuyệt đối, JSON-LD không vỡ </script>', () => {
  const a = { slug: 'abc-def', topic: 'co-ban', title: 'X </script><script>alert(1)</script>', seo_description: 'mô tả', cover: { path: 'k/a-1600.webp', og_path: 'k/og.jpg' }, blocks: [], sources: ['s'], published_at: '2026-10-13T00:00:00Z' };
  const h = R.renderArticlePage(a, []);
  assert.ok(h.includes('<link rel="canonical" href="https://yenphungviet.vercel.app/kien-thuc/abc-def/">'));
  assert.ok(h.includes('property="og:image" content="' + KT.supabaseUrl + '/storage/v1/object/public/kien-thuc/k/og.jpg"'));
  assert.equal((h.match(/<script/g) || []).length, 2, 'chỉ có JSON-LD và kien-thuc.js');
});
t('bài có cảnh báo → ẩn nút mua chim cuối bài', () => {
  const base = { slug: 'abc', topic: 'co-ban', title: 'T', blocks: [], sources: [] };
  assert.ok(R.articleBodyHtml(base).includes('kt-end-cta'));
  assert.ok(!R.articleBodyHtml({ ...base, blocks: [{ type: 'warning', md: 'x' }] }).includes('kt-end-cta'));
});
t('sitemap', () => { const x = R.sitemapXml([{ slug: 'abc', updated_at: '2026-10-13T00:00:00Z' }]); assert.ok(x.includes('<loc>https://yenphungviet.vercel.app/kien-thuc/abc/</loc><lastmod>2026-10-13</lastmod>')); });

console.log(`\n${n} test đạt.`);
