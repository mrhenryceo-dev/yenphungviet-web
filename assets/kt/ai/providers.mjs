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

const mock = {
  name: 'mock', textModel: 'mock', imageModel: 'mock', isMock: true,
  async generateJSON({ meta = {} }) {
    const json = meta.task === 'suggest' ? mockIdeas(meta) : meta.task === 'revise' ? mockRevise(meta) : mockArticle(meta);
    return { json, usage: { model: 'mock', tokensIn: 0, tokensOut: 0 } };
  },
  async generateImage({ prompt, ratio }) { return { bytes: await placeholderPng(prompt, ratio), mime: 'image/png', usage: { model: 'mock', images: 1 } }; }
};

function openaiText(env, fetchImpl) {
  const key = env.OPENAI_API_KEY, model = env.KT_AI_TEXT_MODEL;
  return {
    name: 'openai', textModel: model,
    async generateJSON({ system, user, schema, maxOutputTokens, signal }) {
      const body = { model, input: [{ role: 'system', content: system }, { role: 'user', content: user }], max_output_tokens: maxOutputTokens,
        text: { format: schema ? { type: 'json_schema', name: 'yp_kt', schema, strict: false } : { type: 'json_object' } } };
      const j = await post(fetchImpl, 'https://api.openai.com/v1/responses', { Authorization: `Bearer ${key}` }, body, signal, 'OpenAI');
      const text = j.output_text || (j.output || []).flatMap(o => o.content || []).map(c => c.text || '').join('');
      if (j.status === 'incomplete') throw new AIError('bad_output', 'OpenAI: bài bị cắt do vượt giới hạn token.');
      return { json: parseJsonText(text), usage: { model, tokensIn: (j.usage && j.usage.input_tokens) || 0, tokensOut: (j.usage && j.usage.output_tokens) || 0 } };
    }
  };
}
function openaiImage(env, fetchImpl) {
  const key = env.OPENAI_API_KEY, model = env.KT_AI_IMAGE_MODEL;
  return {
    imageModel: model,
    async generateImage({ prompt, ratio = '16:9', signal }) {
      const j = await post(fetchImpl, 'https://api.openai.com/v1/images/generations', { Authorization: `Bearer ${key}` }, { model, prompt, size: SIZES[ratio] || '1024x1024', n: 1 }, signal, 'OpenAI ảnh');
      const d = j.data && j.data[0];
      if (!d || !d.b64_json) throw new AIError('bad_output', 'OpenAI ảnh: không có dữ liệu ảnh.');
      return { bytes: fromBase64(d.b64_json), mime: 'image/png', usage: { model, images: 1 } };
    }
  };
}
function anthropicText(env, fetchImpl) {
  const key = env.ANTHROPIC_API_KEY, model = env.KT_AI_TEXT_MODEL;
  return {
    name: 'anthropic', textModel: model,
    async generateJSON({ system, user, maxOutputTokens, signal }) {
      const j = await post(fetchImpl, 'https://api.anthropic.com/v1/messages', { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        { model, max_tokens: maxOutputTokens, system, messages: [{ role: 'user', content: user }] }, signal, 'Anthropic');
      if (j.stop_reason === 'max_tokens') throw new AIError('bad_output', 'Anthropic: bài bị cắt do vượt giới hạn token.');
      const text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
      return { json: parseJsonText(text), usage: { model, tokensIn: (j.usage && j.usage.input_tokens) || 0, tokensOut: (j.usage && j.usage.output_tokens) || 0 } };
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
  return { text, image, describe: { text: tp, textModel: text.textModel, image: image ? ip : 'none', imageModel: image ? image.imageModel : '', mock: tp === 'mock' || ip === 'mock' } };
}
