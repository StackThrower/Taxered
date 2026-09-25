import { ChangeDetectionStrategy, Component, RESPONSE_INIT, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UK } from '../../core/i18n';
import { SeoService } from '../../core/seo.service';
import { localePath } from '../../core/site';

@Component({
  selector: 'app-not-found-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-2xl flex-col items-center px-4 py-24 text-center">
      <p class="mb-4 text-6xl font-bold text-primary" aria-hidden="true">404</p>
      <h1 class="mb-4 text-3xl font-bold">{{ s.title }}</h1>
      <p class="mb-8 text-muted-foreground">{{ s.description }}</p>
      <a [routerLink]="homePath" class="btn btn-primary btn-lg">{{ s.home }}</a>
    </div>
  `,
})
export class NotFoundPage {
  protected readonly s = UK.notFound;
  protected readonly homePath = localePath();

  constructor() {
    // Only provided during server rendering.
    const response = inject(RESPONSE_INIT, { optional: true });
    if (response) {
      response.status = 404;
    }

    inject(SeoService).setPage({
      title: UK.notFound.title,
      description: UK.notFound.description,
      path: localePath(),
      noindex: true,
    });
  }
}
