// Trang /doi-tac/ — test nội dung tĩnh theo đặc tả OWNER (chạy: node tools/doi-tac-page-test.mjs). Không gọi mạng.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as R from '../assets/kt/render.mjs';

const read = p => readFile(new URL('../' + p, import.meta.url), 'utf8');
const html = await read('doi-tac/index.html');
const js = (await read('assets/js/doi-tac.js')) + (await read('assets/js/doi-tac-calc.js'));
const text = html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

let n = 0; const t = (name, fn) => { fn(); n++; console.log('✓', name); };
const count = (s, re) => (s.match(re) || []).length;

t('SEO: title, meta, canonical, OG đúng đặc tả', () => {
  assert.ok(html.includes('<title>Đối Tác Nuôi Yến Phụng Sinh Sản | Tính Vốn &amp; Chi Phí</title>'));
  assert.ok(html.includes('content="Tìm hiểu mô hình nuôi Yến Phụng sinh sản, cách chuẩn bị giống, lồng trại, thức ăn và mô phỏng dòng tiền 12 tháng. Nhận tư vấn từ Ji."'));
  assert.ok(html.includes('<link rel="canonical" href="https://yenphungviet.vercel.app/doi-tac/">'));
  assert.ok(html.includes('property="og:url" content="https://yenphungviet.vercel.app/doi-tac/"'));
  assert.ok(html.includes('property="og:image" content="https://yenphungviet.vercel.app/assets/brand/og-yenphungpet.jpg"'));
});
t('Đúng một H1, có nhiều H2', () => {
  assert.equal(count(html, /<h1[\s>]/g), 1);
  assert.ok(count(html, /<h2[\s>]/g) >= 10);
});
t('Không có schema, tracking, form ghi dữ liệu, Supabase hay dịch vụ AI', () => {
  assert.ok(!/application\/ld\+json|schema\.org/i.test(html));
  assert.ok(!/gtag|googletagmanager|fbq\(|facebook\.net|hotjar|clarity\.ms/i.test(html + js));
  assert.ok(!/supabase/i.test(html.replace(/<!--[\s\S]*?-->/g, '') + js.replace(/\/\/.*$/gm, '')));
  assert.ok(!/openai|anthropic|api\.|fetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage/i.test(js.replace(/\/\/.*$/gm, '')));
  assert.ok(!/<form[^>]*\baction=/i.test(html));
});
t('Không có tuyên bố bị cấm', () => {
  const banned = [/thu nhập thụ động/i, /không tốn công/i, /cam kết lợi nhuận/i, /bao tiêu đầu ra/i, /đảm bảo sinh sản/i, /chắc chắn (có lãi|sinh lời)/i, /hoàn vốn (sau|trong) \d/i, /chỉ mất \d+ phút/i, /lợi nhuận \d/i, /dễ bán/ ];
  const safe = text.replace('mức độ dễ bán', '');
  for (const re of banned) assert.ok(!re.test(safe), 'cụm bị cấm: ' + re);
  assert.ok(!/lãi/i.test(js.replace(/\/\/.*$/gm, '').replace(/tiền lãi/g, '')), 'code không được dùng từ "lãi" cho kết quả');
  assert.ok(!/đồng hồ đếm|còn \d+ suất|chỉ còn \d+/i.test(text), 'không đếm ngược/giới hạn giả');
});
t('Thông điệp và tiêu đề bắt buộc có mặt', () => {
  for (const s of [
    'Nuôi Yến Phụng sinh sản — Bắt đầu đúng, phát triển bền vững',
    'Bắt đầu nuôi Yến Phụng sinh sản có kế hoạch: vốn rõ ràng, quy trình dễ hiểu, chi phí kiểm soát được và có người đồng hành.',
    'Tìm hiểu mô hình nuôi sinh sản từ A–Z, tự tính vốn và chi phí, chuẩn bị lồng trại và lựa chọn quy mô phù hợp trước khi bắt đầu cùng Yến Phụng PET.',
    'Tính vốn khởi đầu', 'Khám phá quy trình', 'Nhận tư vấn từ Ji',
    'Đây là công cụ mô phỏng, không phải dự báo hoặc cam kết kết quả kinh doanh.',
    'Bắt đầu nhỏ, chăm sóc đúng, phát triển theo khả năng của bạn.',
    'Chưa cần mua ngay. Hãy trao đổi với Ji về không gian, thời gian, ngân sách và mục tiêu để chọn cách bắt đầu phù hợp.',
    'Nhắn Zalo Ji', 'Gọi 0967653899', 'Quay lại máy tính kinh tế', 'Gói Trải nghiệm', 'Gói Khởi đầu', 'Gói Mở rộng'
  ]) assert.ok(text.includes(s) || js.includes(s), 'thiếu: ' + s);
});
t('Đủ 6 câu tự đánh giá, 10 nhóm chuẩn bị, 10 rủi ro, 10 câu FAQ, 3 gói', () => {
  assert.equal(count(html, /name="fit"/g), 6);
  assert.equal(count(html, /name="prep"/g), 10);
  assert.equal(count(html.slice(html.indexOf('class="dtp-risks"'), html.indexOf('id="goi"')), /<li>/g), 10);
  assert.equal(count(html.slice(html.indexOf('class="dtp-faq"'), html.indexOf('id="lien-he"')), /<details>/g), 10);
  assert.equal(count(html, /class="dtp-pack"/g), 3);
  assert.equal(count(html, />Nhận tư vấn và báo giá</g), 3);
});
t('Ảnh: mọi ảnh trong nội dung đều có alt và nhãn AI; không có ảnh ngoài', () => {
  const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
  const imgs = main.match(/<img [^>]+>/g);
  assert.ok(imgs.length >= 7);
  for (const i of imgs) {
    assert.ok(/alt="Ảnh minh họa do AI tạo: /.test(i), i);
    assert.ok(/src="\/assets\//.test(i), i);
    assert.ok(/width="\d+" height="\d+"/.test(i), i);
  }
  assert.equal(count(main, /<figcaption class="ai-badge">Ảnh minh họa do AI tạo<\/figcaption>/g), imgs.length);
  assert.equal(count(main, /loading="lazy"/g), imgs.length - 1); // chỉ ảnh hero tải ngay
});
t('Liên hệ: mọi link Zalo và tel đúng số 0967653899', () => {
  const links = html.match(/href="(https:\/\/zalo\.me\/[^"]*|tel:[^"]*)"/g);
  assert.ok(links.length >= 8);
  for (const l of links) assert.ok(l === 'href="https://zalo.me/0967653899"' || l === 'href="tel:0967653899"', l);
});
t('CTA Zalo có ở đủ 5 vị trí đặc tả', () => {
  const sec = id => { const i = html.indexOf('id="' + id + '"'); return html.slice(i, html.indexOf('</section>', i)); };
  for (const id of ['phu-hop', 'may-tinh', 'goi', 'lien-he']) assert.ok(sec(id).includes('https://zalo.me/0967653899'), id);
  assert.ok(html.slice(html.indexOf('dtp-hero'), html.indexOf('id="vi-sao"')).includes('https://zalo.me/0967653899'), 'hero');
});
t('Anchor nội bộ đều trỏ tới id có thật', () => {
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
  const anchors = [...html.matchAll(/href="#([^"]+)"/g)].map(m => m[1]);
  assert.ok(anchors.length >= 12);
  for (const a of anchors) assert.ok(ids.has(a), '#' + a);
});
t('Internal link tới Kiến thức, Cẩm nang, danh mục chim', () => {
  for (const h of ['/kien-thuc/"', '/#cam-nang"', '/#catalogue"', '/#chim-dang-tim-chu"', '/chon-nhom-choi']) assert.ok(html.includes('href="' + h), h);
});
t('Link mở tab mới đều có rel noopener', () => {
  for (const a of html.match(/<a [^>]*target="_blank"[^>]*>/g)) assert.ok(/rel="noopener/.test(a), a);
});
t('Sitemap có /doi-tac/ và giữ các trang cũ', () => {
  const x = R.sitemapXml([]);
  assert.ok(x.includes('<loc>https://yenphungviet.vercel.app/doi-tac/</loc>'));
  assert.ok(x.includes('<loc>https://yenphungviet.vercel.app/chon-nhom-choi</loc>'));
});

const home = await read('index.html');
t('Menu trang chủ dẫn tới /doi-tac/', () => assert.ok(home.includes('<a href="/doi-tac/" data-nav="doi-tac">Đối tác</a>')));

console.log(`\n${n} test đạt.`);
