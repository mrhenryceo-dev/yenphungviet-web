// Phase 1S — lõi Edge Function "kt-ai" (Supabase, Deno). Chỉ dùng Web API chuẩn → test được bằng Node.
// Vai trò: nhận yêu cầu của OWNER đã đăng nhập → gọi nhà cung cấp AI → trả kết quả. KHÔNG ghi bài viết.
// Quyền tối thiểu: không dùng service_role. Ghi nhận chi phí (kt_ai_usage) bằng chính JWT của OWNER, qua RLS.
// Biến môi trường: xem DEPLOYMENT_CHECKLIST.md. Khóa API chỉ nằm ở Supabase Secrets.
import { createProviders } from './ai/providers.mjs';
import { readLimits, readPrices, withRetry, costOf, checkQuota, AIError } from './ai/limits.mjs';
import { SYSTEM, articlePrompt, revisePrompt, suggestPrompt, SUGGEST_SCHEMA, imagePrompt } from './ai/prompt.mjs';
import { JSON_SCHEMA, validatePackage } from './ai/package.mjs';
import { toBase64 } from './ai/mockimg.mjs';

const MAX_BODY = 200 * 1024;
const ACTIONS = ['status', 'suggest', 'article', 'revise', 'image'];

function corsHeaders(origin, env) {
  const allow = String(env.KT_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const suffix = String(env.KT_ALLOWED_ORIGIN_SUFFIX || '').trim();               // ví dụ "-mrhenryceo-2691s-projects.vercel.app" cho Preview
  let ok = false;
  try { const u = new URL(origin); ok = allow.includes(u.origin) || (suffix && u.protocol === 'https:' && u.hostname.endsWith(suffix) && u.hostname.startsWith('yenphungviet-')); } catch { ok = false; }
  return ok ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' } : null;
}
const json = (status, body, cors) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(cors || {}) } });
const b64url = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return s; };
function jwtClaims(token) { try { return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64url(token.split('.')[1])), c => c.charCodeAt(0)))); } catch { return {}; } }

