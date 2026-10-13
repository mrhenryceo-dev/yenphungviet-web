// Phase 1R — server chạy thử ở máy local (KHÔNG deploy). Mô phỏng vercel.json:
// file tĩnh + rewrite /kien-thuc* và /sitemap.xml → Function trong api/, dùng dữ liệu mẫu (KT_SAMPLE=1).
// Chạy: node tools/dev-server.mjs [port]   → chỉ lắng nghe 127.0.0.1
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
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

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  if (BLOCKED.test(u.pathname)) { res.statusCode = 404; return res.end('blocked (.vercelignore)'); }
  const file = await tryFile(u.pathname);
  if (file && !/\/api\//.test(u.pathname)) {
    if (!u.pathname.endsWith('/') && file.endsWith('index.html') && !u.pathname.endsWith('.html')) { res.statusCode = 308; res.setHeader('Location', u.pathname + '/' + u.search); return res.end(); }
    res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
    for (const h of vercel.headers || []) if (new RegExp('^' + h.source.replace('(.*)', '.*') + '$').test(u.pathname)) h.headers.forEach(x => res.setHeader(x.key, x.value));
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
