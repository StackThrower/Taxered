import { Routes } from '@angular/router';
import { LOCALE } from './core/site';

const homePage = () => import('./pages/home/home-page').then((m) => m.HomePage);

export const routes: Routes = [
  { path: '', pathMatch: 'full', loadComponent: homePage, data: { root: true } },
  {
    path: LOCALE,
    children: [
      { path: '', pathMatch: 'full', loadComponent: homePage },
      {
        path: 'calculator',
        loadComponent: () =>
          import('./pages/calculator/calculator-page').then((m) => m.CalculatorPage),
      },
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
        loadComponent: () => import('./pages/knowledge/article-page').then((m) => m.ArticlePage),
      },
    ],
  },
  {
    path: '**',
    loadComponent: () => import('./pages/not-found/not-found-page').then((m) => m.NotFoundPage),
  },
];
