import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Calculator, Code, DollarSign, Languages, Lightbulb, Mail, Shield, Target } from 'lucide';
import { UK } from '../../core/i18n';
import { SeoService } from '../../core/seo.service';
import { CONTACT_EMAIL, SITE_URL, localePath } from '../../core/site';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-about-page',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="px-4 py-12 md:py-16">
      <div class="mx-auto max-w-5xl">
        <div class="mb-8 text-center md:mb-12">
          <h1 class="mb-3 text-3xl font-bold md:mb-4 md:text-4xl">{{ s.title }}</h1>
          <p class="mb-2 text-lg text-muted-foreground md:text-xl">{{ s.subtitle }}</p>
          <p class="mx-auto max-w-3xl px-4 text-sm text-muted-foreground md:text-base">
            {{ s.intro }}
          </p>
        </div>

        <div class="space-y-6 md:space-y-8">
          <div class="card">
            <div class="card-header">
              <h2 class="card-title flex items-center gap-2 text-xl md:text-2xl">
                <svg [appIcon]="icons.Target" class="size-6 text-primary"></svg>
                {{ s.missionTitle }}
              </h2>
            </div>
            <div class="card-content">
              <p class="text-sm leading-relaxed text-muted-foreground md:text-base">
                {{ s.missionDescription }}
              </p>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <h2 class="card-title flex items-center gap-2 text-xl md:text-2xl">
                <svg [appIcon]="icons.Lightbulb" class="size-6 text-primary"></svg>
                {{ s.featuresTitle }}
              </h2>
            </div>
            <div class="card-content">
              <ul class="grid grid-cols-1 gap-4 md:grid-cols-2">
                @for (feature of features; track feature.title) {
                  <li class="flex items-start gap-3 rounded-lg bg-muted/50 p-3">
                    <span
                      class="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10"
                    >
                      <svg [appIcon]="feature.icon" class="size-4 text-primary"></svg>
                    </span>
                    <p class="flex-1 text-sm md:text-base">{{ feature.title }}</p>
                  </li>
                }
              </ul>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <h2 class="card-title flex items-center gap-2 text-xl md:text-2xl">
                <svg [appIcon]="icons.Code" class="size-6 text-primary"></svg>
                {{ s.technologyTitle }}
              </h2>
            </div>
            <div class="card-content">
              <p class="text-sm leading-relaxed text-muted-foreground md:text-base">
                {{ s.technologyDescription }}
              </p>
            </div>
          </div>

          <div class="card bg-muted/50">
            <div class="card-header">
              <h2 class="card-title flex items-center gap-2 text-xl md:text-2xl">
                <svg [appIcon]="icons.Mail" class="size-6 text-primary"></svg>
                {{ s.contactTitle }}
              </h2>
            </div>
            <div class="card-content space-y-3">
              <p class="text-sm text-muted-foreground md:text-base">{{ s.contactDescription }}</p>
              <p class="flex items-center gap-2 text-sm md:text-base">
                <svg [appIcon]="icons.Mail" class="size-4 text-muted-foreground"></svg>
                <a [href]="'mailto:' + email" class="break-all text-primary hover:underline">{{
                  email
                }}</a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  `,
})
export class AboutPage {
  protected readonly s = UK.about;
  protected readonly email = CONTACT_EMAIL;
  protected readonly icons = { Code, Lightbulb, Mail, Target };
  protected readonly features = [
    { icon: Shield, title: UK.about.features.privacy },
    { icon: DollarSign, title: UK.about.features.free },
    { icon: Languages, title: UK.about.features.multilang },
    { icon: Calculator, title: UK.about.features.calculator },
  ];

  constructor() {
    const url = `${SITE_URL}${localePath('about')}`;
    inject(SeoService).setPage({
      title: `Про Taxered - Безкоштовна система податкових декларацій України ${new Date().getFullYear()}`,
      description:
        'Taxered - це безкоштовна відкрита онлайн система для заповнення податкових декларацій F0100214 та F0121214. Ми створюємо доступні інструменти для громадян України. Ваші дані залишаються тільки у вас.',
      keywords: [
        'про Taxered',
        'безкоштовні податкові декларації',
        'відкрита система',
        'про нас',
        'місія',
        'цінності',
        'приватність даних',
        'безпека',
        'F0100214',
        'F0121214',
        'Україна',
      ],
      path: localePath('about'),
      alternates: true,
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: UK.about.title,
          description: UK.about.intro,
          url,
          inLanguage: 'uk',
          isPartOf: { '@type': 'WebSite', name: 'Taxered Tax Declaration', url: SITE_URL },
        },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}${localePath()}` },
            { '@type': 'ListItem', position: 2, name: UK.about.title, item: url },
          ],
        },
      ],
    });
  }
}
