// Phase 1S — lõi Edge Function "kt-ai" (Supabase, Deno). Chỉ dùng Web API chuẩn → test được bằng Node.
// Hai lối vào:
//  1. OWNER (trình duyệt, JWT + CORS): status, suggest, kick (đánh thức máy chạy việc), và các thao tác đồng bộ cũ article/revise/image.
//     Đường này KHÔNG dùng service_role — ghi nhận chi phí bằng chính JWT của OWNER, qua RLS.
//  2. MÁY CHẠY VIỆC (Giai đoạn B, action "tick"): chỉ nhận khi có header x-kt-worker-secret đúng (cron / tự nối tiếp).
//     Chạy worker.mjs: nhận 1 việc bằng khóa thuê, chạy từng bước, lưu tiến độ, rồi tự hẹn lần chạy kế tiếp.
//     Đường này dùng service_role (chỉ phía máy chủ) nhưng database chặn: không xuất bản, không sửa bài đã công khai, không xóa.
// Biến môi trường: xem DEPLOYMENT_CHECKLIST.md. Khóa API chỉ nằm ở Supabase Secrets.
import { createProviders } from './ai/providers.mjs';
import { readLimits, readPrices, withRetry, costOf, checkQuota, AIError } from './ai/limits.mjs';
import { SYSTEM, articlePrompt, revisePrompt, suggestPrompt, SUGGEST_SCHEMA, imagePrompt } from './ai/prompt.mjs';
import { JSON_SCHEMA, validatePackage } from './ai/package.mjs';
import { toBase64 } from './ai/mockimg.mjs';
import { tick, autoPlan } from './ai/worker.mjs';
import { deliver, notifyConfig } from './ai/notify.mjs';
import { serverStore, serverMedia } from './server-store.mjs';

const MAX_BODY = 200 * 1024;
const ACTIONS = ['status', 'suggest', 'article', 'revise', 'image', 'kick'];
export const CHAIN = { max: 300, minDelayMs: 2000, maxDelayMs: 60000, wallMs: 140000, horizonMs: 20 * 60e3 };

function safeEqual(a, b) {
  a = String(a || ''); b = String(b || '');
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i % (a.length || 1)) || 0) ^ (b.charCodeAt(i % (b.length || 1)) || 0);
  return d === 0 && a.length > 0;
}
const workerReady = env => String(env.KT_WORKER_SECRET || '').length >= 32 && !!env.SUPABASE_SERVICE_ROLE_KEY;

