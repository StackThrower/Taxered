import { Marked, Renderer } from 'marked';

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
