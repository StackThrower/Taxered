import { getArticles } from '../pages/knowledge/articles';
import { SITE_URL, localePath } from './site';

interface SitemapPage {
  path: string;
  lastmod: string;
  changefreq: string;
  priority: number;
}

/**
 * sitemap.xml for the static pages and the knowledge-base articles.
 * `lastmod` is used for the static pages; articles use their own dates.
 */
export function buildSitemap(lastmod: string): string {
  const pages: SitemapPage[] = [
    { path: '', lastmod, changefreq: 'weekly', priority: 1.0 },
    { path: localePath(), lastmod, changefreq: 'weekly', priority: 0.9 },
    { path: localePath('calculator'), lastmod, changefreq: 'monthly', priority: 0.8 },
    { path: localePath('about'), lastmod, changefreq: 'monthly', priority: 0.6 },
    { path: localePath('help'), lastmod, changefreq: 'weekly', priority: 0.7 },
    { path: localePath('knowledge'), lastmod, changefreq: 'daily', priority: 0.8 },
    ...getArticles().map((article) => ({
      path: localePath('knowledge', article.slug),
      lastmod: new Date(article.updatedAt ?? article.publishedAt).toISOString(),
      changefreq: 'monthly',
      priority: 0.7,
    })),
  ];

  const urls = pages
    .map(
      (page) =>
        `<url><loc>${SITE_URL}${page.path}</loc><lastmod>${page.lastmod}</lastmod>` +
        `<changefreq>${page.changefreq}</changefreq><priority>${page.priority}</priority></url>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
