// Phase 1R — server chạy thử ở máy local (KHÔNG deploy). Mô phỏng vercel.json:
// file tĩnh + rewrite /kien-thuc* và /sitemap.xml → Function trong api/, dùng dữ liệu mẫu (KT_SAMPLE=1).
// Chạy: node tools/dev-server.mjs [port]   → chỉ lắng nghe 127.0.0.1
import http from 'node:http';
import { readFile, stat, mkdir, readdir, writeFile, unlink } from 'node:fs/promises';
import os from 'node:os';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.KT_SAMPLE = process.env.KT_SAMPLE || '1';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const vercel = JSON.parse(await readFile(path.join(ROOT, 'vercel.json'), 'utf8'));
const PORT = Number(process.argv[2] || 8780);
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' };
const BLOCKED = /^\/(supabase|tools)\//;

// Phase 1S — chạy CHÍNH Edge Function kt-ai (handler.mjs) với MOCK provider cho /quan-tri/?dev=1.
// Không khóa API, không gọi mạng, không chi phí. Cờ "dev owner" chỉ có hiệu lực vì KT_RUNTIME=dev-server.
const devUsage = []; let ktAi = null;
async function devFunction(req, res) {
  if (!ktAi) ktAi = await import('../supabase/functions/kt-ai/handler.mjs');
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);
  const request = new Request(`http://127.0.0.1:${PORT}/__dev-fn/kt-ai`, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
  const env = { KT_AI_ENABLED: '1', KT_RUNTIME: 'dev-server', KT_DEV_FAKE_OWNER: '1', KT_AI_TEXT_PROVIDER: 'mock', KT_AI_IMAGE_PROVIDER: 'mock',
    KT_ALLOWED_ORIGINS: `http://127.0.0.1:${PORT},http://localhost:${PORT}` };
  // Hạn mức ngày / tháng được kiểm thử riêng (tools/kt-ai-test.mjs); ở máy local mock không tính hạn mức.
  const r = await ktAi.handle(request, env, { usageStore: { async list() { return []; }, async add(row) { devUsage.push(row); } } });
  res.statusCode = r.status; r.headers.forEach((v, k) => res.setHeader(k, v)); res.end(Buffer.from(await r.arrayBuffer()));
}

function matchRewrite(p) {
  for (const r of vercel.rewrites) {
    const keys = []; const re = new RegExp('^' + r.source.replace(/:([a-z]+)/g, (m, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    const m = p.match(re); if (!m) continue;
    let dest = r.destination; keys.forEach((k, i) => { dest = dest.replace(':' + k, encodeURIComponent(decodeURIComponent(m[i + 1]))); });
    return dest;
  }
  return null;
}
async function tryFile(p) {
  let f = path.join(ROOT, decodeURIComponent(p));
  if (!f.startsWith(ROOT)) return null;
  try { const s = await stat(f); if (s.isDirectory()) { f = path.join(f, 'index.html'); await stat(f); } return f; } catch { return null; }
}

// Mô phỏng Storage cho /quan-tri/?dev=1 (R4): ảnh thử lưu ở thư mục tạm của hệ điều hành, KHÔNG trong repo.
const MEDIA_DIR = path.join(os.tmpdir(), 'yp-kt-dev-media');
const KEY_RE = /^img\/[0-9a-f-]{36}-(1600|800|og)\.(webp|jpg)$/;
async function devStorage(req, res, u) {
  const send = (code, body, type = 'application/json') => { res.statusCode = code; res.setHeader('Content-Type', type); res.end(body); };
  await mkdir(path.join(MEDIA_DIR, 'img'), { recursive: true });
  if (u.pathname === '/__dev-supabase/list' && req.method === 'GET') {
    const names = await readdir(path.join(MEDIA_DIR, 'img'));
    const out = await Promise.all(names.map(async n => ({ name: n, created_at: (await stat(path.join(MEDIA_DIR, 'img', n))).mtime.toISOString() })));
    return send(200, JSON.stringify(out));
  }
  const m = u.pathname.match(/^\/__dev-supabase\/(upload|storage\/v1\/object\/public\/kien-thuc)\/(.+)$/);
  const key = m && decodeURIComponent(m[2]);
  if (!m || !KEY_RE.test(key)) return send(400, '{"error":"bad key"}');
  const file = path.join(MEDIA_DIR, key);
  if (m[1] === 'upload' && req.method === 'PUT') {
    if (!['image/webp', 'image/jpeg'].includes(req.headers['content-type'])) return send(415, '{"error":"type"}');
    const chunks = []; let size = 0;
    for await (const c of req) { size += c.length; if (size > 5242880) return send(413, '{"error":"too large"}'); chunks.push(c); }
    try { await writeFile(file, Buffer.concat(chunks), { flag: 'wx' }); } catch { return send(409, '{"error":"exists"}'); }   // như upsert:false
    return send(200, JSON.stringify({ Key: 'kien-thuc/' + key }));
  }
  if (m[1] === 'upload' && req.method === 'DELETE') { await unlink(file).catch(() => {}); return send(200, '[]'); }
  if (req.method === 'GET') { try { res.setHeader('Access-Control-Allow-Origin', '*'); return send(200, await readFile(file), key.endsWith('.jpg') ? 'image/jpeg' : 'image/webp'); } catch { return send(404, '{"error":"not_found"}'); } }
  return send(405, '{"error":"method"}');
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  if (u.pathname.startsWith('/__dev-supabase/')) return devStorage(req, res, u).catch(e => { console.error(e); res.statusCode = 500; res.end('dev storage error'); });
  if (u.pathname === '/__dev-fn/kt-ai') return devFunction(req, res).catch(e => { console.error(e); res.statusCode = 500; res.end('dev function error'); });
  if (BLOCKED.test(u.pathname)) { res.statusCode = 404; return res.end('blocked (.vercelignore)'); }
  const file = await tryFile(u.pathname);
  if (file && !/\/api\//.test(u.pathname)) {
    if (!u.pathname.endsWith('/') && file.endsWith('index.html') && !u.pathname.endsWith('.html')) { res.statusCode = 308; res.setHeader('Location', u.pathname + '/' + u.search); return res.end(); }
    res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
    // ?__devframe=1 (CHỈ dev-server): bỏ chặn nhúng iframe để kiểm tra giao diện quản trị ở khổ điện thoại
    const devFrame = u.searchParams.has('__devframe');
    for (const h of vercel.headers || []) if (new RegExp('^' + h.source.replace('(.*)', '.*') + '$').test(u.pathname)) h.headers.forEach(x => {
      if (devFrame && x.key === 'X-Frame-Options') return;
      res.setHeader(x.key, devFrame && x.key === 'Content-Security-Policy' ? x.value.replace("frame-ancestors 'none'", "frame-ancestors 'self'") : x.value);
    });
    return res.end(await readFile(file));
  }
  const dest = matchRewrite(u.pathname);
  if (dest) {
    const d = new URL(dest, 'http://127.0.0.1'); u.searchParams.forEach((v, k) => d.searchParams.set(k, v));
    const mod = path.join(ROOT, d.pathname + '.js');
    delete require.cache[mod];
    req.url = d.pathname + d.search;
    try { return await require(mod)(req, res); } catch (e) { console.error(e); res.statusCode = 500; return res.end('Function error'); }
  }
  res.statusCode = 404; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.end('404');
}).listen(PORT, '127.0.0.1', () => console.log(`dev server http://127.0.0.1:${PORT}  (KT_SAMPLE=${process.env.KT_SAMPLE})`));
