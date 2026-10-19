// BẢN SAO TỰ ĐỘNG từ assets/kt/ai/providers.mjs — KHÔNG sửa ở đây. Sửa bản gốc rồi chạy: node tools/build-edge.mjs
// Phase 1S — adapter nhà cung cấp AI. Giao diện chung:
//   generateJSON({ system, user, schema, maxOutputTokens, meta, signal }) → { json, usage:{ model, tokensIn, tokensOut } }
//   generateImage({ prompt, ratio, signal })                              → { bytes:Uint8Array, mime, usage:{ model, images:1 } }
// Cấu hình CHỈ qua biến môi trường (không hardcode model / khóa):
//   KT_AI_TEXT_PROVIDER = mock | openai | anthropic      KT_AI_TEXT_MODEL  = <tên model>
//   KT_AI_IMAGE_PROVIDER = mock | openai | none          KT_AI_IMAGE_MODEL = <tên model>
//   OPENAI_API_KEY, ANTHROPIC_API_KEY (chỉ ở Supabase Secrets — không bao giờ ở trình duyệt / Git)
import { AIError } from './limits.mjs';
import { placeholderPng, fromBase64 } from './mockimg.mjs';
import { mockArticle, mockIdeas, mockRevise } from './mock-data.mjs';

const SIZES = { '16:9': '1536x1024', '4:3': '1536x1024', '1:1': '1024x1024' };   // kích thước hỗ trợ phổ biến của API ảnh OpenAI

function httpError(status, body, who) {
  const txt = typeof body === 'string' ? body : JSON.stringify(body || {});
  if (status === 401 || status === 403) return new AIError('auth', `${who}: khóa API không hợp lệ hoặc không có quyền.`, { status });
  if (status === 429 && /insufficient_quota|billing|credit/i.test(txt)) return new AIError('quota', `${who}: tài khoản hết hạn mức / chưa nạp tiền.`, { status });
  if (status === 429) return new AIError('rate', `${who}: quá nhiều yêu cầu, thử lại sau.`, { status, retryable: true });
  if (status === 400 && /content_policy|safety/i.test(txt)) return new AIError('policy', `${who}: yêu cầu bị từ chối do chính sách nội dung.`, { status });
  if (status >= 500) return new AIError('server', `${who}: máy chủ lỗi tạm thời (${status}).`, { status, retryable: true });
  return new AIError('bad_request', `${who}: yêu cầu không hợp lệ (${status}).`, { status });
}
export function parseJsonText(text) {
  let t = String(text || '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/); if (fence) t = fence[1].trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}'); if (a < 0 || b <= a) throw new AIError('bad_output', 'AI không trả về JSON.');
  try { return JSON.parse(t.slice(a, b + 1)); } catch { throw new AIError('bad_output', 'AI trả về JSON hỏng.'); }
}
async function post(fetchImpl, url, headers, body, signal, who) {
  let r;
  try { r = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal }); }
  catch (e) { if (e.name === 'AbortError') throw e; throw new AIError('network', `${who}: không kết nối được.`, { retryable: true }); }
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* không phải JSON */ }
  if (!r.ok) throw httpError(r.status, json || text, who);
  if (!json) throw new AIError('bad_output', `${who}: phản hồi không phải JSON.`);
  return json;
}

async function get(fetchImpl, url, headers, signal, who) {
  let r;
  try { r = await fetchImpl(url, { method: 'GET', headers, signal }); }
  catch (e) { if (e.name === 'AbortError') throw e; throw new AIError('network', `${who}: không kết nối được.`, { retryable: true }); }
  const text = await r.text();
  if (!r.ok) { let j = null; try { j = JSON.parse(text); } catch { /* */ } throw httpError(r.status, j || text, who); }
  return text;
}
const MOCK_DIMS = { '16:9': [960, 540], '4:3': [800, 600], '1:1': [720, 720] };

// Chế độ BẤT ĐỒNG BỘ (Giai đoạn B): submitJSON gửi yêu cầu rồi trả ngay → { done:true, json, usage } hoặc { done:false, handle };
// pollJSON(handle) hỏi lại sau. Máy chủ (Edge Function) không bao giờ phải chờ một bài dài trong một request (giới hạn 150 s).
const mock = {
  name: 'mock', textModel: 'mock', imageModel: 'mock', isMock: true,
  async generateJSON({ meta = {} }) {
    const json = meta.task === 'suggest' ? mockIdeas(meta) : meta.task === 'revise' ? mockRevise(meta) : mockArticle(meta);
    return { json, usage: { model: 'mock', tokensIn: 0, tokensOut: 0 } };
  },
  async submitJSON(p) { return { done: true, ...(await mock.generateJSON(p)) }; },
  async pollJSON() { throw new AIError('bad_request', 'mock: không có yêu cầu đang chờ.'); },
  async generateImage({ prompt, ratio = '16:9' }) {
    const [w, h] = MOCK_DIMS[ratio] || MOCK_DIMS['16:9'];
    return { bytes: await placeholderPng(prompt, ratio), mime: 'image/png', w, h, usage: { model: 'mock', images: 1 } };
  }
};

