import { RenderMode, ServerRoute } from '@angular/ssr';

const STATIC_PAGES = [
  '',
  'uk-ua',
  'uk-ua/calculator',
  'uk-ua/about',
  'uk-ua/help',
  'uk-ua/privacy',
  'uk-ua/terms',
  'uk-ua/knowledge',
];

export const serverRoutes: ServerRoute[] = [
  ...STATIC_PAGES.map((path): ServerRoute => ({ path, renderMode: RenderMode.Prerender })),
  {
    path: 'uk-ua/knowledge/:slug',
    renderMode: RenderMode.Prerender,
    async getPrerenderParams() {
      const { getArticles } = await import('./pages/knowledge/articles');
      return getArticles().map(({ slug }) => ({ slug }));
    },
  },
  // Unknown URLs are rendered on demand; the not-found page sets the 404 status.
  { path: '**', renderMode: RenderMode.Server },
];
