// Phase 1S / Giai đoạn B — kho dữ liệu PHÍA MÁY CHỦ cho máy chạy việc (worker.mjs), qua PostgREST + Storage của Supabase.
// Dùng khóa service_role (Supabase tự cấp cho Edge Function qua SUPABASE_SERVICE_ROLE_KEY; KHÔNG bao giờ ở trình duyệt / Git).
// Giới hạn quyền bằng chính database (kt_r3): service_role KHÔNG được xuất bản, KHÔNG sửa bài đã công khai / đã ẩn, KHÔNG xóa bài.
// Mọi lần lưu việc đều có điều kiện "vẫn là chủ khóa" → OWNER bỏ việc giữa chừng thì máy chủ dừng, không ghi đè.
import { WorkerError } from './ai/worker.mjs';

export const JOB_COLUMNS = ['status', 'step', 'origin', 'title', 'grp', 'angle', 'notes', 'risk', 'attempts', 'step_attempts', 'run_count', 'lock_until', 'lock_owner', 'next_run_at',
  'article_id', 'pkg', 'pkg_warnings', 'qa', 'provider', 'images_total', 'images_done', 'image_errors', 'source_check', 'ai_handle', 'owner_note', 'error', 'error_code', 'cost_usd', 'history'];
const ARTICLE_COLUMNS = ['slug', 'topic', 'title', 'subtitle', 'excerpt', 'seo_title', 'seo_description', 'cover', 'blocks', 'sources', 'reviewed_by_owner', 'status'];
const pick = (o, cols) => Object.fromEntries(cols.filter(k => k in o).map(k => [k, o[k]]));
const ID = /^[0-9a-f-]{36}$/i;