function openaiText(env, fetchImpl) {
  const key = env.OPENAI_API_KEY, model = env.KT_AI_TEXT_MODEL;
  const H = { Authorization: `Bearer ${key}` };
  const bodyOf = ({ system, user, schema, maxOutputTokens }) => ({ model, input: [{ role: 'system', content: system }, { role: 'user', content: user }], max_output_tokens: maxOutputTokens,
    text: { format: schema ? { type: 'json_schema', name: 'yp_kt', schema, strict: false } : { type: 'json_object' } } });
  const result = j => {
    if (j.status === 'incomplete') throw new AIError('bad_output', 'OpenAI: bài bị cắt do vượt giới hạn token.');
    if (j.status === 'failed' || j.status === 'cancelled') throw new AIError('server', `OpenAI: yêu cầu ${j.status === 'failed' ? 'lỗi' : 'bị hủy'}${j.error && j.error.message ? ` (${String(j.error.message).slice(0, 200)})` : ''}.`, { retryable: true });
    const text = j.output_text || (j.output || []).flatMap(o => o.content || []).map(c => c.text || '').join('');
    return { json: parseJsonText(text), usage: { model, tokensIn: (j.usage && j.usage.input_tokens) || 0, tokensOut: (j.usage && j.usage.output_tokens) || 0 } };
  };
  return {
    name: 'openai', textModel: model,
    async generateJSON(p) { return result(await post(fetchImpl, 'https://api.openai.com/v1/responses', H, bodyOf(p), p.signal, 'OpenAI')); },
    // background mode: OpenAI tự chạy, máy chủ hỏi lại bằng GET /v1/responses/{id}. store:true để giữ kết quả cho tới khi hỏi lại.
    async submitJSON(p) {
      const j = await post(fetchImpl, 'https://api.openai.com/v1/responses', H, { ...bodyOf(p), background: true, store: true }, p.signal, 'OpenAI');
      if (j.status === 'queued' || j.status === 'in_progress') return { done: false, handle: { provider: 'openai', id: j.id } };
      return { done: true, ...result(j) };
    },
    async pollJSON(handle, { signal } = {}) {
      if (!handle || !/^[A-Za-z0-9_-]{4,120}$/.test(String(handle.id))) throw new AIError('bad_request', 'OpenAI: mã yêu cầu không hợp lệ.');
      const j = JSON.parse(await get(fetchImpl, `https://api.openai.com/v1/responses/${handle.id}`, H, signal, 'OpenAI'));
      if (j.status === 'queued' || j.status === 'in_progress') return { done: false, handle };
      return { done: true, ...result(j) };
    }
  };
}
// Ảnh: model họ gpt-image → yêu cầu WebP nén sẵn (máy chủ không có canvas, CPU giới hạn 2 s → không tự nén).
function openaiImage(env, fetchImpl) {
  const key = env.OPENAI_API_KEY, model = env.KT_AI_IMAGE_MODEL;
  const quality = ['low', 'medium', 'high'].includes(env.KT_AI_IMAGE_QUALITY) ? env.KT_AI_IMAGE_QUALITY : 'medium';
  const gptImage = /^gpt-image/i.test(String(model));
  return {
    imageModel: model, imageQuality: quality,
    async generateImage({ prompt, ratio = '16:9', signal }) {
      const size = SIZES[ratio] || '1024x1024';
      const body = { model, prompt, size, n: 1, ...(gptImage ? { quality, output_format: 'webp', output_compression: 82 } : {}) };
      const j = await post(fetchImpl, 'https://api.openai.com/v1/images/generations', { Authorization: `Bearer ${key}` }, body, signal, 'OpenAI ảnh');
      const d = j.data && j.data[0];
      if (!d || !d.b64_json) throw new AIError('bad_output', 'OpenAI ảnh: không có dữ liệu ảnh.');
      const [w, h] = size.split('x').map(Number);
      return { bytes: fromBase64(d.b64_json), mime: gptImage ? 'image/webp' : 'image/png', w, h, usage: { model, images: 1, quality } };
    }
  };
}
function anthropicText(env, fetchImpl) {
  const key = env.ANTHROPIC_API_KEY, model = env.KT_AI_TEXT_MODEL;
  const H = { 'x-api-key': key, 'anthropic-version': '2023-06-01' };
  const result = (j, batch = false) => {
    if (j.stop_reason === 'max_tokens') throw new AIError('bad_output', 'Anthropic: bài bị cắt do vượt giới hạn token.');
    const text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
    return { json: parseJsonText(text), usage: { model, tokensIn: (j.usage && j.usage.input_tokens) || 0, tokensOut: (j.usage && j.usage.output_tokens) || 0, batch } };
  };
  const params = ({ system, user, maxOutputTokens }) => ({ model, max_tokens: maxOutputTokens, system, messages: [{ role: 'user', content: user }] });
  return {
    name: 'anthropic', textModel: model,
    async generateJSON(p) { return result(await post(fetchImpl, 'https://api.anthropic.com/v1/messages', H, params(p), p.signal, 'Anthropic')); },
    // Message Batches: rẻ hơn 50 %, thường xong trong < 1 giờ (tối đa 24 giờ). Máy chủ hỏi lại định kỳ.
    async submitJSON(p) {
      const j = await post(fetchImpl, 'https://api.anthropic.com/v1/messages/batches', H, { requests: [{ custom_id: 'kt', params: params(p) }] }, p.signal, 'Anthropic');
      return { done: false, handle: { provider: 'anthropic', id: j.id } };
    },
    async pollJSON(handle, { signal } = {}) {
      if (!handle || !/^[A-Za-z0-9_-]{4,120}$/.test(String(handle.id))) throw new AIError('bad_request', 'Anthropic: mã batch không hợp lệ.');
      const b = JSON.parse(await get(fetchImpl, `https://api.anthropic.com/v1/messages/batches/${handle.id}`, H, signal, 'Anthropic'));
      if (b.processing_status !== 'ended') return { done: false, handle };
      if (!b.results_url || !/^https:\/\/api\.anthropic\.com\//.test(b.results_url)) throw new AIError('bad_output', 'Anthropic: batch không có link kết quả.');
      const lines = (await get(fetchImpl, b.results_url, H, signal, 'Anthropic')).split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } });
      const r = lines.find(l => l && l.custom_id === 'kt');
      if (!r || !r.result) throw new AIError('bad_output', 'Anthropic: không thấy kết quả trong batch.');
      if (r.result.type === 'succeeded') return { done: true, ...result(r.result.message, true) };
      if (r.result.type === 'expired') throw new AIError('timeout', 'Anthropic: batch hết hạn 24 giờ trước khi xử lý.', { retryable: true });
      throw new AIError('server', `Anthropic: yêu cầu trong batch ${r.result.type === 'canceled' ? 'bị hủy' : 'lỗi'}.`, { retryable: r.result.type !== 'canceled' });
    }
  };
}

