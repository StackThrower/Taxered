import { ARTICLE_HTML, ARTICLES } from './generated';

/**
 * Knowledge-base articles. The Markdown files in src/content/articles are
 * compiled by scripts/build-articles.mjs (run before `start`, `build`, `watch`
 * and `test`) into ./generated: a small metadata index, newest first, plus one
 * lazily loaded chunk of pre-rendered HTML per article. To add an article, drop
 * a `uk-ua-<slug>.md` file into src/content/articles.
 */
export interface ArticleMetadata {
  slug: string;
  title: string;
  description: string;
  category: string;
  readTime: string;
  publishedAt: string;
  updatedAt?: string;
  keywords: string[];
}

/** All articles, newest first. */
export function getArticles(): readonly ArticleMetadata[] {
  return ARTICLES;
}

export function getArticle(slug: string): ArticleMetadata | undefined {
  return ARTICLES.find((article) => article.slug === slug);
}

export function getRelatedArticles(slug: string, limit = 3): ArticleMetadata[] {
  return ARTICLES.filter((article) => article.slug !== slug).slice(0, limit);
}

/** Loads the article's pre-rendered HTML body; rejects for unknown slugs. */
export async function loadArticleHtml(slug: string): Promise<string> {
  const load = Object.hasOwn(ARTICLE_HTML, slug) ? ARTICLE_HTML[slug] : undefined;
  if (!load) {
    throw new Error(`Unknown article: ${slug}`);
  }
  return (await load()).default;
}
