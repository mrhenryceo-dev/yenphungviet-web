// Phase 1R — GET /kien-thuc/<slug>/  → HTML bài viết (SEO, Open Graph, JSON-LD).
// Chỉ bài status='published' (RLS). Bài nháp / đã ẩn / không tồn tại → 404 + noindex.
module.exports = async (req, res) => {
  const R = await import('../assets/kt/render.mjs');
  const D = await import('./_lib/kt-data.mjs');
  const url = new URL(req.url, 'http://localhost');
  const slug = (url.searchParams.get('slug') || '').replace(/\/+$/, '');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const article = R.isSlug(slug) ? await D.getPublished(slug) : null;
  if (!article) {
    res.statusCode = 404;
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    return res.end(R.renderNotFound());
  }
  const related = await D.relatedTo(article);
  res.statusCode = 200;
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
  res.end(R.renderArticlePage(article, related));
};
