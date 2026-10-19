// BẢN SAO TỰ ĐỘNG từ assets/kt/ai/sources.mjs — KHÔNG sửa ở đây. Sửa bản gốc rồi chạy: node tools/build-edge.mjs
// Phase 1S / Giai đoạn B — kiểm tra LINK nguồn tham khảo có mở được không (HTTP).
// ⚠️ Đây CHỈ là kiểm tra kỹ thuật: link tồn tại và trả về trang. KHÔNG phải xác minh nội dung chuyên môn —
//    bài vẫn phải được OWNER đọc và đối chiếu nguồn trước khi duyệt.
// Quy tắc: chỉ https, không IP / localhost / cổng lạ / user:pass; theo chuyển hướng thủ công (≤ 5 lần, kiểm tra từng bước);
//          link hỏng (404/410…) hoặc không truy cập được (403/429/5xx/timeout) → BỎ khỏi bài, ghi lại lý do để OWNER xem.
export const CHECK = { timeoutMs: 8000, maxSources: 12, concurrency: 4, maxRedirects: 5 };
export const UA = 'YenPhungPet-SourceCheck/1.0 (+https://yenphungviet.vercel.app/kien-thuc/)';
export const STATE_LABEL = {
  ok: 'Mở được', broken: 'Link hỏng / không tồn tại', unreachable: 'Không truy cập được', invalid: 'Link không hợp lệ / không an toàn', 'no-url': 'Không có link'
};

export function urlProblem(raw) {
  let u; try { u = new URL(String(raw || '')); } catch { return 'Không phải địa chỉ web hợp lệ.'; }
  if (u.protocol !== 'https:') return 'Chỉ chấp nhận https.';
  if (u.username || u.password) return 'Link chứa tên đăng nhập / mật khẩu.';
  if (u.port && u.port !== '443') return 'Cổng không chuẩn.';
  const h = u.hostname.toLowerCase();
  if (!h.includes('.') || /^[\d.]+$/.test(h) || h.startsWith('[') || /(^|\.)(localhost|local|internal|lan|home|corp)$/.test(h)) return 'Tên miền không hợp lệ (IP / nội bộ).';
  if (String(raw).length > 2000) return 'Link quá dài.';
  return '';
}

const classify = status => (status >= 200 && status < 300 ? 'ok' : [404, 410, 400, 414, 451].includes(status) ? 'broken' : 'unreachable');

// Một lần gửi (HEAD hoặc GET), KHÔNG tự theo chuyển hướng.
async function once(fetchImpl, url, method, timeoutMs) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetchImpl(url, { method, redirect: 'manual', signal: ac.signal,
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8', ...(method === 'GET' ? { Range: 'bytes=0-2047' } : {}) } });
    try { if (r.body && r.body.cancel) await r.body.cancel(); } catch { /* bỏ qua */ }
    return { status: r.status, location: r.headers && r.headers.get ? r.headers.get('location') : null };
  } finally { clearTimeout(t); }
}

export async function checkUrl(url, { fetchImpl = globalThis.fetch, timeoutMs = CHECK.timeoutMs } = {}) {
  const bad = urlProblem(url);
  if (bad) return { url, state: 'invalid', ok: false, status: 0, reason: bad };
  let cur = url;
  for (let hop = 0; hop <= CHECK.maxRedirects; hop++) {
    let r;
    try {
      r = await once(fetchImpl, cur, 'HEAD', timeoutMs);
      if (r.status === 405 || r.status === 501 || r.status === 403 || (r.status >= 400 && r.status !== 404 && r.status !== 410)) r = await once(fetchImpl, cur, 'GET', timeoutMs);   // nhiều trang từ chối HEAD
    } catch (e) {
      return { url, state: 'unreachable', ok: false, status: 0, reason: e && e.name === 'AbortError' ? `Quá ${Math.round(timeoutMs / 1000)} giây không phản hồi.` : 'Không kết nối được (tên miền không tồn tại hoặc lỗi mạng).' };
    }
    if (r.status >= 300 && r.status < 400 && r.location) {
      let next; try { next = new URL(r.location, cur).href; } catch { return { url, state: 'invalid', ok: false, status: r.status, reason: 'Chuyển hướng tới địa chỉ không hợp lệ.' }; }
      const p = urlProblem(next); if (p) return { url, state: 'invalid', ok: false, status: r.status, reason: 'Chuyển hướng tới địa chỉ không an toàn: ' + p };
      cur = next; continue;
    }
    const state = classify(r.status);
    return { url, state, ok: state === 'ok', status: r.status, finalUrl: cur !== url ? cur : undefined,
      reason: state === 'ok' ? 'Trang mở được (HTTP ' + r.status + ').' : state === 'broken' ? `Trang không tồn tại (HTTP ${r.status}).` : `Trang từ chối hoặc lỗi máy chủ (HTTP ${r.status}).` };
  }
  return { url, state: 'unreachable', ok: false, status: 0, reason: 'Chuyển hướng quá nhiều lần.' };
}

// sources: [{ title, url }] (dạng của kt_articles.sources). Trả về nguồn giữ lại + nguồn bị bỏ + kết quả từng link.
export async function checkSources(sources, { fetchImpl = globalThis.fetch, timeoutMs = CHECK.timeoutMs, now = () => new Date() } = {}) {
  const list = (sources || []).slice(0, CHECK.maxSources).map(s => (typeof s === 'string' ? { title: s, url: '' } : { title: String(s.title || ''), url: String(s.url || '') }));
  const seen = new Set(); const uniq = list.filter(s => { const k = s.url || 't:' + s.title; if (seen.has(k)) return false; seen.add(k); return true; });
  const results = new Array(uniq.length);
  let i = 0;
  const worker = async () => {
    while (i < uniq.length) {
      const k = i++; const s = uniq[k];
      results[k] = s.url ? { title: s.title, ...(await checkUrl(s.url, { fetchImpl, timeoutMs })) } : { title: s.title, url: '', state: 'no-url', ok: false, status: 0, reason: 'Nguồn không có link — OWNER cần tự xác minh nguồn có thật.' };
    }
  };
  await Promise.all(Array.from({ length: Math.min(CHECK.concurrency, uniq.length) }, worker));
  const kept = [], removed = [];
  results.forEach((r, k) => { if (r.state === 'ok' || r.state === 'no-url') kept.push({ title: uniq[k].title, url: uniq[k].url }); else removed.push({ title: uniq[k].title, url: uniq[k].url, state: r.state, reason: r.reason }); });
  return {
    at: now().toISOString(), kept, removed, results,
    summary: { ok: results.filter(r => r.state === 'ok').length, noUrl: results.filter(r => r.state === 'no-url').length, removed: removed.length, total: results.length },
    note: 'Đã kiểm tra link MỞ ĐƯỢC hay không. CHƯA xác minh nội dung chuyên môn — OWNER cần đọc nguồn.'
  };
}
