import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { getArticle, loadArticleHtml } from './articles';

/** The article HTML as the DOM serializes it (e.g. `&#39;` becomes `'`). */
async function articleBody(slug: string): Promise<string> {
  const template = document.createElement('template');
  template.innerHTML = await loadArticleHtml(slug);
  return template.innerHTML;
}

describe('ArticlePage', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes, withComponentInputBinding())],
    });
  });

  it('renders the resolved article and swaps it when navigating to another one', async () => {
    const harness = await RouterTestingHarness.create();
    const query = (selector: string) => harness.routeNativeElement?.querySelector(selector);

    await harness.navigateByUrl('/uk-ua/knowledge/tax-basics');
    expect(query('h1')?.textContent).toBe(getArticle('tax-basics')?.title);
    expect(query('.article-content')?.innerHTML).toBe(await articleBody('tax-basics'));

    // The page component is reused between articles, so the resolver must re-run.
    await harness.navigateByUrl('/uk-ua/knowledge/crypto-tax');
    expect(query('h1')?.textContent).toBe(getArticle('crypto-tax')?.title);
    expect(query('.article-content')?.innerHTML).toBe(await articleBody('crypto-tax'));
  });

  it('falls through to the 404 page for unknown slugs', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/uk-ua/knowledge/missing');

    expect(harness.routeNativeElement?.querySelector('.article-content')).toBeNull();
  });
});
