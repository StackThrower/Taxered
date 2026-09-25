import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ArrowLeft } from 'lucide';
import { UK } from '../../core/i18n';
import { SeoService } from '../../core/seo.service';
import { localePath } from '../../core/site';
import { Icon } from '../../shared/icon';
import { getArticle, getRelatedArticles } from './articles';
import { renderMarkdown } from './markdown';

const dateFormat = new Intl.DateTimeFormat('uk-UA', { timeZone: 'UTC' });

@Component({
  selector: 'app-article-page',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (article(); as article) {
      <article class="container mx-auto max-w-4xl px-4 py-12">
        <a [routerLink]="listPath" class="btn btn-ghost btn-sm mb-8">
          <svg [appIcon]="ArrowLeft" class="mr-2 size-4"></svg>
          {{ s.back }}
        </a>

        <header class="mb-8">
          <div class="mb-4 flex flex-wrap items-center gap-4">
            <span class="badge capitalize">{{ article.category }}</span>
            <span class="text-sm text-muted-foreground">
              <span class="sr-only">{{ s.readTime }}: </span>{{ article.readTime }}
            </span>
            <span class="text-sm text-muted-foreground">
              <span class="sr-only">{{ s.publishedAt }}: </span>
              <time [attr.datetime]="article.publishedAt">{{ publishedAt() }}</time>
            </span>
          </div>
          <h1 class="mb-4 text-4xl font-bold md:text-5xl">{{ article.title }}</h1>
          <p class="text-xl text-muted-foreground">{{ article.description }}</p>
        </header>

        <div
          class="article-content mb-12 max-w-none text-lg"
          [innerHTML]="html()"
          (click)="onContentClick($event)"
        ></div>

        @if (related().length > 0) {
          <section class="mt-16" aria-labelledby="related-title">
            <h2 id="related-title" class="mb-6 text-2xl font-bold">{{ s.relatedArticles }}</h2>
            <ul class="grid grid-cols-1 gap-6 md:grid-cols-3">
              @for (item of related(); track item.slug) {
                <li>
                  <a
                    [routerLink]="articlePath(item.slug)"
                    class="card h-full cursor-pointer gap-0 p-6 transition-shadow outline-none hover:shadow-lg focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <span class="badge mb-2 capitalize">{{ item.category }}</span>
                    <h3 class="mb-2 line-clamp-2 font-semibold">{{ item.title }}</h3>
                    <p class="mb-4 line-clamp-2 text-sm text-muted-foreground">
                      {{ item.description }}
                    </p>
                    <span class="btn btn-ghost btn-sm mt-auto w-full">{{ s.readMore }}</span>
                  </a>
                </li>
              }
            </ul>
          </section>
        }
      </article>
    }
  `,
})
export class ArticlePage {
  /** Route parameter (bound via `withComponentInputBinding`). Unknown slugs never match the route. */
  readonly slug = input.required<string>();

  private readonly router = inject(Router);
  private readonly seo = inject(SeoService);

  protected readonly s = UK.knowledge;
  protected readonly ArrowLeft = ArrowLeft;
  protected readonly listPath = localePath('knowledge');

  protected readonly article = computed(() => getArticle(this.slug()));
  protected readonly html = computed(() => renderMarkdown(this.article()?.content ?? ''));
  protected readonly related = computed(() => getRelatedArticles(this.slug(), 3));
  protected readonly publishedAt = computed(() => {
    const article = this.article();
    return article ? dateFormat.format(new Date(article.publishedAt)) : '';
  });

  constructor() {
    // The component is reused when navigating between articles, so keep the metadata in sync.
    effect(() => {
      const article = this.article();
      if (!article) {
        return;
      }
      this.seo.setPage({
        title: article.title,
        description: article.description,
        keywords: article.keywords,
        path: localePath('knowledge', article.slug),
        type: 'article',
        publishedTime: article.publishedAt,
        modifiedTime: article.updatedAt ?? article.publishedAt,
      });
    });
  }

  protected articlePath(slug: string): string {
    return localePath('knowledge', slug);
  }

  /** Route internal links inside the rendered Markdown instead of reloading the page. */
  protected onContentClick(event: MouseEvent): void {
    const link = (event.target as Element | null)?.closest('a');
    const href = link?.getAttribute('href');
    if (
      !link ||
      !href?.startsWith('/') ||
      link.target === '_blank' ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    this.router.navigateByUrl(href);
  }
}
