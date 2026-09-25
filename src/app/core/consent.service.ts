import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { DestroyRef, Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

export type ConsentValue = 'accepted' | 'rejected';

const CONSENT_STORAGE_KEY = 'cookieConsent';
const CONSENT_DATE_STORAGE_KEY = 'cookieConsentDate';

/**
 * Cookie-consent state shared between the banner and the analytics loader.
 *
 * Analytics (Google Analytics + Microsoft Clarity) must not load until the user
 * has explicitly accepted. When localStorage is unavailable (Safari private
 * mode, cookies blocked) the choice is kept in memory for the page session only,
 * so the banner comes back on the next visit.
 */
@Injectable({ providedIn: 'root' })
export class ConsentService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly state = signal<ConsentValue | null>(null);
  readonly consent = this.state.asReadonly();

  constructor() {
    if (!this.isBrowser) {
      return;
    }

    this.state.set(readStoredConsent());

    // Honour a choice made in another tab.
    const window = inject(DOCUMENT).defaultView;
    const onStorage = (event: StorageEvent) => {
      if (event.key === CONSENT_STORAGE_KEY) {
        this.state.set(readStoredConsent());
      }
    };
    window?.addEventListener('storage', onStorage);
    inject(DestroyRef).onDestroy(() => window?.removeEventListener('storage', onStorage));
  }

  set(value: ConsentValue): void {
    this.state.set(value);
    try {
      localStorage.setItem(CONSENT_STORAGE_KEY, value);
      localStorage.setItem(CONSENT_DATE_STORAGE_KEY, new Date().toISOString());
    } catch {
      // Storage unavailable — the signal above keeps the choice for this page session.
    }
  }
}

function readStoredConsent(): ConsentValue | null {
  try {
    const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
    return stored === 'accepted' || stored === 'rejected' ? stored : null;
  } catch {
    return null;
  }
}
