import { ActivatedRouteSnapshot, Routes } from '@angular/router';
import { HOME_PATH, LOCALE } from './core/site';

const chatPage = () => import('./chat/chat-page').then((m) => m.ChatPage);

/** The former tool pages are now tasks of the chat assistant. */
export const LEGACY_TOOL_PAGES: Readonly<Record<string, string>> = {
  calculator: 'returns',
  'tax-map': 'tax-map',
  ledger: 'spreads',
};

export const routes: Routes = [
  { path: '', pathMatch: 'full', loadComponent: chatPage },
  {
    path: LOCALE,
    children: [
      // The home page lives only at the site root; query params (e.g. `?topic=`) are kept.
      { path: '', pathMatch: 'full', redirectTo: HOME_PATH },
      ...Object.entries(LEGACY_TOOL_PAGES).map(([path, topic]) => ({
        path,
        redirectTo: `${HOME_PATH}?topic=${topic}`,
      })),
      {
        path: 'about',
        loadComponent: () => import('./pages/about/about-page').then((m) => m.AboutPage),
      },
      {
        path: 'help',
        loadComponent: () => import('./pages/help/help-page').then((m) => m.HelpPage),
      },
      {
        path: 'privacy',
        loadComponent: () => import('./pages/legal/legal-page').then((m) => m.LegalPage),
        data: { document: 'privacy' },
      },
      {
        path: 'terms',
        loadComponent: () => import('./pages/legal/legal-page').then((m) => m.LegalPage),
        data: { document: 'terms' },
      },
      {
        path: 'knowledge',
        loadComponent: () =>
          import('./pages/knowledge/knowledge-page').then((m) => m.KnowledgePage),
      },
      {
        path: 'knowledge/:slug',
        // Unknown slugs fall through to the 404 page.
        canMatch: [
          async (_route, segments) => {
            const { getArticle } = await import('./pages/knowledge/articles');
            return !!getArticle(segments.at(-1)?.path ?? '');
          },
        ],
        // Only the requested article's HTML is loaded; it reaches the page as the `html` input.
        resolve: {
          html: async (route: ActivatedRouteSnapshot) => {
            const { loadArticleHtml } = await import('./pages/knowledge/articles');
            return loadArticleHtml(route.paramMap.get('slug') ?? '');
          },
        },
        loadComponent: () => import('./pages/knowledge/article-page').then((m) => m.ArticlePage),
      },
    ],
  },
  {
    path: '**',
    loadComponent: () => import('./pages/not-found/not-found-page').then((m) => m.NotFoundPage),
  },
];
