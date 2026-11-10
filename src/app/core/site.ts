/** Public origin of the production site. Used for canonical URLs, sitemap and JSON-LD. */
export const SITE_URL = 'https://taxered.stackthrow.com';

/** The project is Ukrainian-only: every localized route lives under this prefix. */
export const LOCALE = 'uk-ua';

export const SITE_NAME = 'Taxered Tax Declaration';

/** The home page (the chat assistant) lives at the site root; `/uk-ua` redirects here. */
export const HOME_PATH = '/';

/** Absolute app path for a page under the locale prefix, e.g. `localePath('help')` → `/uk-ua/help`. */
export function localePath(...segments: string[]): string {
  return ['', LOCALE, ...segments].join('/');
}
