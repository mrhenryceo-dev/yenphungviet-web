// Phase 1S / GĐ3 — dựng 3 bài mẫu (assets/kt/ai/mock-data.mjs) qua ĐÚNG pipeline dàn trang → tools/kt-sample-ai.json
// để xem trang công khai ở máy local (tools/dev-server.mjs, KT_SAMPLE=1). KHÔNG ghi database.
// Trạng thái "published" chỉ để trang local hiển thị; trên hệ thống thật bài mẫu luôn vào dạng NHÁP chờ OWNER duyệt.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { SAMPLES, SAMPLE_COVERS } from '../assets/kt/ai/mock-data.mjs';
import { validatePackage } from '../assets/kt/ai/package.mjs';
import { composeArticle, applyImage } from '../assets/kt/ai/compose.mjs';
import { qaArticle } from '../assets/kt/ai/qa.mjs';

const out = [];
const at = ['2026-10-14T08:00:00Z', '2026-10-14T08:05:00Z', '2026-10-14T08:10:00Z'];
for (const [i, s] of SAMPLES.entries()) {
  const v = validatePackage(s.pkg);
  if (!v.ok) throw new Error(`${s.key}: ${v.errors.join(' ')}`);
  const { article } = composeArticle(v.value, { existing: out });
  applyImage(article, 'cover', { ...SAMPLE_COVERS[s.key] });
  const q = qaArticle(article);
  out.push({ id: `mau-ai-${i + 1}`, ...article, status: 'published', published_at: at[i], updated_at: at[i], _local_sample: 'BẢN MẪU LOCAL — chưa duyệt', _qa: { score: q.score, errors: q.errors.map(e => e.code) } });
  console.log(`✓ ${article.slug} (${article.cover.layout}) — QA ${q.score}, lỗi: ${q.errors.map(e => e.code).join(', ') || 'không'}`);
}
await writeFile(fileURLToPath(new URL('./kt-sample-ai.json', import.meta.url)), JSON.stringify(out, null, 2));
console.log(`→ tools/kt-sample-ai.json (${out.length} bài)`);
