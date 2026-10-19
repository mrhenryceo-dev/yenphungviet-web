// Chạy TOÀN BỘ kiểm thử Phase 1R + 1S ở máy local. Không gọi AI, không chi phí, không ghi Supabase thật.
// node tools/run-all-tests.mjs [--live]
//   --live : thêm kiểm thử phân quyền THẬT trên bird-farm bằng anon key (đọc + thử ghi phải bị chặn). Mặc định TẮT.
// Cần PGlite cho test SQL: đặt KT_PGLITE=<.../@electric-sql/pglite/dist/index.js> (bỏ qua test SQL nếu không có).
import { spawnSync, execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PG = process.env.KT_PGLITE || '';
const live = process.argv.includes('--live');
const results = [];
function run(name, file, args = []) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(ROOT, file), ...args], { cwd: ROOT, encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const last = out.trim().split('\n').filter(l => /đạt|✓ Edge|✗|Error|Assert/.test(l)).pop() || out.trim().split('\n').pop();
  results.push({ name, ok: r.status === 0, ms: Date.now() - t0, last });
  if (r.status !== 0) console.error(out.slice(-3000));
}
function check(name, fn) {
  try { const msg = fn(); results.push({ name, ok: true, ms: 0, last: msg }); }
  catch (e) { results.push({ name, ok: false, ms: 0, last: e.message }); }
}

run('Bộ render trang công khai', 'tools/kt-render-test.mjs');
run('Xử lý ảnh (nén, tên file, srcset)', 'tools/kt-media-test.mjs');
run('Vercel Function ↔ Supabase REST (fetch giả)', 'tools/kt-data-test.mjs');
run('Xưởng nội dung AI + Edge Function (mock, fetch giả)', 'tools/kt-ai-test.mjs');
run('Máy chạy việc phía máy chủ (GĐ B: hàng đợi, link nguồn, thông báo, tick/kick)', 'tools/kt-worker-test.mjs');
run('Edge Function đồng bộ với assets/kt/ai', 'tools/build-edge.mjs', ['--check']);
if (PG && existsSync(PG)) {
  run('SQL kt_r1 (RLS, Storage, chốt cài một lần)', 'tools/kt-sql-test.mjs', [PG]);
  run('SQL kt_r2 (Xưởng nội dung, owner-only)', 'tools/kt-r2-sql-test.mjs', [PG]);
  run('SQL kt_r3 (hàng đợi, khóa thuê, chốt service_role)', 'tools/kt-r3-sql-test.mjs', [PG]);
  run('SQL web_02 (dự phòng dự án riêng)', 'tools/web-sql-test.mjs', [PG]);
} else results.push({ name: 'Test SQL (PGlite)', ok: true, ms: 0, last: 'BỎ QUA — chưa đặt KT_PGLITE' });
if (live) run('Phân quyền THẬT trên bird-farm (anon)', 'tools/kt-live-anon-test.mjs');

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' });
check('Hồi quy: file website cũ không đổi so với Production 67be669', () => {
  const d = git('diff', '--stat', '67be669', '--', 'index.html', 'assets/js/app.js', 'assets/js/birds.js', 'assets/js/config.js', 'assets/js/catalogue.js', 'assets/js/guide.js', 'assets/js/nhom-choi.js', 'assets/js/ui.js', 'assets/css/site.css', 'data', 'chon-nhom-choi').trim();
  if (d) throw new Error('Có thay đổi: ' + d.split('\n').pop()); return 'không đổi';
});
check('Không có khóa bí mật trong file Git theo dõi', () => {
  const files = git('ls-files').split('\n').filter(f => f && !/\.(webp|png|jpe?g|ico)$/i.test(f));
  const bad = [];
  for (const f of files) {
    const s = readFileSync(path.join(ROOT, f), 'utf8');
    if (/sb_secret_[A-Za-z0-9]{8,}|sk-(proj-)?[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY/.test(s)) bad.push(f);
    for (const m of s.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)) {
      try { const role = JSON.parse(Buffer.from(m[1], 'base64url').toString()).role; if (role && role !== 'anon') bad.push(`${f} (JWT role ${role})`); } catch { /* không phải JWT */ }
    }
  }
  if (bad.length) throw new Error(bad.join(', ')); return `${files.length} file sạch`;
});
check('Frontend không dùng service_role / khóa AI', () => {
  const bad = git('ls-files', 'quan-tri', 'assets').split('\n').filter(Boolean).filter(f => /\.(m?js|html)$/.test(f))
    .filter(f => /service_role|OPENAI_API_KEY|ANTHROPIC_API_KEY/.test(readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\/.*$/gm, '')));
  // Ngoại lệ có lý do: providers.mjs đọc TÊN biến môi trường (chỉ chạy trong Edge Function);
  // package.mjs liệt kê "service_role" trong danh sách từ khóa BỊ CHẶN của gói bài AI.
  const real = bad.filter(f => !/assets\/kt\/ai\/(providers|package)\.mjs$/.test(f));
  if (real.length) throw new Error(real.join(', ')); return 'sạch';
});

const w = Math.max(...results.map(r => r.name.length));
console.log('\n' + results.map(r => `${r.ok ? '✓' : '✗'} ${r.name.padEnd(w)}  ${r.last || ''}`).join('\n'));
const fail = results.filter(r => !r.ok).length;
console.log(`\n${results.length - fail}/${results.length} nhóm kiểm thử đạt${live ? '' : ' (chưa chạy --live)'}.`);
process.exit(fail ? 1 : 0);
