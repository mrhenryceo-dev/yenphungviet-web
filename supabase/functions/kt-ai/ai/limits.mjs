// BẢN SAO TỰ ĐỘNG từ assets/kt/ai/limits.mjs — KHÔNG sửa ở đây. Sửa bản gốc rồi chạy: node tools/build-edge.mjs
// Phase 1S — giới hạn token / ảnh / chi phí / số lần thử; chống gọi API vô hạn.
// Giá trị mặc định thận trọng; OWNER đổi qua biến môi trường, nhưng KHÔNG vượt trần cứng (HARD).

export const DEFAULTS = { maxOutputTokens: 9000, maxInputChars: 40000, maxImagesPerArticle: 8, maxRetries: 2, timeoutMs: 120000, imageTimeoutMs: 120000,
  dailyArticles: 5, dailyImages: 40, monthlyBudgetUsd: 15, maxJobAttempts: 3, minSecondsBetweenArticles: 60 };
export const HARD = { maxOutputTokens: 32000, maxInputChars: 120000, maxImagesPerArticle: 12, maxRetries: 3, timeoutMs: 140000, imageTimeoutMs: 140000,
  dailyArticles: 30, dailyImages: 120, monthlyBudgetUsd: 200, maxJobAttempts: 5, minSecondsBetweenArticles: 3600 };
const ENV = { maxOutputTokens: 'KT_AI_MAX_OUTPUT_TOKENS', maxImagesPerArticle: 'KT_AI_MAX_IMAGES', dailyArticles: 'KT_AI_DAILY_ARTICLES', dailyImages: 'KT_AI_DAILY_IMAGES', monthlyBudgetUsd: 'KT_AI_MONTHLY_BUDGET_USD', timeoutMs: 'KT_AI_TIMEOUT_MS' };

export function readLimits(env = {}) {
  const L = { ...DEFAULTS };
  for (const [k, name] of Object.entries(ENV)) {
    const v = Number(env[name]); if (Number.isFinite(v) && v > 0) L[k] = Math.min(v, HARD[k]);
  }
  // KT_AI_NO_RETRY=1: mọi lời gọi AI CÓ THỂ TÍNH PHÍ chỉ thử ĐÚNG 1 LẦN (lỗi → dừng việc, báo OWNER). Hỏi lại trạng thái (miễn phí) vẫn được thử lại.
  L.noRetry = env.KT_AI_NO_RETRY === '1';
  if (L.noRetry) L.maxRetries = 0;
  // KT_AI_SUGGEST_ENABLED=0: tắt gợi ý chủ đề bằng AI (nút "Gợi ý" + lịch tự động) — OWNER tự nhập chủ đề.
  L.suggestEnabled = env.KT_AI_SUGGEST_ENABLED !== '0';
  return L;
}

export class AIError extends Error {
  constructor(code, message, { retryable = false, status = 0 } = {}) { super(message); this.code = code; this.retryable = retryable; this.status = status; }
}
export const sleep = ms => new Promise(r => setTimeout(r, ms));

// Gọi fn(signal) với timeout + thử lại có giới hạn (chỉ lỗi tạm thời: mạng, 429 tạm, 5xx, timeout).
export async function withRetry(fn, { retries = DEFAULTS.maxRetries, timeoutMs = DEFAULTS.timeoutMs, wait = sleep, onAttempt = () => {} } = {}) {
  const max = Math.min(Math.max(0, retries), HARD.maxRetries);
  let last;
  for (let attempt = 0; attempt <= max; attempt++) {
    onAttempt(attempt);
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeoutMs);
    try { return await fn(ac.signal); }
    catch (e) {
      last = e.name === 'AbortError' ? new AIError('timeout', `Quá thời gian chờ (${Math.round(timeoutMs / 1000)} giây).`, { retryable: true }) : e;
      if (!(last instanceof AIError)) last = new AIError('network', last.message || String(last), { retryable: true });
      if (!last.retryable || attempt === max) throw last;
      await wait(1000 * 3 ** attempt);      // 1s, 3s, 9s
    } finally { clearTimeout(t); }
  }
  throw last;
}

// Giá (USD) lấy từ biến môi trường KT_AI_PRICES = {"<model>":{"in":<USD/1M token>,"out":<USD/1M token>,"image":<USD/ảnh>}}.
// Không có giá → trả null (vẫn chặn theo số lượt).
export function readPrices(env = {}) { try { return JSON.parse(env.KT_AI_PRICES || '{}') || {}; } catch { return {}; } }
export function costOf({ model, tokensIn = 0, tokensOut = 0, images = 0 }, prices) {
  const p = prices && prices[model]; if (!p) return null;
  return Math.round(((tokensIn * (p.in || 0) + tokensOut * (p.out || 0)) / 1e6 + images * (p.image || 0)) * 10000) / 10000;
}

// rows: lịch sử dùng (kt_ai_usage) [{at, kind:'text'|'image', task, cost_usd, ok}]
export function checkQuota(rows, limits, kind, now = new Date()) {
  const day = now.toISOString().slice(0, 10), month = day.slice(0, 7);
  const today = rows.filter(r => String(r.at).slice(0, 10) === day);
  const spent = rows.filter(r => String(r.at).slice(0, 7) === month).reduce((s, r) => s + (Number(r.cost_usd) || 0), 0);
  if (spent >= limits.monthlyBudgetUsd) return { ok: false, code: 'budget', msg: `Đã dùng ${spent.toFixed(2)} USD tháng này (giới hạn ${limits.monthlyBudgetUsd} USD).` };
  if (kind === 'article') {
    const n = today.filter(r => r.task === 'article' && r.ok).length;
    if (n >= limits.dailyArticles) return { ok: false, code: 'daily', msg: `Đã tạo ${n} bài hôm nay (giới hạn ${limits.dailyArticles}).` };
    const last = today.filter(r => r.task === 'article').map(r => new Date(r.at).getTime()).sort((a, b) => b - a)[0];
    if (last && now.getTime() - last < limits.minSecondsBetweenArticles * 1000) return { ok: false, code: 'too-fast', msg: 'Vừa tạo bài, đợi 1 phút rồi thử lại.' };
  }
  if (kind === 'image') {
    const n = today.filter(r => r.kind === 'image' && r.ok).length;
    if (n >= limits.dailyImages) return { ok: false, code: 'daily-images', msg: `Đã tạo ${n} ảnh hôm nay (giới hạn ${limits.dailyImages}).` };
  }
  return { ok: true, spent };
}
