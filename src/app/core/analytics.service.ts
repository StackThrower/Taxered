import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, effect, inject } from '@angular/core';
import { ConsentService } from './consent.service';

const GA_MEASUREMENT_ID = 'G-5GSSKMXMQE';
const CLARITY_PROJECT_ID = 'ul1ye4h69b';

type Command = (...args: unknown[]) => void;

interface AnalyticsWindow {
  dataLayer?: unknown[];
  gtag?: Command;
  clarity?: Command & { q?: unknown[] };
}

/**
 * Loads Google Analytics and Microsoft Clarity once the user accepts cookies,
 * and tells both vendors to stop collecting if consent is later withdrawn
 * (e.g. in another tab). A reload is still needed to unload the scripts.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly document = inject(DOCUMENT);
  private readonly consent = inject(ConsentService);
  private loaded = false;

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) {
      return;
    }

    effect(() => {
      const consent = this.consent.consent();
      if (consent === 'accepted') {
        this.load();
      } else if (consent === 'rejected' && this.loaded) {
        this.revoke();
      }
    });
  }

  private load(): void {
    if (this.loaded) {
      return;
    }
    this.loaded = true;

    const w = this.document.defaultView as (Window & AnalyticsWindow) | null;
    if (!w) {
      return;
    }

    // Google Analytics (gtag.js). gtag must push the `arguments` object itself.
    w.dataLayer = w.dataLayer || [];
    w.gtag = function gtag() {
      w.dataLayer!.push(arguments);
    };
    w.gtag('js', new Date());
    w.gtag('consent', 'default', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'granted',
    });
    w.gtag('config', GA_MEASUREMENT_ID, { anonymize_ip: true });
    this.appendScript(`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`);

    // Microsoft Clarity: queue calls until the tag has loaded.
    const clarity: Command & { q?: unknown[] } = (...args: unknown[]) => {
      (clarity.q = clarity.q || []).push(args);
    };
    w.clarity = w.clarity || clarity;
    this.appendScript(`https://www.clarity.ms/tag/${CLARITY_PROJECT_ID}`);
    // Only reached once the user accepted the banner.
    w.clarity('consent');
  }

  private revoke(): void {
    const w = this.document.defaultView as (Window & AnalyticsWindow) | null;
    w?.gtag?.('consent', 'update', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
    });
    w?.clarity?.('stop');
  }

  private appendScript(src: string): void {
    const script = this.document.createElement('script');
    script.async = true;
    script.src = src;
    this.document.head.appendChild(script);
  }
}
