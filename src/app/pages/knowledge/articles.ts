import cryptoTax from '../../../content/articles/uk-ua-crypto-tax.md';
import flexReportIb from '../../../content/articles/uk-ua-flex-report-ib.md';
import fopBenefits from '../../../content/articles/uk-ua-fop-benefits.md';
import foreignIncome from '../../../content/articles/uk-ua-foreign-income.md';
import freelanceTaxes from '../../../content/articles/uk-ua-freelance-taxes.md';
import investmentIncome from '../../../content/articles/uk-ua-investment-income.md';
import realEstateTax from '../../../content/articles/uk-ua-real-estate-tax.md';
import taxBasics from '../../../content/articles/uk-ua-tax-basics.md';

/**
 * Knowledge-base articles. The Markdown files are bundled at build time (see the
 * `.md` loader in angular.json), so articles work for prerendering, SSR and
 * client-side navigation without a content API. To add an article, drop a file
 * into src/content/articles and register it here.
 */
const SOURCES: Record<string, string> = {
  'crypto-tax': cryptoTax,
  'flex-report-ib': flexReportIb,
  'fop-benefits': fopBenefits,
  'foreign-income': foreignIncome,
  'freelance-taxes': freelanceTaxes,
  'investment-income': investmentIncome,
  'real-estate-tax': realEstateTax,
  'tax-basics': taxBasics,
};

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

export interface Article extends ArticleMetadata {
  /** Markdown body without the front matter. */
  content: string;
}

const ARTICLES: Article[] = Object.entries(SOURCES)
  .map(([slug, source]) => parseArticle(slug, source))
  .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

/** All articles, newest first. */
export function getArticles(): ArticleMetadata[] {
  return ARTICLES.map(({ content: _content, ...metadata }) => metadata);
}

export function getArticle(slug: string): Article | undefined {
  return ARTICLES.find((article) => article.slug === slug);
}

export function getRelatedArticles(slug: string, limit = 3): ArticleMetadata[] {
  return getArticles()
    .filter((article) => article.slug !== slug)
    .slice(0, limit);
}

function parseArticle(slug: string, source: string): Article {
  const { data, content } = parseFrontMatter(source);
  const str = (key: string) => (typeof data[key] === 'string' ? (data[key] as string) : undefined);
  const list = data['keywords'];

  return {
    slug,
    title: str('title') ?? slug,
    description: str('description') ?? '',
    category: str('category') ?? 'general',
    readTime: str('readTime') ?? '5 хв',
    publishedAt: str('publishedAt') ?? '1970-01-01',
    updatedAt: str('updatedAt'),
    keywords: Array.isArray(list) ? list : [],
    content,
  };
}

/**
 * Minimal YAML front-matter parser for the subset the articles use:
 * `key: "value"`, `key: value` and `key:` followed by `  - "item"` lines.
 */
export function parseFrontMatter(source: string): {
  data: Record<string, string | string[]>;
  content: string;
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) {
    return { data: {}, content: source };
  }

  const data: Record<string, string | string[]> = {};
  let listKey: string | null = null;

  for (const line of match[1].split(/\r?\n/)) {
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && listKey) {
      (data[listKey] as string[]).push(unquote(item[1]));
      continue;
    }
    const pair = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!pair) {
      continue;
    }
    const [, key, value] = pair;
    if (value === '') {
      data[key] = [];
      listKey = key;
    } else {
      data[key] = unquote(value);
      listKey = null;
    }
  }

  return { data, content: source.slice(match[0].length) };
}

function unquote(value: string): string {
  const trimmed = value.trim();
  const quoted = /^(["'])(.*)\1$/.exec(trimmed);
  return quoted ? quoted[2] : trimmed;
}