// Chạy 1 tick của máy chạy việc + (nếu cron) lịch tự động, rồi hẹn lần kế tiếp qua waitUntil (không giữ request).
export async function runWorker(env, { fetchImpl = globalThis.fetch, now = () => new Date(), workerStore = null, workerMedia = null, urlFetch = null, waitUntil = null, sleep = ms => new Promise(r => setTimeout(r, ms)), clock = () => Date.now() } = {}, { source = 'chain', chain = 0 } = {}) {
  const t0 = clock();
  const prov = createProviders(env, { fetchImpl });
  const limits = readLimits(env), prices = readPrices(env);
  const store = workerStore || serverStore(env, { fetchImpl });
  let settings = null; try { settings = await store.getSettings(); } catch { /* chưa có bảng → dùng mặc định */ }
  if (settings && Number(settings.monthly_budget_usd) > 0) limits.monthlyBudgetUsd = Math.min(limits.monthlyBudgetUsd, Number(settings.monthly_budget_usd));
  const deps = { store, prov, limits, prices, now, clock, media: workerMedia || serverMedia(env, { fetchImpl }), fetchUrl: urlFetch || fetchImpl,
    notify: msg => deliver(msg, env, { fetchImpl }), reviewBase: env.KT_REVIEW_BASE_URL || 'https://yenphungviet.vercel.app' };
  let plan = null;
  if (source === 'cron') { try { plan = await autoPlan(deps); } catch (e) { plan = { error: String(e.message || e).slice(0, 300) }; } }
  const r = await tick(deps);
  // Hẹn lần chạy kế tiếp: còn việc đang chạy → tự gọi lại chính mình (có trễ, có trần số lần). Hết việc → dừng.
  let next = null;
  if (r.more || r.claimed) next = r.nextRunAt ? new Date(r.nextRunAt).getTime() - now().getTime() : 0;
  else if (r.claimed === null && source !== 'cron') {
    try { const due = await nextActiveDue(store); if (due != null && due - now().getTime() < CHAIN.horizonMs) next = due - now().getTime(); } catch { /* bỏ qua */ }
  }
  let chained = false;
  if (next != null && chain < CHAIN.max && waitUntil && workerReady(env)) {
    const left = CHAIN.wallMs - (clock() - t0);
    const delay = Math.max(CHAIN.minDelayMs, Math.min(next, CHAIN.maxDelayMs, left));
    chained = true;
    waitUntil((async () => {
      await sleep(delay);
      try {
        await fetchImpl(`${env.SUPABASE_URL}/functions/v1/kt-ai`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-kt-worker-secret': env.KT_WORKER_SECRET,
          ...(env.SUPABASE_ANON_KEY ? { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` } : {}) }, body: JSON.stringify({ action: 'tick', source: 'chain', chain: chain + 1 }) });
      } catch { /* cron / OWNER mở Xưởng sẽ đánh thức lại */ }
    })());
  }
  return { ...r, plan, chained, chain };
}
async function nextActiveDue(store) {
  if (!store.nextActiveDue) return null;
  const at = await store.nextActiveDue(); return at ? new Date(at).getTime() : null;
}

async function handleTick(req, env, opts) {
  const plain = (s, b) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  if (req.method !== 'POST') return plain(405, { error: 'Chỉ nhận POST.' });
  if (!workerReady(env)) return plain(503, { error: 'Máy chạy việc chưa cấu hình (KT_WORKER_SECRET ≥ 32 ký tự + SUPABASE_SERVICE_ROLE_KEY).' });
  if (!safeEqual(req.headers.get('x-kt-worker-secret'), env.KT_WORKER_SECRET)) return plain(401, { error: 'Sai khóa máy chạy việc.' });
  if (env.KT_AI_ENABLED !== '1') return plain(503, { error: 'Xưởng nội dung AI đang tắt (KT_AI_ENABLED).' });
  const raw = await req.text(); if (raw.length > 4096) return plain(413, { error: 'Yêu cầu quá lớn.' });
  let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch { return plain(400, { error: 'JSON không hợp lệ.' }); }
  const source = ['cron', 'chain', 'kick'].includes(body.source) ? body.source : 'chain';
  const chain = Math.max(0, Math.min(CHAIN.max, Number(body.chain) || 0));
  try { return plain(200, await runWorker(env, opts, { source, chain })); }
  catch (e) { return plain(e && e.code === 'setup' ? 503 : 500, { error: String((e && e.message) || e).slice(0, 500), code: (e && e.code) || 'server' }); }
}

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

export async function handle(req, env = {}, opts = {}) {
  const { fetchImpl = globalThis.fetch, now = () => new Date(), usageStore = null, waitUntil = null } = opts;
  // Máy chạy việc (cron / tự nối tiếp): không có Origin, xác thực bằng khóa riêng — xử lý TRƯỚC CORS.
  if (req.headers.get('x-kt-worker-secret') != null) return handleTick(req, env, opts);
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

  // OWNER đánh thức máy chạy việc: trả lời NGAY (202), việc chạy tiếp phía máy chủ kể cả khi OWNER đóng trình duyệt.
  if (action === 'kick') {
    if (!workerReady(env)) return json(503, { error: 'Máy chạy việc chưa cấu hình (KT_WORKER_SECRET + SUPABASE_SERVICE_ROLE_KEY).', code: 'setup' }, cors);
    const run = runWorker(env, opts, { source: 'kick', chain: 0 }).catch(() => null);
    if (waitUntil) waitUntil(run); else await run;
    return json(202, { ok: true, message: 'Đã giao việc cho máy chủ. Có thể đóng trình duyệt — bài sẽ được chuẩn bị và báo khi chờ duyệt.' }, cors);
  }

  let prov; try { prov = createProviders(env, { fetchImpl }); } catch (e) { return json(500, { error: e.message, code: 'config' }, cors); }
  const limits = readLimits(env), prices = readPrices(env);
  const usage = usageStore || restUsage(env, who.token, fetchImpl);
  const monthStart = new Date(Date.UTC(now().getUTCFullYear(), now().getUTCMonth(), 1)).toISOString();
  const record = async (row) => { try { await usage.add({ at: now().toISOString(), ...row }); } catch { /* ghi nhận lỗi không chặn kết quả */ } };

  try {
    const rows = await usage.list(monthStart);
    if (action === 'status') {
      const q = checkQuota(rows, limits, 'article', now());
      const nc = notifyConfig(env);
      return json(200, { provider: prov.describe, limits, worker: { ready: workerReady(env) }, notify: { mode: nc.mode, channel: nc.channel, ready: nc.ready }, month:{ calls: rows.length, spent_usd: Math.round((q.spent || rows.reduce((s, r) => s + (Number(r.cost_usd) || 0), 0)) * 100) / 100 } }, cors);
    }
    if (action === 'suggest' && !limits.suggestEnabled) return json(403, { error: 'Gợi ý chủ đề bằng AI đang tắt (KT_AI_SUGGEST_ENABLED=0). Hãy tự nhập chủ đề.', code: 'suggest-off' }, cors);
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
    if (action === 'suggest') { user = suggestPrompt({ groups: (body.groups || []).slice(0, 7), existingTitles: (body.existingTitles || []).slice(0, 120), rejectedTitles: (body.rejectedTitles || []).slice(0, 60).map(s => String(s).slice(0, 200)), count: Math.min(12, Number(body.count) || 8) }); schema = SUGGEST_SCHEMA; meta = { task: 'suggest', groups: body.groups || [], count: body.count || 8 }; }
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
