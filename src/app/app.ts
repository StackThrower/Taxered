import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, skip } from 'rxjs';
import { AnalyticsService } from './core/analytics.service';
import { CookieConsent } from './layout/cookie-consent';
import { Footer } from './layout/footer';
import { Header } from './layout/header';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header, Footer, CookieConsent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-header />
    <main id="main" tabindex="-1" class="min-h-screen bg-background outline-none">
      <router-outlet />
    </main>
    <app-footer />
    <app-cookie-consent />
  `,
})
export class App {
  constructor() {
    // Loads analytics once the user consents to cookies.
    inject(AnalyticsService);

    // After client-side navigation move focus to the new page's content so
    // screen-reader and keyboard users don't stay on the link they activated.
    const document = inject(DOCUMENT);
    inject(Router)
      .events.pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        skip(1),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        if (!event.urlAfterRedirects.includes('#')) {
          document.getElementById('main')?.focus({ preventScroll: true });
        }
      });
  }
}