// Trả về { text, image, describe } hoặc ném AIError('config') khi cấu hình thiếu.
export function createProviders(env = {}, { fetchImpl = globalThis.fetch } = {}) {
  const tp = (env.KT_AI_TEXT_PROVIDER || 'mock').toLowerCase();
  const ip = (env.KT_AI_IMAGE_PROVIDER || (tp === 'mock' ? 'mock' : 'none')).toLowerCase();
  const need = (cond, msg) => { if (!cond) throw new AIError('config', msg); };
  let text, image;
  if (tp === 'mock') text = mock;
  else if (tp === 'openai') { need(env.OPENAI_API_KEY, 'Thiếu OPENAI_API_KEY (Supabase Secrets).'); need(env.KT_AI_TEXT_MODEL, 'Thiếu KT_AI_TEXT_MODEL.'); text = openaiText(env, fetchImpl); }
  else if (tp === 'anthropic') { need(env.ANTHROPIC_API_KEY, 'Thiếu ANTHROPIC_API_KEY (Supabase Secrets).'); need(env.KT_AI_TEXT_MODEL, 'Thiếu KT_AI_TEXT_MODEL.'); text = anthropicText(env, fetchImpl); }
  else throw new AIError('config', `Nhà cung cấp chữ không hỗ trợ: ${tp}`);
  if (ip === 'mock') image = mock;
  else if (ip === 'openai') { need(env.OPENAI_API_KEY, 'Thiếu OPENAI_API_KEY cho ảnh.'); need(env.KT_AI_IMAGE_MODEL, 'Thiếu KT_AI_IMAGE_MODEL.'); image = openaiImage(env, fetchImpl); }
  else if (ip === 'none') image = null;
  else throw new AIError('config', `Nhà cung cấp ảnh không hỗ trợ: ${ip} (Anthropic không tạo ảnh).`);
  return { text, image, describe: { text: tp, textModel: text.textModel, image: image ? ip : 'none', imageModel: image ? image.imageModel : '', imageQuality: (image && image.imageQuality) || '', mock:tp === 'mock' || ip === 'mock' } };
}
