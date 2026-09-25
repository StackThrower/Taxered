import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { UK } from '../../core/i18n';
import { SeoService } from '../../core/seo.service';
import { LOCALE, SITE_URL, localePath } from '../../core/site';
import { FormsSection } from '../../declaration/forms-section';

const KEYWORDS = [
  'податкова декларація',
  'F0100214',
  'F0121214',
  'Ф1',
  'ПДФО',
  'військовий збір',
  'декларація про доходи',
  'майновий стан',
  'інвестиції',
  'податки Україна',
  'онлайн декларація',
];

@Component({
  selector: 'app-home-page',
  imports: [RouterLink, FormsSection],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="bg-gradient-to-b from-primary/10 to-background px-4 py-12 md:py-16 lg:py-20">
      <div class="mx-auto max-w-4xl space-y-6 text-center">
        <div class="space-y-4">
          <h1 class="text-3xl leading-tight font-bold text-balance md:text-4xl lg:text-5xl">
            {{ s.title }} <span class="text-primary">{{ s.highlight }}</span>
          </h1>
          <p class="mx-auto max-w-2xl px-4 text-base text-balance text-foreground/70 md:text-lg">
            {{ s.description }}
          </p>
        </div>
        <div class="flex flex-col justify-center gap-3 px-4 pt-4 sm:flex-row md:gap-4">
          <button
            type="button"
            class="btn btn-primary btn-lg w-full sm:w-auto"
            (click)="scrollToForms()"
          >
            {{ s.start }}
          </button>
          <a [routerLink]="aboutPath" class="btn btn-outline btn-lg w-full sm:w-auto">{{
            s.learn
          }}</a>
        </div>
      </div>
    </section>

    <app-forms-section />
  `,
})
export class HomePage {
  private readonly document = inject(DOCUMENT);
  private readonly seo = inject(SeoService);

  protected readonly s = UK.hero;
  protected readonly aboutPath = localePath('about');

  constructor() {
    // The site root (`/`) and `/uk-ua` render the same page with different metadata.
    this.setSeo(inject(ActivatedRoute).snapshot.data['root'] === true);
  }

  protected scrollToForms(): void {
    this.document.getElementById('forms')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private setSeo(root: boolean): void {
    const year = new Date().getFullYear();

    if (root) {
      this.seo.setPage({
        title: `Генератор декларації про майновий стан і доходи ${year} Україна`,
        description:
          '✨ Заповніть податкову декларацію про майновий стан та доходи легко і швидко! Безкоштовний онлайн сервіс для громадян України 🇺🇦 | Розрахунок ПДФО та військового збору | Ваші дані залишаються тільки у вас 🔒 | Експорт в PDF за 5 хвилин',
        keywords: [
          'податкова декларація україна',
          'F0100214 онлайн',
          'F0121214 безкоштовно',
          'ПДФО розрахунок',
          'військовий збір 2025',
          'декларація про доходи',
          'податки україна онлайн',
          'заповнити декларацію',
        ],
        path: '/',
        bareTitle: true,
        alternates: true,
      });
      return;
    }

    this.seo.setPage({
      title: `Генератор декларації про майновий стан та доходи ${year}`,
      description:
        'Заповніть податкову декларацію про майновий стан та доходи онлайн для розрахунку ПДФО та військового збору від інвестицій. Безкоштовний сервіс для громадян України.',
      keywords: KEYWORDS,
      path: localePath(),
      alternates: true,
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: 'Taxered - Податкові декларації',
          description:
            'Безкоштовна онлайн система для заповнення податкових декларацій F0100214 та F0121214. Всі дані обробляються локально в вашому браузері.',
          url: `${SITE_URL}/${LOCALE}`,
          applicationCategory: 'FinanceApplication',
          operatingSystem: 'Any',
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
          featureList: [
            'Заповнення декларації F0100214 онлайн',
            'Розрахунок податків F0121214 (Ф1)',
            'Експорт в PDF',
            'Всі дані залишаються у вас',
          ],
          aggregateRating: { '@type': 'AggregateRating', ratingValue: '5', ratingCount: '1' },
        },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/${LOCALE}` },
          ],
        },
      ],
    });
  }
}
