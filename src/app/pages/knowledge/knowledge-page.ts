import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ArrowRight, BookOpen, Clock } from 'lucide';
import { UK } from '../../core/i18n';
import { SeoService } from '../../core/seo.service';
import { localePath } from '../../core/site';
import { Icon } from '../../shared/icon';
import { getArticles } from './articles';

@Component({
  selector: 'app-knowledge-page',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="container mx-auto max-w-6xl px-4 py-12">
      <div class="mb-12 text-center">
        <p
          class="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-primary"
        >
          <svg [appIcon]="icons.BookOpen" class="size-4"></svg>
          <span class="text-sm font-medium">{{ s.base }}</span>
        </p>
        <h1 class="mb-4 text-4xl font-bold md:text-5xl">{{ s.title }}</h1>
        <p class="mx-auto max-w-2xl text-xl text-muted-foreground">{{ s.description }}</p>
      </div>

      @if (articles.length === 0) {
        <div class="card py-12 text-center">
          <div class="card-content">
            <svg
              [appIcon]="icons.BookOpen"
              class="mx-auto mb-4 size-16 text-muted-foreground"
            ></svg>
            <h2 class="mb-2 text-xl font-semibold">{{ s.noArticles }}</h2>
            <p class="text-muted-foreground">{{ s.working }}</p>
          </div>
        </div>
      } @else {
        <ul class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          @for (article of articles; track article.slug) {
            <li>
              <a
                [routerLink]="articlePath(article.slug)"
                class="card group h-full cursor-pointer transition-shadow outline-none hover:shadow-lg focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <div class="card-header">
                  <div class="mb-2 flex items-start justify-between gap-2">
                    <span class="badge capitalize">{{ article.category }}</span>
                    <span class="flex items-center text-xs text-muted-foreground">
                      <svg [appIcon]="icons.Clock" class="mr-1 size-3"></svg>
                      {{ article.readTime }}
                    </span>
                  </div>
                  <h2 class="card-title text-xl transition-colors group-hover:text-primary">
                    {{ article.title }}
                  </h2>
                  <p class="card-description line-clamp-2">{{ article.description }}</p>
                </div>
                <div class="card-content mt-auto">
                  <span
                    class="btn btn-sm w-full justify-between transition-colors group-hover:bg-primary group-hover:text-primary-foreground"
                  >
                    {{ s.readMore }}
                    <svg
                      [appIcon]="icons.ArrowRight"
                      class="ml-2 size-4 transition-transform group-hover:translate-x-1 motion-reduce:transition-none"
                    ></svg>
                  </span>
                </div>
              </a>
            </li>
          }
        </ul>

        <section class="mt-16 max-w-none">
          <h2 class="mb-4 text-2xl font-bold">{{ s.aboutTitle }}</h2>
          <p class="text-muted-foreground">{{ s.aboutText }}</p>
        </section>
      }
    </div>
  `,
})
export class KnowledgePage {
  protected readonly s = UK.knowledge;
  protected readonly articles = getArticles();
  protected readonly icons = { ArrowRight, BookOpen, Clock };

  constructor() {
    inject(SeoService).setPage({
      title: UK.knowledge.title,
      description: UK.knowledge.description,
      path: localePath('knowledge'),
      alternates: true,
    });
  }

  protected articlePath(slug: string): string {
    return localePath('knowledge', slug);
  }
}
