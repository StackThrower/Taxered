import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  ChevronDown,
  Download,
  FileText,
  HelpCircle,
  MessageSquare,
  Shield,
  SquarePen,
} from 'lucide';
import type { IconNode } from 'lucide';
import { UK } from '../../core/i18n';
import { SeoService } from '../../core/seo.service';
import { SITE_URL, localePath } from '../../core/site';
import { Icon } from '../../shared/icon';

const ITEM_ICONS: Record<string, IconNode> = {
  'getting-started': HelpCircle,
  forms: FileText,
  filling: SquarePen,
  export: Download,
  privacy: Shield,
  support: MessageSquare,
};

@Component({
  selector: 'app-help-page',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="px-4 py-12 md:py-16">
      <div class="mx-auto max-w-4xl">
        <div class="mb-8 text-center md:mb-12">
          <h1 class="mb-3 text-3xl font-bold md:mb-4 md:text-4xl">{{ s.title }}</h1>
          <p class="mb-2 text-lg text-muted-foreground md:text-xl">{{ s.subtitle }}</p>
          <p class="px-4 text-sm text-muted-foreground md:text-base">{{ s.intro }}</p>
        </div>

        <div class="w-full space-y-3 md:space-y-4">
          @for (item of items; track item.id) {
            @let open = openId() === item.id;
            <div class="rounded-lg border">
              <h2>
                <button
                  type="button"
                  class="flex w-full cursor-pointer items-center justify-between gap-4 rounded-lg px-4 py-4 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:px-6"
                  [id]="'help-trigger-' + item.id"
                  [attr.aria-expanded]="open"
                  [attr.aria-controls]="'help-panel-' + item.id"
                  (click)="toggle(item.id)"
                >
                  <span class="flex items-start gap-3 md:items-center md:gap-4">
                    <span
                      class="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 md:size-10"
                    >
                      <svg [appIcon]="item.icon" class="size-4 text-primary md:size-5"></svg>
                    </span>
                    <span class="min-w-0">
                      <span class="block text-base font-semibold md:text-lg">{{ item.title }}</span>
                      <span class="mt-0.5 block text-xs text-muted-foreground md:text-sm">{{
                        item.description
                      }}</span>
                    </span>
                  </span>
                  <svg
                    [appIcon]="chevron"
                    class="size-4 text-muted-foreground transition-transform motion-reduce:transition-none"
                    [class.rotate-180]="open"
                  ></svg>
                </button>
              </h2>
              <div
                role="region"
                class="px-4 pb-4 md:px-6 md:pb-6"
                [id]="'help-panel-' + item.id"
                [attr.aria-labelledby]="'help-trigger-' + item.id"
                [hidden]="!open"
              >
                <p class="pl-11 text-sm text-muted-foreground md:pl-14 md:text-base">
                  {{ item.content }}
                </p>
              </div>
            </div>
          }
        </div>

        <div class="card mt-8 bg-muted/50 md:mt-12">
          <div class="card-header space-y-2">
            <h2 class="card-title flex items-center gap-2 text-lg md:text-xl">
              <svg [appIcon]="support" class="size-5"></svg>
              {{ supportItem.title }}
            </h2>
            <p class="card-description">{{ supportItem.description }}</p>
          </div>
          <div class="card-content">
            <p class="text-muted-foreground">{{ supportItem.content }}</p>
          </div>
        </div>
      </div>
    </section>
  `,
})
export class HelpPage {
  protected readonly s = UK.help;
  protected readonly items = UK.help.items.map((item) => ({ ...item, icon: ITEM_ICONS[item.id] }));
  protected readonly supportItem = UK.help.items[UK.help.items.length - 1];
  protected readonly support = MessageSquare;
  protected readonly chevron = ChevronDown;

  /** Single-open, collapsible accordion. */
  protected readonly openId = signal<string | null>(null);

  constructor() {
    const url = `${SITE_URL}${localePath('help')}`;
    inject(SeoService).setPage({
      title: `Допомога - Центр підтримки Taxered | Податкові декларації України ${new Date().getFullYear()}`,
      description:
        'Знайдіть відповіді на питання про заповнення податкових декларацій F0100214 та F0121214. Інструкції, поради та підтримка для заповнення податкових форм онлайн. Безкоштовна допомога українською мовою.',
      keywords: [
        'допомога',
        'інструкції',
        'підтримка',
        'податкова декларація',
        'F0100214',
        'F0121214',
        'як заповнити декларацію',
        'заповнення форм',
        'FAQ',
        'часті питання',
        'центр допомоги',
        'податки Україна',
      ],
      path: localePath('help'),
      alternates: true,
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: UK.help.items.map((item) => ({
            '@type': 'Question',
            name: item.title,
            acceptedAnswer: { '@type': 'Answer', text: item.content },
          })),
        },
        {
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: UK.help.title,
          description: UK.help.intro,
          url,
          inLanguage: 'uk',
          isPartOf: { '@type': 'WebSite', name: 'Taxered Tax Declaration', url: SITE_URL },
        },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}${localePath()}` },
            { '@type': 'ListItem', position: 2, name: UK.help.title, item: url },
          ],
        },
      ],
    });
  }

  protected toggle(id: string): void {
    this.openId.update((current) => (current === id ? null : id));
  }
}
