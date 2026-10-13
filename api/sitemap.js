// Phase 1R — GET /sitemap.xml  → trang chủ, /chon-nhom-choi, /kien-thuc/ và mọi bài đã xuất bản.
module.exports = async (req, res) => {
  const R = await import('../assets/kt/render.mjs');
  const D = await import('./_lib/kt-data.mjs');
  const articles = await D.listPublished();
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.end(R.sitemapXml(articles));
};
