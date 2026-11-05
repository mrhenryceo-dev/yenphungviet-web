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
  assert.ok(html.includes('content="Tìm hiểu cách chuẩn bị chim giống, lồng trại, thời gian chăm sóc và tự mô phỏng dòng tiền 12 tháng trước khi nuôi Yến Phụng sinh sản. Nhận tư vấn từ Ji."'));
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
t('Giá trong số ví dụ được ghi rõ là minh họa, không phải báo giá của Ji', () => {
  assert.ok(js.includes("pricePerPair: '2.000.000'"));
  assert.ok(text.includes('Giá 2.000.000 đ/cặp ở đây chỉ là số minh họa, không phải báo giá của Ji'));
});
t('Không có tuyên bố bị cấm', () => {
  const banned = [/thu nhập thụ động/i, /không tốn công/i, /cam kết lợi nhuận/i, /bao tiêu đầu ra/i, /đảm bảo sinh sản/i, /chắc chắn (có lãi|sinh lời)/i, /hoàn vốn (sau|trong) \d/i, /chỉ mất \d+ phút/i, /lợi nhuận \d/i, /dễ bán/,
    /dễ kiếm tiền/i, /lợi nhuận ổn định/i, /thu hồi vốn nhanh/i, /bảo hành sinh sản/i, /cam kết có chim con/i, /mua lại/i, /hỗ trợ trọn đời/i, /lợi nhuận chắc chắn/i];
  for (const re of banned) assert.ok(!re.test(text), 'cụm bị cấm: ' + re);
  // "bao tiêu" chỉ được xuất hiện trong câu FAQ nói rõ là không cam kết.
  assert.ok(text.includes('Trang này không đưa ra cam kết bao tiêu'));
  assert.equal(count(text, /bao tiêu/g), 2);
  assert.ok(!/lãi/i.test(js.replace(/\/\/.*$/gm, '').replace(/tiền lãi/g, '')), 'code không được dùng từ "lãi" cho kết quả');
  assert.ok(!/đồng hồ đếm|còn \d+ suất|chỉ còn \d+/i.test(text), 'không đếm ngược/giới hạn giả');
});
t('Thông điệp và tiêu đề bắt buộc có mặt', () => {
  for (const s of [
    'Nuôi Yến Phụng sinh sản — Bắt đầu từ quy mô phù hợp, hiểu rõ vốn và rủi ro.',
    'Tìm hiểu cách chuẩn bị chim giống, lồng trại, thời gian chăm sóc và mô phỏng dòng tiền trước khi quyết định bắt đầu cùng Yến Phụng PET.',
    'Tính thử vốn khởi đầu', 'Xem các gói khởi đầu', 'Nhắn Zalo Ji',
    'Bạn cần bao nhiêu vốn?', 'Vì sao nên bắt đầu cùng Ji?', 'Bằng chứng từ trại', 'Quy trình nuôi sinh sản', 'Công sức và thời gian chăm sóc', 'Timeline sinh sản', 'Rủi ro và phương án phòng ngừa',
    'Đây là công cụ mô phỏng, không phải dự báo hoặc cam kết kết quả kinh doanh.',
    'Bắt đầu từ quy mô phù hợp với điều kiện của bạn.',
    'Doanh thu chỉ hình thành khi thực tế có chim đủ điều kiện bán và có người mua.',
    'Số giờ chăm sóc thay đổi theo số chim, thiết kế trại, mức độ tự động hóa và tình trạng sức khỏe',
    'không phải lịch sản xuất hay lịch thu tiền',
    'chỉ phát sinh theo thỏa thuận được xác nhận',
    'Sao chép thông tin tư vấn', 'Mở Zalo Ji', 'Gọi 0967653899', 'Gói Trải nghiệm', 'Gói Khởi đầu', 'Gói Mở rộng'
  ]) assert.ok(text.includes(s) || js.includes(s), 'thiếu: ' + s);
});
t('Thứ tự section đúng lệnh V1.1, đúng 11 khối', () => {
  const order = ['dtp-hero', 'id="may-tinh"', 'id="goi"', 'id="vi-sao-ji"', 'id="bang-chung"', 'id="quy-trinh"', 'id="cham-soc"', 'id="sinh-san"', 'id="rui-ro"', 'id="faq"', 'id="lien-he"'];
  const pos = order.map(s => html.indexOf('<section') >= 0 ? html.search(new RegExp('<section[^>]*' + s)) : -1);
  pos.forEach((p, i) => assert.ok(p > 0 && (i === 0 || p > pos[i - 1]), order[i]));
  assert.equal(count(html, /<section[\s>]/g), 11);
});
t('Đủ 6 câu tự đánh giá, 10 nhóm chuẩn bị, 9 bước, 10 rủi ro, FAQ, 3 gói', () => {
  assert.equal(count(html, /name="fit"/g), 6);
  assert.equal(count(html, /name="prep"/g), 10);
  assert.equal(count(html.slice(html.indexOf('class="dtp-steps"'), html.indexOf('id="chuan-bi"')), /<li>/g), 9);
  assert.equal(count(html.slice(html.indexOf('class="dtp-risks"'), html.indexOf('id="faq"')), /<li>/g), 10);
  assert.ok(count(html.slice(html.indexOf('class="dtp-faq"'), html.indexOf('id="lien-he"')), /<details>/g) >= 8);
  for (const q of ['Người mới nên bắt đầu bao nhiêu cặp?', 'Bao lâu có thể có chim con?', 'Chi phí phát sinh gồm những gì?', 'Nếu chim không sinh sản thì sao?', 'Nếu không bán được chim con thì sao?', 'Ji có bao tiêu hay cam kết đầu ra không?', 'Giấy tờ và nguồn gốc chim cần kiểm tra gì?', 'Ji hỗ trợ sau bán trong phạm vi nào?']) assert.ok(text.includes(q), q);
  assert.equal(count(html, /class="dtp-pack"/g), 3);
  assert.equal(count(html, />Nhận tư vấn và báo giá</g), 3);
});
t('Gói: đủ các mục, không có giá, không có mục "đã xác nhận" giả', () => {
  const packs = html.slice(html.indexOf('class="dtp-packs"'), html.indexOf('dtp-pack-note'));
  for (const d of ['Đối tượng phù hợp', 'Quy mô tham khảo', 'Danh mục', 'Ji có thể cung cấp', 'Bạn cần tự chuẩn bị', 'Phạm vi hỗ trợ đã xác nhận', 'Chi phí chưa bao gồm']) assert.equal(count(packs, new RegExp('<dt>' + d, 'g')), 3, d);
  assert.ok(!/\d[\d.,]*\s*(đ\b|đồng|triệu|VND)/i.test(packs), 'không được có giá trong gói');
  assert.ok(!/Đã xác nhận<\/span>/.test(html));
});
t('Bằng chứng: không còn ô "Đang cập nhật", không có ảnh trong khối bằng chứng', () => {
  assert.ok(!text.includes('Đang cập nhật'));
  const sec = html.slice(html.indexOf('id="bang-chung"'), html.indexOf('id="quy-trinh"'));
  assert.ok(!sec.includes('<img'));
  assert.ok(sec.includes('https://zalo.me/0967653899'));
});
t('Ảnh: nhãn "Ảnh minh họa", không tự tuyên bố nguồn AI vì chưa xác minh; không có ảnh ngoài', () => {
  const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
  const imgs = main.match(/<img [^>]+>/g);
  assert.ok(imgs.length >= 7);
  for (const i of imgs) {
    assert.ok(/alt="Ảnh minh họa: /.test(i), i);
    assert.ok(/src="\/assets\//.test(i), i);
    assert.ok(/width="\d+" height="\d+"/.test(i), i);
  }
  assert.equal(count(main, /<figcaption class="ai-badge">Ảnh minh họa<\/figcaption>/g), imgs.length);
  assert.ok(!/do AI tạo/.test(text) && !/ảnh trại thật/i.test(text));
  assert.equal(count(main, /loading="lazy"/g), imgs.length - 1); // chỉ ảnh hero tải ngay
});
t('Liên hệ: mọi link Zalo và tel đúng số 0967653899', () => {
  const links = html.match(/href="(https:\/\/zalo\.me\/[^"]*|tel:[^"]*)"/g);
  assert.ok(links.length >= 8);
  for (const l of links) assert.ok(l === 'href="https://zalo.me/0967653899"' || l === 'href="tel:0967653899"', l);
});
t('CTA Zalo có ở đủ 5 vị trí đặc tả', () => {
  const sec = id => { const i = html.indexOf('id="' + id + '"'); return html.slice(i, html.indexOf('</section>', i)); };
  for (const id of ['may-tinh', 'goi', 'bang-chung', 'lien-he']) assert.ok(sec(id).includes('https://zalo.me/0967653899'), id);
  assert.ok(html.slice(html.indexOf('dtp-hero'), html.indexOf('id="may-tinh"')).includes('https://zalo.me/0967653899'), 'hero');
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
