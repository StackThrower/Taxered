import { getArticle, getArticles, getRelatedArticles, parseFrontMatter } from './articles';
import { renderMarkdown } from './markdown';

describe('parseFrontMatter', () => {
  it('parses quoted scalars and lists', () => {
    const { data, content } = parseFrontMatter(
      '---\ntitle: "Hello: world"\nreadTime: 5 хв\nkeywords:\n  - "a"\n  - b\n---\n\n# Body\n',
    );

    expect(data).toEqual({ title: 'Hello: world', readTime: '5 хв', keywords: ['a', 'b'] });
    expect(content).toBe('\n# Body\n');
  });

  it('returns the source unchanged when there is no front matter', () => {
    expect(parseFrontMatter('# Title')).toEqual({ data: {}, content: '# Title' });
  });
});

describe('articles', () => {
  it('lists every article newest first with metadata', () => {
    const articles = getArticles();

    expect(articles.length).toBe(8);
    const dates = articles.map((a) => new Date(a.publishedAt).getTime());
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
    expect(getArticle('tax-basics')?.title).toBe('Основи оподаткування в Україні 2026');
    expect(getArticle('tax-basics')?.content).not.toContain('publishedAt:');
  });

  it('excludes the current article from related articles', () => {
    const related = getRelatedArticles('tax-basics', 3);

    expect(related.length).toBe(3);
    expect(related.map((a) => a.slug)).not.toContain('tax-basics');
  });

  it('returns undefined for unknown slugs', () => {
    expect(getArticle('../../etc/passwd')).toBeUndefined();
  });
});

describe('renderMarkdown', () => {
  it('shifts headings down one level and opens external links in a new tab', () => {
    const html = renderMarkdown('# Title\n\n[ext](https://tax.gov.ua) [int](/uk-ua/help)');

    expect(html).toContain('<h2>Title</h2>');
    expect(html).toContain('<a target="_blank" rel="noopener noreferrer" href="https://tax.gov.ua">');
    expect(html).toContain('<a href="/uk-ua/help">');
  });

  it('wraps tables in a focusable scroll region', () => {
    const html = renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |');

    expect(html).toMatch(/<div class="table-scroll" role="region" aria-label="Таблиця" tabindex="0"><table>/);
  });
});