export function serverStore(env, { fetchImpl = globalThis.fetch } = {}) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env.SUPABASE_URL || !key) throw new WorkerError('config', 'Thiếu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY cho máy chạy việc.');
  const auth = { apikey: key, ...(/^eyJ/.test(key) ? { Authorization: `Bearer ${key}` } : {}) };
  const rest = async (path, { method = 'GET', body, prefer } = {}) => {
    const r = await fetchImpl(`${env.SUPABASE_URL}/rest/v1/${path}`, { method, headers: { ...auth, 'Content-Type': 'application/json', Accept: 'application/json', ...(prefer ? { Prefer: prefer } : {}) }, body: body == null ? undefined : JSON.stringify(body) });
    const text = await r.text(); let j = null; try { j = text ? JSON.parse(text) : null; } catch { /* */ }
    if (!r.ok) {
      const msg = (j && (j.message || j.hint)) || text.slice(0, 300);
      if (r.status === 404 || /PGRST205|42P01|does not exist/.test(msg)) throw new WorkerError('setup', 'Chưa cài migration kt_r3 (hoặc kt_r2) trên Supabase: ' + msg);
      throw new WorkerError(/kt_r3|xuất bản|nháp/.test(msg) ? 'guard' : 'db', `Database từ chối (${r.status}): ${msg}`, { retryable: r.status >= 500 });
    }
    return j;
  };
  const one = rows => (Array.isArray(rows) ? rows[0] || null : rows);
  const chk = id => { if (!ID.test(String(id))) throw new WorkerError('state', 'Mã không hợp lệ.'); return id; };

  return {
    async claimJob(workerId, leaseSec) { return one(await rest('rpc/kt_ai_claim_job', { method: 'POST', body: { p_worker: workerId, p_lease_seconds: leaseSec } })); },
    async saveJob(job, workerId) {
      const rows = await rest(`kt_ai_jobs?id=eq.${chk(job.id)}&lock_owner=eq.${encodeURIComponent(workerId)}`, { method: 'PATCH', body: pick(job, JOB_COLUMNS), prefer: 'return=representation' });
      if (!rows || !rows.length) throw new WorkerError('lost-lock', 'Việc đã được OWNER thay đổi hoặc khóa đã hết hạn.');
      return rows[0];
    },
    async insertJob(job) { return one(await rest('kt_ai_jobs', { method: 'POST', body: { id: job.id, ...pick({ ...job, lock_owner: null, lock_until: null }, JOB_COLUMNS) }, prefer: 'return=representation' })); },
    async getJob(id) { return one(await rest(`kt_ai_jobs?id=eq.${chk(id)}&select=*`)); },
    listJobs: () => rest('kt_ai_jobs?select=id,title,status,origin,created_at,reject_reason&order=created_at.desc&limit=500'),
    async nextActiveDue() { const r = one(await rest('kt_ai_jobs?status=in.(queued,generating)&select=next_run_at&order=next_run_at.asc.nullsfirst&limit=1')); return r ? (r.next_run_at || new Date(0).toISOString()) : null; },
    listArticles: () => rest('kt_articles?select=id,slug,title,status&limit=1000'),
    async getArticle(id) { return one(await rest(`kt_articles?id=eq.${chk(id)}&select=*`)); },
    async insertArticle(row) { return one(await rest('kt_articles', { method: 'POST', body: { ...pick(row, ARTICLE_COLUMNS), status: 'draft', reviewed_by_owner: false }, prefer: 'return=representation' })); },
    async updateArticle(row) {
      const rows = await rest(`kt_articles?id=eq.${chk(row.id)}&status=eq.draft`, { method: 'PATCH', body: { ...pick(row, ARTICLE_COLUMNS), status: 'draft', reviewed_by_owner: false }, prefer: 'return=representation' });
      if (!rows || !rows.length) throw new WorkerError('not-draft', 'Bài không còn là nháp (OWNER đã xuất bản / ẩn / xóa) — Xưởng dừng, không sửa.');
      return rows[0];
    },
    listVersions: id => rest(`kt_article_versions?article_id=eq.${chk(id)}&select=version`),
    async addVersion(v) { return one(await rest('kt_article_versions', { method: 'POST', body: v, prefer: 'return=representation' })); },
    listUsage: since => rest(`kt_ai_usage?select=at,kind,task,cost_usd,ok&at=gte.${encodeURIComponent(since)}&limit=5000`),
    async addUsage(row) { await rest('kt_ai_usage', { method: 'POST', body: row, prefer: 'return=minimal' }); },
    async addNotification(n) { await rest('kt_ai_notifications', { method: 'POST', body: n, prefer: 'return=minimal' }); },
    async getSettings() { return one(await rest('kt_ai_settings?id=eq.1&select=*')); }
  };
}

// Tải ảnh lên bucket "kien-thuc" (tên UUID, không ghi đè).
export function serverMedia(env, { fetchImpl = globalThis.fetch } = {}) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    async upload(path, bytes, mime) {
      if (!/^img\/[0-9a-f-]{36}-1600\.(webp|jpg|png)$/.test(path)) throw new WorkerError('state', 'Tên ảnh không hợp lệ.');
      if (!['image/webp', 'image/jpeg', 'image/png'].includes(mime)) throw new WorkerError('state', 'Định dạng ảnh không hỗ trợ.');
      if (bytes.length > 4.8 * 1024 * 1024) throw new WorkerError('image-size', `Ảnh quá lớn (${(bytes.length / 1048576).toFixed(1)} MB).`);
      const r = await fetchImpl(`${env.SUPABASE_URL}/storage/v1/object/kien-thuc/${path}`, { method: 'POST', body: bytes,
        headers: { apikey: key, ...(/^eyJ/.test(key) ? { Authorization: `Bearer ${key}` } : {}), 'Content-Type': mime, 'x-upsert': 'false', 'Cache-Control': 'max-age=31536000' } });
      if (!r.ok) throw new WorkerError('storage', `Không tải được ảnh lên Storage (HTTP ${r.status}).`, { retryable: r.status >= 500 });
      return { path };
    }
  };
}
