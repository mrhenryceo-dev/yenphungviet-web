// Phase 1R — đọc bài viết ĐÃ XUẤT BẢN từ Supabase bằng anon key (RLS chỉ cho thấy status='published').
// Chỉ dùng phía server (Vercel Function). Không ghi, không dùng service_role.
// KT_SAMPLE=1 (chỉ ở máy local, tools/dev-server.mjs) → đọc dữ liệu mẫu tools/kt-sample.json.

import { KT } from '../../assets/kt/config.mjs';

const LIST_FIELDS = 'id,slug,topic,title,subtitle,excerpt,cover,published_at,updated_at';

async function rest(query) {
  const r = await fetch(`${KT.supabaseUrl}/rest/v1/kt_articles?${query}`, {
    headers: { apikey: KT.supabaseAnonKey, Authorization: `Bearer ${KT.supabaseAnonKey}`, Accept: 'application/json' }
  });
  if (!r.ok) {
    // Bảng chưa tạo (migration chưa chạy) hoặc lỗi tạm thời → coi như chưa có bài, không làm hỏng trang.
    const err = new Error(`kt_articles ${r.status}`); err.status = r.status; throw err;
  }
  return r.json();
}

async function sample() {
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const file = fileURLToPath(new URL('../../tools/kt-sample.json', import.meta.url));
  const all = JSON.parse(await readFile(file, 'utf8'));
  return all.filter(a => a.status === 'published')
    .sort((x, y) => String(y.published_at).localeCompare(String(x.published_at)));
}
const useSample = () => process.env.KT_SAMPLE === '1';

export async function listPublished() {
  if (useSample()) return (await sample()).map(({ blocks, ...a }) => a);
  try { return await rest(`select=${LIST_FIELDS}&status=eq.published&order=published_at.desc&limit=500`); }
  catch (e) { console.error('[kt] listPublished', e.message); return []; }
}

export async function getPublished(slug) {
  if (useSample()) return (await sample()).find(a => a.slug === slug) || null;
  try {
    const rows = await rest(`select=*&slug=eq.${encodeURIComponent(slug)}&status=eq.published&limit=1`);
    return rows[0] || null;
  } catch (e) { console.error('[kt] getPublished', e.message); return null; }
}

export async function relatedTo(a) {
  if (useSample()) return (await sample()).filter(x => x.topic === a.topic && x.slug !== a.slug).slice(0, 3);
  try { return await rest(`select=${LIST_FIELDS}&status=eq.published&topic=eq.${encodeURIComponent(a.topic)}&slug=neq.${encodeURIComponent(a.slug)}&order=published_at.desc&limit=3`); }
  catch (e) { return []; }
}
