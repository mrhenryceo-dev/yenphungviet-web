// BẢN SAO TỰ ĐỘNG từ assets/kt/ai/notify.mjs — KHÔNG sửa ở đây. Sửa bản gốc rồi chạy: node tools/build-edge.mjs
// Phase 1S / Giai đoạn B — thông báo OWNER khi có bài chờ duyệt (hoặc việc bị lỗi cần xem).
// Mặc định KHÔNG gửi thật: mỗi thông báo được ghi vào hàng đợi kt_ai_notifications với trạng thái "dry_run".
// Gửi thật chỉ khi OWNER đặt KT_NOTIFY_MODE=send + cấu hình kênh. Kênh miễn phí, ít cấu hình: Telegram bot.
// Nội dung tin nhắn KHÔNG chứa bài viết — chỉ tiêu đề + link trang duyệt (link cần đăng nhập OWNER mới mở được).

export const MODES = ['off', 'dry-run', 'send'];

export function notifyConfig(env = {}) {
  const mode = MODES.includes(env.KT_NOTIFY_MODE) ? env.KT_NOTIFY_MODE : 'dry-run';
  const token = String(env.KT_NOTIFY_TELEGRAM_TOKEN || ''), chat = String(env.KT_NOTIFY_TELEGRAM_CHAT || '');
  const telegram = /^\d{5,15}:[A-Za-z0-9_-]{30,60}$/.test(token) && /^-?\d{3,20}$/.test(chat);
  const missing = mode === 'send' && !telegram ? ['KT_NOTIFY_TELEGRAM_TOKEN', 'KT_NOTIFY_TELEGRAM_CHAT'].filter(k => !env[k]) : [];
  return { mode, channel: telegram ? 'telegram' : 'none', ready: mode === 'send' && telegram, missing };
}

export function reviewUrl(base, jobId) {
  const b = String(base || 'https://yenphungviet.vercel.app').replace(/\/+$/, '');
  return `${b}/quan-tri/#duyet/${encodeURIComponent(jobId)}`;
}

export function buildMessage(kind, job, { reviewBase } = {}) {
  const title = String(job.title || '').replace(/\s+/g, ' ').slice(0, 140);
  const link = reviewUrl(reviewBase, job.id);
  if (kind === 'awaiting_owner') {
    const q = job.qa ? ` · QA ${job.qa.score}/100` : '';
    return `YẾN PHỤNG PET — Bài mới chờ bạn duyệt${q}\n«${title}»\nXem & duyệt (cần đăng nhập): ${link}\nAI không tự xuất bản; bài chỉ lên website khi bạn bấm Duyệt.`;
  }
  if (kind === 'qa') return `YẾN PHỤNG PET — Bài AI cần chú ý (còn lỗi kiểm tra chất lượng)\n«${title}»\n${link}`;
  return `YẾN PHỤNG PET — Xưởng nội dung gặp lỗi\n«${title}»\n${String(job.error || '').slice(0, 200)}\n${link}`;
}

// Gửi 1 thông báo. Trả về trạng thái để lưu lại; KHÔNG ném lỗi (thông báo hỏng không được làm hỏng bài).
export async function deliver(message, env = {}, { fetchImpl = globalThis.fetch } = {}) {
  const c = notifyConfig(env);
  if (c.mode === 'off') return { status: 'skipped', channel: 'none', detail: 'KT_NOTIFY_MODE=off' };
  if (c.mode === 'dry-run') return { status: 'dry_run', channel: c.channel, detail: 'Chế độ thử: đã ghi lại, KHÔNG gửi.' };
  if (!c.ready) return { status: 'failed', channel: 'none', detail: 'Thiếu cấu hình: ' + (c.missing.join(', ') || 'kênh thông báo') };
  try {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 10000);
    const r = await fetchImpl(`https://api.telegram.org/bot${env.KT_NOTIFY_TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ac.signal,
      body: JSON.stringify({ chat_id: env.KT_NOTIFY_TELEGRAM_CHAT, text: String(message).slice(0, 3500), disable_web_page_preview: true })
    }).finally(() => clearTimeout(t));
    if (!r.ok) return { status: 'failed', channel: 'telegram', detail: `Telegram HTTP ${r.status}` };
    return { status: 'sent', channel: 'telegram', detail: '' };
  } catch (e) { return { status: 'failed', channel: 'telegram', detail: e && e.name === 'AbortError' ? 'Telegram quá thời gian' : 'Không kết nối được Telegram' }; }
}
