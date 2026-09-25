import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { X } from 'lucide';
import { ConsentService } from '../core/consent.service';
import { localePath } from '../core/site';
import { Icon } from '../shared/icon';

@Component({
  selector: 'app-cookie-consent',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <section
        class="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 p-4 shadow-2xl backdrop-blur-md md:p-6"
        aria-labelledby="cookie-consent-title"
      >
        <div class="mx-auto max-w-7xl">
          <div class="flex flex-col items-start gap-4 md:flex-row md:items-center">
            <div class="flex-1">
              <div class="mb-2 flex items-start justify-between">
                <h2
                  id="cookie-consent-title"
                  class="flex items-center gap-2 text-lg font-semibold text-primary"
                >
                  <span aria-hidden="true">🍪</span> Ми використовуємо cookies
                </h2>
                <button
                  type="button"
                  class="btn btn-ghost btn-icon -mt-1 md:hidden"
                  aria-label="Закрити"
                  (click)="close()"
                >
                  <svg [appIcon]="X" class="size-5"></svg>
                </button>
              </div>

              <p class="mb-3 text-sm leading-relaxed text-muted-foreground">
                Цей веб-сайт використовує cookies для забезпечення найкращого досвіду користувача.
                Cookies допомагають нам зберігати ваші налаштування (мова, тема) та аналізувати
                використання сайту. Ми НЕ використовуємо рекламні або маркетингові cookies. Всі
                податкові дані обробляються локально у вашому браузері та НЕ передаються на наші
                сервери.
              </p>

              <ul class="mb-3 space-y-1 text-xs text-muted-foreground">
                <li>
                  <span aria-hidden="true">✅ </span>Обов'язкові cookies: Зберігають налаштування
                  сайту (мова, тема)
                </li>
                <li>
                  <span aria-hidden="true">❌ </span>Аналітичні cookies: Google Analytics і
                  Microsoft Clarity — вмикаються лише після вашої згоди
                </li>
                <li>
                  <span aria-hidden="true">❌ </span>Маркетингові cookies: НЕ використовуються
                </li>
              </ul>

              <p class="mb-2 text-xs text-muted-foreground italic">
                Згідно з GDPR (EU 2016/679) ви маєте право контролювати використання cookies. Ви
                можете змінити свої налаштування у будь-який час.
              </p>

              <a
                [routerLink]="privacyPath"
                class="inline-block text-xs text-primary hover:underline"
              >
                Детальніше про політику конфіденційності <span aria-hidden="true">→</span>
              </a>
            </div>

            <div class="flex w-full flex-col gap-2 sm:flex-row md:w-auto">
              <button
                type="button"
                class="btn btn-primary btn-sm w-full sm:w-auto"
                (click)="choose('accepted')"
              >
                Прийняти всі
              </button>
              <button
                type="button"
                class="btn btn-outline btn-sm w-full sm:w-auto"
                (click)="choose('rejected')"
              >
                Відхилити необов'язкові
              </button>
            </div>
          </div>
        </div>
      </section>
    }
  `,
})
export class CookieConsent {
  private readonly consent = inject(ConsentService);

  protected readonly visible = signal(false);
  protected readonly privacyPath = localePath('privacy');
  protected readonly X = X;

  constructor() {
    const destroyRef = inject(DestroyRef);

    // Browser only: show the banner until the user has made an explicit choice.
    afterNextRender(() => {
      if (this.consent.consent() !== null) {
        return;
      }
      const timer = setTimeout(() => this.visible.set(true), 1000);
      destroyRef.onDestroy(() => clearTimeout(timer));
    });
  }

  protected choose(value: 'accepted' | 'rejected'): void {
    this.consent.set(value);
    this.visible.set(false);
  }

  /** Dismissing without choosing is not consent: nothing is stored and analytics stays off. */
  protected close(): void {
    this.visible.set(false);
  }
}
