import { Marked, Renderer } from 'marked';
import { parse as parseYaml } from 'yaml';
import type { ArticleMetadata } from '../app/pages/knowledge/articles';

/*
 * Build-time compiler for the knowledge-base articles, run by
 * scripts/build-articles.mjs (through Node's type stripping, so this file must
 * stay erasable-syntax-only and import types with `import type`). The app only
 * ships its output: a metadata index and one pre-rendered HTML chunk per article.
 */

const FILE_NAME = /^uk-ua-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
const FRONT_MATTER = /^﻿?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const REQUIRED = ['title', 'description', 'category', 'readTime', 'publishedAt'] as const;
const OPTIONAL = ['updatedAt', 'keywords'] as const;

export interface CompiledArticle {
  metadata: ArticleMetadata;
  html: string;
}

/** Article slug for a source file name (`uk-ua-crypto-tax.md` → `crypto-tax`). */
export function articleSlug(fileName: string): string {
  const match = FILE_NAME.exec(fileName);
  if (!match) {
    throw new Error(`${fileName}: expected a file name like "uk-ua-<slug>.md"`);
  }
  return match[1];
}

/** Parses and validates the front matter and renders the Markdown body. Throws on invalid input. */
export function compileArticle(fileName: string, source: string): CompiledArticle {
  const slug = articleSlug(fileName);
  const fail = (message: string): never => {
    throw new Error(`${fileName}: ${message}`);
  };

  const match = FRONT_MATTER.exec(source);
  if (!match) {
    return fail('missing front matter (--- ... ---) at the top of the file');
  }

  let data: unknown;
  try {
    data = parseYaml(match[1]);
  } catch (error) {
    return fail(`invalid front matter: ${(error as Error).message}`);
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return fail('front matter must be a mapping of fields');
  }
  const fields = data as Record<string, unknown>;

  const known: readonly string[] = [...REQUIRED, ...OPTIONAL];
  const unknown = Object.keys(fields).filter((key) => !known.includes(key));
  if (unknown.length > 0) {
    fail(`unknown front matter field(s): ${unknown.join(', ')}`);
  }

  const text = (key: string): string => {
    const value = fields[key];
    return typeof value === 'string' && value.trim() !== ''
      ? value.trim()
      : fail(`"${key}" must be a non-empty string`);
  };
  const date = (key: string): string => {
    const value = text(key);
    // Round-tripping through Date rejects impossible dates such as 2025-02-30.
    const time = DATE.test(value) ? Date.parse(`${value}T00:00:00Z`) : NaN;
    const valid = !Number.isNaN(time) && new Date(time).toISOString().startsWith(value);
    return valid ? value : fail(`"${key}" must be a date in YYYY-MM-DD format, got "${value}"`);
  };

  const keywords = fields['keywords'] ?? [];
  if (
    !Array.isArray(keywords) ||
    !keywords.every((k) => typeof k === 'string' && k.trim() !== '')
  ) {
    fail('"keywords" must be a list of non-empty strings');
  }

  const content = source.slice(match[0].length);
  if (content.trim() === '') {
    fail('the article body is empty');
  }

  return {
    metadata: {
      slug,
      title: text('title'),
      description: text('description'),
      category: text('category'),
      readTime: text('readTime'),
      publishedAt: date('publishedAt'),
      ...(fields['updatedAt'] === undefined ? {} : { updatedAt: date('updatedAt') }),
      keywords: (keywords as string[]).map((k) => k.trim()),
    },
    html: renderMarkdown(content),
  };
}

/**
 * Renderer for article bodies:
 *  - headings are shifted one level down, because the page already renders the
 *    article title as the only `<h1>`;
 *  - external links open in a new tab; internal ones are routed by the page;
 *  - code blocks and tables can scroll horizontally on small screens, so they
 *    are made focusable to keep them keyboard-accessible.
 */
const marked = new Marked({
  gfm: true,
  async: false,
  renderer: {
    heading({ tokens, depth }) {
      const level = Math.min(depth + 1, 6);
      return `<h${level}>${this.parser.parseInline(tokens)}</h${level}>\n`;
    },
    link(token) {
      const html = Renderer.prototype.link.call(this, token);
      return /^https?:\/\//i.test(token.href)
        ? html.replace('<a ', '<a target="_blank" rel="noopener noreferrer" ')
        : html;
    },
    code(token) {
      return Renderer.prototype.code.call(this, token).replace('<pre>', '<pre tabindex="0">');
    },
    table(token) {
      const html = Renderer.prototype.table.call(this, token);
      return `<div class="table-scroll" role="region" aria-label="Таблиця" tabindex="0">${html}</div>\n`;
    },
  },
});

export function renderMarkdown(markdown: string): string {
  return marked.parse(markdown, { async: false });
}
