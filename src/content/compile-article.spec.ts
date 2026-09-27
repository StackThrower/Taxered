import { articleSlug, compileArticle, renderMarkdown } from './compile-article';

const FRONT_MATTER = [
  'title: "Hello: world"',
  'description: Опис',
  'category: податки',
  'readTime: 5 хв',
  'publishedAt: "2025-01-15"',
  'keywords:',
  '  - "a"',
  '  - b',
];

function source(lines = FRONT_MATTER, body = '\n# Body\n'): string {
  return `---\n${lines.join('\n')}\n---\n${body}`;
}

describe('articleSlug', () => {
  it('strips the locale prefix', () => {
    expect(articleSlug('uk-ua-crypto-tax.md')).toBe('crypto-tax');
  });

  it('rejects file names without the locale prefix or with unsafe characters', () => {
    expect(() => articleSlug('crypto-tax.md')).toThrow('uk-ua-<slug>.md');
    expect(() => articleSlug('uk-ua-Crypto Tax.md')).toThrow('uk-ua-<slug>.md');
  });
});

describe('compileArticle', () => {
  it('parses the front matter and renders the body', () => {
    const { metadata, html } = compileArticle('uk-ua-hello.md', source());

    expect(metadata).toEqual({
      slug: 'hello',
      title: 'Hello: world',
      description: 'Опис',
      category: 'податки',
      readTime: '5 хв',
      publishedAt: '2025-01-15',
      keywords: ['a', 'b'],
    });
    expect(html).toBe('<h2>Body</h2>\n');
  });

  it('accepts a BOM, flow-style lists and an optional updatedAt', () => {
    const lines = [...FRONT_MATTER.slice(0, 5), 'updatedAt: 2025-03-01', 'keywords: [a, b]'];
    const { metadata } = compileArticle('uk-ua-hello.md', `﻿${source(lines)}`);

    expect(metadata.updatedAt).toBe('2025-03-01');
    expect(metadata.keywords).toEqual(['a', 'b']);
  });

  it('defaults keywords to an empty list', () => {
    const { metadata } = compileArticle('uk-ua-hello.md', source(FRONT_MATTER.slice(0, 5)));

    expect(metadata.keywords).toEqual([]);
  });

  it.each([
    ['missing front matter', '# Body', 'missing front matter'],
    ['a missing field', source(FRONT_MATTER.slice(1)), '"title" must be a non-empty string'],
    ['an empty field', source(['title:', ...FRONT_MATTER.slice(1)]), '"title" must be'],
    [
      'a non-ISO date',
      source([...FRONT_MATTER.slice(0, 4), 'publishedAt: 15.01.2025']),
      'YYYY-MM-DD',
    ],
    [
      'an impossible date',
      source([...FRONT_MATTER.slice(0, 4), 'publishedAt: 2025-02-30']),
      'YYYY-MM-DD',
    ],
    [
      'an out-of-range date',
      source([...FRONT_MATTER.slice(0, 4), 'publishedAt: 2025-13-45']),
      'YYYY-MM-DD',
    ],
    ['a misspelled field', source([...FRONT_MATTER, 'updated_at: 2025-03-01']), 'updated_at'],
    ['non-string keywords', source([...FRONT_MATTER.slice(0, 5), 'keywords: a, b']), '"keywords"'],
    ['invalid YAML', source([...FRONT_MATTER, 'title: [']), 'invalid front matter'],
    ['an empty body', source(FRONT_MATTER, '\n  \n'), 'body is empty'],
  ])('rejects %s with the file name in the message', (_case, input, message) => {
    expect(() => compileArticle('uk-ua-hello.md', input)).toThrow(message);
    expect(() => compileArticle('uk-ua-hello.md', input)).toThrow('uk-ua-hello.md');
  });
});

describe('renderMarkdown', () => {
  it('shifts headings down one level and opens external links in a new tab', () => {
    const html = renderMarkdown('# Title\n\n[ext](https://tax.gov.ua) [int](/uk-ua/help)');

    expect(html).toContain('<h2>Title</h2>');
    expect(html).toContain(
      '<a target="_blank" rel="noopener noreferrer" href="https://tax.gov.ua">',
    );
    expect(html).toContain('<a href="/uk-ua/help">');
  });

  it('wraps tables in a focusable scroll region', () => {
    const html = renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |');

    expect(html).toMatch(
      /<div class="table-scroll" role="region" aria-label="Таблиця" tabindex="0"><table>/,
    );
  });
});