// Xác thực OWNER: hỏi Supabase Auth (token thật, chưa hết hạn) + kiểm tra app_metadata.kt_role và MFA.
async function owner(req, env, fetchImpl) {
  if (env.KT_RUNTIME === 'dev-server' && env.KT_DEV_FAKE_OWNER === '1') return { user: { id: 'dev-owner', email: 'dev@local' }, token: 'dev' };
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || token.split('.').length !== 3) return { err: [401, 'Cần đăng nhập.'] };
  let r;
  try { r = await fetchImpl(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } }); }
  catch { return { err: [503, 'Không kiểm tra được phiên đăng nhập.'] }; }
  if (!r.ok) return { err: [401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'] };
  const user = await r.json();
  const md = (user && user.app_metadata) || {};
  if (md.kt_role !== 'owner') return { err: [403, 'Chỉ OWNER được dùng Xưởng nội dung.'] };
  if (md.kt_mfa === 'required' && jwtClaims(token).aal !== 'aal2') return { err: [403, 'Cần đăng nhập bằng mã xác thực 2 lớp.'] };
  return { user, token };
}

// Kho ghi nhận chi phí: mặc định PostgREST bằng JWT của OWNER (RLS owner-only). Dev-server truyền kho bộ nhớ.
function restUsage(env, token, fetchImpl) {
  const base = `${env.SUPABASE_URL}/rest/v1/kt_ai_usage`;
  const h = { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  return {
    async list(sinceIso) {
      const r = await fetchImpl(`${base}?select=at,kind,task,cost_usd,ok&at=gte.${encodeURIComponent(sinceIso)}&limit=5000`, { headers: h });
      if (!r.ok) throw new AIError('setup', 'Chưa có bảng kt_ai_usage (cần chạy migration kt_r2) hoặc không có quyền.');
      return r.json();
    },
    async add(row) { await fetchImpl(base, { method: 'POST', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify(row) }).catch(() => {}); }
  };
}
const STATUS_HTTP = { auth: 502, config: 500, setup: 503, quota: 429, budget: 429, daily: 429, 'daily-images': 429, 'too-fast': 429, rate: 429, timeout: 504, network: 502, server: 502, bad_output: 502, bad_request: 502, policy: 422 };

export async function handle(req, env = {}, { fetchImpl = globalThis.fetch, now = () => new Date(), usageStore = null } = {}) {
  const origin = req.headers.get('origin') || '';
  const cors = corsHeaders(origin, env);
  if (req.method === 'OPTIONS') return cors ? new Response(null, { status: 204, headers: cors }) : new Response(null, { status: 403 });
  if (!cors) return json(403, { error: 'Nguồn gọi không được phép.' });
  if (req.method !== 'POST') return json(405, { error: 'Chỉ nhận POST.' }, cors);
  if (env.KT_AI_ENABLED !== '1') return json(503, { error: 'Xưởng nội dung AI đang tắt (KT_AI_ENABLED).' }, cors);
  const len = Number(req.headers.get('content-length') || 0);
  if (len > MAX_BODY) return json(413, { error: 'Yêu cầu quá lớn.' }, cors);
  const raw = await req.text();
  if (raw.length > MAX_BODY) return json(413, { error: 'Yêu cầu quá lớn.' }, cors);
  let body; try { body = JSON.parse(raw); } catch { return json(400, { error: 'JSON không hợp lệ.' }, cors); }
  const action = body && body.action;
  if (!ACTIONS.includes(action)) return json(400, { error: 'Thao tác không hỗ trợ.' }, cors);

  const who = await owner(req, env, fetchImpl);
  if (who.err) return json(who.err[0], { error: who.err[1] }, cors);

  let prov; try { prov = createProviders(env, { fetchImpl }); } catch (e) { return json(500, { error: e.message, code: 'config' }, cors); }
  const limits = readLimits(env), prices = readPrices(env);
  const usage = usageStore || restUsage(env, who.token, fetchImpl);
  const monthStart = new Date(Date.UTC(now().getUTCFullYear(), now().getUTCMonth(), 1)).toISOString();
  const record = async (row) => { try { await usage.add({ at: now().toISOString(), ...row }); } catch { /* ghi nhận lỗi không chặn kết quả */ } };

  try {
    const rows = await usage.list(monthStart);
    if (action === 'status') {
      const q = checkQuota(rows, limits, 'article', now());
      return json(200, { provider: prov.describe, limits, month: { calls: rows.length, spent_usd: Math.round((q.spent || rows.reduce((s, r) => s + (Number(r.cost_usd) || 0), 0)) * 100) / 100 } }, cors);
    }
    const kind = action === 'image' ? 'image' : action === 'suggest' ? 'text' : 'article';
    const q = checkQuota(rows, limits, kind, now());
    if (!q.ok) return json(429, { error: q.msg, code: q.code }, cors);

    if (action === 'image') {
      if (!prov.image) return json(501, { error: 'Chưa cấu hình nhà cung cấp ảnh (KT_AI_IMAGE_PROVIDER).', code: 'config' }, cors);
      const prompt = String(body.prompt || '').slice(0, 1000); const ratio = ['16:9', '4:3', '1:1'].includes(body.ratio) ? body.ratio : '16:9';
      if (!prompt) return json(400, { error: 'Thiếu mô tả ảnh.' }, cors);
      try {
        const r = await withRetry(signal => prov.image.generateImage({ prompt: imagePrompt(prompt), ratio, signal }), { retries: limits.maxRetries, timeoutMs: limits.imageTimeoutMs });
        await record({ task: 'image', kind: 'image', provider: prov.describe.image, model: r.usage.model, images: 1, cost_usd: costOf({ model: r.usage.model, images: 1 }, prices), ok: true, job_id: body.job_id || null });
        return json(200, { b64: toBase64(r.bytes), mime: r.mime, mock: prov.describe.image === 'mock' }, cors);
      } catch (e) { await record({ task: 'image', kind: 'image', provider: prov.describe.image, model: prov.describe.imageModel, images: 0, cost_usd: 0, ok: false, error: String(e.message).slice(0, 500), job_id: body.job_id || null }); throw e; }
    }

    let system = SYSTEM, user, schema = JSON_SCHEMA, meta;
    if (action === 'suggest') { user = suggestPrompt({ groups: (body.groups || []).slice(0, 7), existingTitles: (body.existingTitles || []).slice(0, 120), count: Math.min(12, Number(body.count) || 8) }); schema = SUGGEST_SCHEMA; meta = { task: 'suggest', groups: body.groups || [], count: body.count || 8 }; }
    if (action === 'article') { user = articlePrompt({ title: String(body.title || '').slice(0, 200), group: body.group, angle: String(body.angle || '').slice(0, 500), notes: String(body.notes || '').slice(0, 20000), existingTitles: (body.existingTitles || []).slice(0, 120), risk: body.risk || [] }); meta = { task: 'article', title: body.title, group: body.group }; }
    if (action === 'revise') { if (!body.pkg || !body.note) return json(400, { error: 'Thiếu bài hoặc góp ý.' }, cors); user = revisePrompt({ pkg: body.pkg, note: String(body.note).slice(0, 4000) }); meta = { task: 'revise', pkg: body.pkg, note: body.note }; }
    if (user.length > limits.maxInputChars) return json(413, { error: 'Tư liệu quá dài.' }, cors);
    let r;
    try { r = await withRetry(signal => prov.text.generateJSON({ system, user, schema, maxOutputTokens: limits.maxOutputTokens, meta, signal }), { retries: limits.maxRetries, timeoutMs: limits.timeoutMs }); }
    catch (e) { await record({ task: action, kind: 'text', provider: prov.describe.text, model: prov.describe.textModel, tokens_in: 0, tokens_out: 0, cost_usd: 0, ok: false, error: String(e.message).slice(0, 500), job_id: body.job_id || null }); throw e; }
    const cost = costOf({ model: r.usage.model, tokensIn: r.usage.tokensIn, tokensOut: r.usage.tokensOut }, prices);
    const out = action === 'suggest' ? { ideas: Array.isArray(r.json.ideas) ? r.json.ideas.slice(0, 20) : [] } : null;
    const v = action === 'suggest' ? null : validatePackage(r.json);
    await record({ task: action, kind: 'text', provider: prov.describe.text, model: r.usage.model, tokens_in: r.usage.tokensIn, tokens_out: r.usage.tokensOut, cost_usd: cost, ok: action === 'suggest' ? true : v.ok, error: v && !v.ok ? v.errors.join(' ').slice(0, 500) : null, job_id: body.job_id || null });
    if (out) return json(200, { ...out, provider: prov.describe }, cors);
    return json(200, { pkg: r.json, valid: v.ok, errors: v.errors, warnings: v.warnings, provider: prov.describe, usage: { ...r.usage, cost_usd: cost } }, cors);
  } catch (e) {
    const code = (e && e.code) || 'server';
    return json(STATUS_HTTP[code] || 500, { error: (e && e.message) || 'Lỗi không xác định.', code }, cors);
  }
}
