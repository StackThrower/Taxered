import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  DestroyRef,
  Injectable,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'theme';

/**
 * Light/dark theme with a "system" default. The initial class is applied by the
 * inline script in index.html before first paint; this service keeps it in sync
 * afterwards. Stored values are compatible with the previous next-themes setup.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly preference = signal<ThemePreference>('system');
  private readonly systemPrefersDark = signal(false);

  readonly resolved = computed<'light' | 'dark'>(() => {
    const preference = this.preference();
    if (preference === 'system') {
      return this.systemPrefersDark() ? 'dark' : 'light';
    }
    return preference;
  });

  constructor() {
    if (!this.isBrowser) {
      return;
    }

    this.preference.set(readStoredPreference());

    const view = this.document.defaultView;
    const media = view?.matchMedia ? view.matchMedia('(prefers-color-scheme: dark)') : undefined;
    if (media) {
      this.systemPrefersDark.set(media.matches);
      const onChange = (event: MediaQueryListEvent) => this.systemPrefersDark.set(event.matches);
      media.addEventListener('change', onChange);
      inject(DestroyRef).onDestroy(() => media.removeEventListener('change', onChange));
    }

    effect(() => {
      this.document.documentElement.classList.toggle('dark', this.resolved() === 'dark');
    });
  }

  toggle(): void {
    const next = this.resolved() === 'dark' ? 'light' : 'dark';
    this.preference.set(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage unavailable (private mode) — the choice still applies to this page view.
    }
  }
}

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}
