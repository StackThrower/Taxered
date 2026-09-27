import { getArticle, getArticles, getRelatedArticles, loadArticleHtml } from './articles';

describe('articles', () => {
  it('lists every article newest first with metadata', () => {
    const articles = getArticles();

    expect(articles.length).toBeGreaterThan(0);
    const dates = articles.map((a) => a.publishedAt);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(getArticle('tax-basics')?.title).toBe('Основи оподаткування в Україні 2026');
  });

  it('excludes the current article from related articles', () => {
    const related = getRelatedArticles('tax-basics', 3);

    expect(related.length).toBe(3);
    expect(related.map((a) => a.slug)).not.toContain('tax-basics');
  });

  it('returns undefined for unknown slugs', () => {
    expect(getArticle('../../etc/passwd')).toBeUndefined();
  });

  it('loads the pre-rendered HTML of an article', async () => {
    const html = await loadArticleHtml('tax-basics');

    expect(html).toContain('<h2>');
    expect(html).not.toContain('publishedAt:');
  });

  it('rejects unknown slugs, including inherited object keys', async () => {
    await expect(loadArticleHtml('missing')).rejects.toThrow('Unknown article');
    await expect(loadArticleHtml('constructor')).rejects.toThrow('Unknown article');
  });
});
