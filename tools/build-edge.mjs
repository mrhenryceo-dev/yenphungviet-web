// Phase 1S — sao chép lõi AI (assets/kt/ai/*.mjs) vào Edge Function supabase/functions/kt-ai/ai/
// để Supabase đóng gói function độc lập. Chạy lại sau mỗi lần sửa assets/kt/ai. Không cần mạng.
// node tools/build-edge.mjs          → sao chép
// node tools/build-edge.mjs --check  → chỉ kiểm tra đồng bộ (exit 1 nếu lệch)
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'assets/kt/ai'), DST = path.join(ROOT, 'supabase/functions/kt-ai/ai');
const check = process.argv.includes('--check');
const files = (await readdir(SRC)).filter(f => f.endsWith('.mjs'));
await mkdir(DST, { recursive: true });
let diff = 0;
for (const f of files) {
  const src = await readFile(path.join(SRC, f), 'utf8');
  const head = `// BẢN SAO TỰ ĐỘNG từ assets/kt/ai/${f} — KHÔNG sửa ở đây. Sửa bản gốc rồi chạy: node tools/build-edge.mjs\n`;
  const want = head + src;
  let have = ''; try { have = await readFile(path.join(DST, f), 'utf8'); } catch { /* chưa có */ }
  if (have !== want) { diff++; if (!check) await writeFile(path.join(DST, f), want); }
}
const extra = (await readdir(DST)).filter(f => f.endsWith('.mjs') && !files.includes(f));
if (check) { if (diff || extra.length) { console.error(`✗ supabase/functions/kt-ai/ai lệch ${diff} file, thừa ${extra.length}. Chạy: node tools/build-edge.mjs`); process.exit(1); } console.log(`✓ Edge Function đồng bộ (${files.length} file).`); }
else console.log(`✓ Đã sao chép ${diff} / ${files.length} file vào supabase/functions/kt-ai/ai`);
