// Phase 1R — GET /kien-thuc/  → HTML thư viện (dựng ở server để có SEO và ảnh xem trước khi chia sẻ).
module.exports = async (req, res) => {
  const R = await import('../assets/kt/render.mjs');
  const D = await import('./_lib/kt-data.mjs');
  const url = new URL(req.url, 'http://localhost');
  const topic = (url.searchParams.get('chu-de') || '').slice(0, 40);
  const articles = await D.listPublished();
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
  res.end(R.renderListPage(articles, { topic }));
};
