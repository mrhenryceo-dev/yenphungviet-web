// Phase 1R — trỏ chuyên mục "Kiến thức chuyên sâu" sang một dự án Supabase khác (dự kiến: yenphungpet-web).
// Chỉ sửa assets/kt/config.mjs. KHÔNG đụng assets/js/config.js (trang chủ, chim, form giữ nguyên dự án cũ).
// Chạy: node tools/kt-set-project.mjs <project-ref> <anon-hoặc-publishable-key>
// Khóa phải là khóa CÔNG KHAI (anon / sb_publishable_). Khóa service_role / sb_secret_ bị từ chối.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Dự án KHÔNG được dùng cho Kiến thức. bird-farm (bnumqtjzbyrtavsdlleq) được OWNER duyệt dùng chung (2026-10-13).
const BLOCKED = {
  cynpwmjkflhlrdqxoyhx: 'yenphungpet-v2-staging (App quản lý trại bản nâng cấp)'
};

const [ref, key] = process.argv.slice(2);
const fail = m => { console.error('✗ ' + m); process.exit(1); };
if (!ref || !key) fail('Cách dùng: node tools/kt-set-project.mjs <project-ref> <anon-key>');
if (!/^[a-z]{20}$/.test(ref)) fail('project-ref phải gồm 20 chữ thường (xem Project Settings → General).');
if (BLOCKED[ref]) fail(`Từ chối: ${ref} là ${BLOCKED[ref]}.`);

if (key.startsWith('sb_secret_')) fail('Đây là khóa BÍ MẬT (sb_secret_). Chỉ dùng khóa công khai.');
if (key.startsWith('sb_publishable_')) {
  if (!/^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(key)) fail('Khóa publishable không đúng định dạng.');
} else {
  let p;
  try { p = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()); } catch { fail('Khóa không phải JWT hợp lệ.'); }
  if (p.role !== 'anon') fail(`Từ chối: khóa có role "${p.role}". Chỉ chấp nhận anon.`);
  if (p.ref && p.ref !== ref) fail(`Khóa thuộc dự án ${p.ref}, không khớp ${ref}.`);
}

const file = fileURLToPath(new URL('../assets/kt/config.mjs', import.meta.url));
const src = await readFile(file, 'utf8');
const out = src
  .replace(/supabaseUrl: '[^']*'/, `supabaseUrl: 'https://${ref}.supabase.co'`)
  .replace(/supabaseAnonKey: '[^']*'/, `supabaseAnonKey: '${key}'`);
if (out === src) fail('Không tìm thấy (hoặc không có gì thay đổi) supabaseUrl / supabaseAnonKey trong config.mjs.');
await writeFile(file, out);
console.log(`✓ assets/kt/config.mjs → https://${ref}.supabase.co (assets/js/config.js không đổi)`);
