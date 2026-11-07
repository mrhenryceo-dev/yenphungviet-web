// Trang /doi-tac/ V2.0 — test nội dung tĩnh theo brief OWNER (chạy: node tools/doi-tac-page-test.mjs). Không gọi mạng.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'doi-tac/index.html'), 'utf8');
const js = readFileSync(join(root, 'assets/js/doi-tac.js'), 'utf8');
const guides = readFileSync(join(root, 'data/guides.js'), 'utf8');
const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
const text = main.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const count = (s, re) => (s.match(re) || []).length;
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('✓ ' + name); };

t('Hero: đúng tiêu đề, giới thiệu, thông điệp, CTA và định hướng theo brief', () => {
  assert.equal(count(html, /<h1>/g), 1);
  for (const s of [
    'Góc chia sẻ bí quyết và lộ trình nuôi Yến Phụng sinh sản dành cho những người đam mê',
    'Hãy cùng Ji đi từng bước, khám phá mô hình nuôi Yến Phụng sinh sản — từ chọn chim giống, chuẩn bị tổ ấm đến chăm sóc những chú chim non đầu tiên nhé!',
    'Nuôi vì đam mê – Chăm bằng kiến thức – Phát triển bằng kinh nghiệm.',
    'Khám phá hành trình', 'Bí quyết từ Ji', 'Nhắn Zalo tư vấn',
    'Việc tìm hiểu kỹ giúp bạn đưa ra quyết định đúng đắn nhất. Hãy cùng Ji lựa chọn quy mô phù hợp với không gian, thời gian và ngân sách của mình nhé!',
  ]) assert.ok(text.includes(s), s);
});
t('Sáu chương đúng thứ tự', () => {
  const ids = ['the-gioi', 'hanh-trinh', 'chuan-bi', 'bi-quyet', 'phat-trien', 'cung-ji'];
  let last = -1;
  for (const id of ids) {
    const i = main.indexOf('id="' + id + '"');
    assert.ok(i > last, id);
    assert.ok(main.includes('href="#' + id + '"'), 'mục lục ' + id);
    last = i;
  }
  for (const h of ['Khám phá thế giới Yến Phụng', 'Hành trình từ cặp chim đến đàn chim non', 'Bắt đầu một trại nhỏ cần chuẩn bị gì?', 'Bí quyết chăm sóc từ Ji', 'Từ đam mê đến cơ hội phát triển', 'Đam mê sẽ dễ bắt đầu hơn khi có người đồng hành'])
    assert.ok(main.includes('<h2>' + h + '</h2>'), h);
});
t('Đã bỏ máy tính vốn, ba gói và CTA tính thử', () => {
  for (const s of ['Tính thử', 'Máy tính', 'máy tính', 'dòng tiền', 'Chế độ nhanh', 'Chế độ chi tiết', 'Gói Trải nghiệm', 'Gói Khởi đầu', 'Gói Mở rộng', 'hòa vốn', 'báo giá']) assert.ok(!html.includes(s), s);
  assert.ok(!html.includes('doi-tac-calc'));
  assert.ok(!js.includes('DoiTacCalc'));
  assert.ok(!existsSync(join(root, 'assets/js/doi-tac-calc.js')));
});
t('Không có số tiền, số liệu doanh thu hay ngôn ngữ hứa hẹn', () => {
  assert.ok(!/\d[\d.,]*\s*(đ\b|đồng|triệu|VND)/i.test(text));
  for (const s of ['làm giàu', 'thu nhập', 'bao tiêu', 'chắc chắn sinh sản', 'chắc chắn có', 'hoàn vốn', 'lợi nhuận', 'cam kết', 'chưa xác nhận', 'chưa có chính sách']) assert.ok(!text.toLowerCase().includes(s), s);
});
t('Không tự công bố thông tin chưa xác minh', () => {
  assert.ok(!/\d+\s*năm kinh nghiệm/.test(text));
  assert.ok(!/chứng chỉ|bằng cấp|giải thưởng/i.test(text));
  assert.ok(!html.includes('application/ld+json'), 'không có schema đánh giá');
});
t('Ba CTA chính đúng câu chữ và vị trí', () => {
  const pos = s => main.indexOf(s);
  const c1 = pos('>Ji ơi, mình muốn tìm hiểu cách nuôi Yến Phụng sinh sản!<');
  const c2 = pos('>Nhắn Ji để được hướng dẫn bắt đầu<');
  const c3 = pos('>Mình muốn bắt đầu một trại Yến Phụng nhỏ!<');
  assert.ok(c1 > 0 && c1 < pos('id="the-gioi"'));
  assert.ok(c2 > pos('id="hanh-trinh"') && c2 < pos('id="chuan-bi"'));
  assert.ok(c3 > pos('id="cung-ji"'));
});
t('Liên hệ: mọi link Zalo và tel đúng số; không báo đã tự gửi', () => {
  const links = html.match(/href="(https:\/\/zalo\.me\/[^"]*|tel:[^"]*)"/g);
  assert.ok(links.length >= 6);
  for (const l of links) assert.ok(/zalo\.me\/0967653899"|tel:0967653899"/.test(l), l);
  assert.ok(!/đã gửi/i.test(html + js));
  assert.ok(js.includes('Hãy dán vào Zalo'));
  for (const a of html.match(/<a [^>]*zalo\.me[^>]*>/g)) assert.ok(/target="_blank" rel="noopener"/.test(a), a);
});
t('Không fetch, tracking hay gửi dữ liệu', () => {
  assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|localStorage|gtag|fbq/i.test(js + html));
  assert.ok(!/<form/.test(html));
});
t('Ảnh: đều có nhãn minh họa, tồn tại trên đĩa, không dùng ảnh đút bột, kích thước rõ', () => {
  const imgs = main.match(/<img [^>]+>/g);
  assert.ok(imgs.length >= 15);
  for (const i of imgs) {
    assert.ok(/alt="Ảnh minh họa: /.test(i), i);
    assert.ok(/width="\d+" height="\d+"/.test(i), i);
    assert.ok(existsSync(join(root, i.match(/src="\/([^"]+)"/)[1])), i);
    assert.ok(!i.includes('pet-03'), 'không dùng ảnh đút bột');
  }
  assert.equal(count(main, /<figcaption[^>]*>Ảnh minh họa<\/figcaption>/g), imgs.length);
  assert.ok(main.includes('không phải ảnh trại'));
  assert.equal(count(main, /loading="lazy"/g), imgs.length - 1);
});
t('Hành trình: tám chặng, mốc có nguồn, giữ lưu ý đút bột', () => {
  const line = main.slice(main.indexOf('class="v2-line"'), main.indexOf('class="v2-sources"'));
  assert.equal(count(line, /<li>/g), 8);
  for (const s of ['khoảng 12 tháng', 'khoảng 10 tháng', 'khoảng 1–3 ngày', 'khoảng 18 ngày', 'khoảng 4–5 tuần']) assert.ok(line.includes(s), s);
  assert.ok(line.includes('không tự đút bột khi chưa được hướng dẫn trực tiếp'));
  const src = main.slice(main.indexOf('class="v2-sources"'), main.indexOf('class="v2-inline-cta"'));
  for (const s of ['askavet.com', 'hastingsdc.govt.nz', 'bcsa.com.au/breeding-budgerigars/', 'bcsa.com.au/breeding/eggs/management/', 'bcsa.com.au/breeding-budgerigars/weaning-chicks/', '/kien-thuc/vong-doi-cua-chim-yen-phung/']) assert.ok(src.includes(s), s);
  for (const u of src.match(/href="http[^"]+"[^>]*>/g)) assert.ok(/target="_blank" rel="noopener nofollow"/.test(u), u);
});
t('Link nội bộ chỉ trỏ tới bài và mục đang có', () => {
  const existing = ['vong-doi-cua-chim-yen-phung', 'phan-biet-yen-phung-trong-mai', 'yen-phung-thich-an-gi'];
  for (const [, slug] of main.matchAll(/href="\/kien-thuc\/([^"/]+)\/"/g)) assert.ok(existing.includes(slug), slug);
  for (const [, id] of main.matchAll(/href="\/#cam-nang\/([^"]+)"/g)) assert.ok(guides.includes("id:'" + id + "'"), id);
  for (const [, id] of main.matchAll(/href="#([^"]+)"/g)) assert.ok(main.includes('id="' + id + '"'), id);
  assert.equal(count(main.slice(main.indexOf('class="v2-tip-list"'), main.indexOf('id="phat-trien"')), /<h3>/g), 7);
});
t('SEO: title, mô tả, canonical, Open Graph và cụm từ tự nhiên', () => {
  assert.ok(html.includes('<link rel="canonical" href="https://yenphungviet.vercel.app/doi-tac/">'));
  const title = html.match(/<title>(.*)<\/title>/)[1];
  const desc = html.match(/<meta name="description" content="([^"]+)"/)[1];
  assert.ok(title.length <= 80, title);
  assert.ok(desc.length <= 170, desc);
  for (const p of ['og:title', 'og:description', 'og:image', 'og:url', 'og:type']) assert.ok(html.includes('property="' + p + '"'), p);
  for (const k of ['nuôi Yến Phụng sinh sản', 'Cách nuôi Yến Phụng sinh sản', 'Kinh nghiệm nuôi', 'Lồng nuôi Yến Phụng sinh sản', 'Chim Yến Phụng giống', 'chăm sóc chim Yến Phụng non']) assert.ok(html.includes(k), k);
});
t('Menu trang chủ dẫn tới /doi-tac/', () => {
  assert.ok(readFileSync(join(root, 'index.html'), 'utf8').includes('href="/doi-tac/"'));
});

console.log('\n' + n + ' test đạt.');
