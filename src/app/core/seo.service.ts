import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { SITE_URL } from './site';

export interface PageSeo {
  /** Page title; ` | Taxered` is appended to the document title unless `bareTitle` is set. */
  title: string;
  bareTitle?: boolean;
  description: string;
  /** Absolute path of the canonical URL, e.g. `/uk-ua/help`. `/` means the site root. */
  path: string;
  keywords?: readonly string[];
  type?: 'website' | 'article';
  publishedTime?: string;
  modifiedTime?: string;
  /** Page-specific schema.org objects; site-wide ones live in index.html. */
  jsonLd?: readonly object[];
  /** Adds `<link rel="alternate" hreflang>` entries (uk-UA + x-default). */
  alternates?: boolean;
  noindex?: boolean;
}

const TITLE_SUFFIX = ' | Taxered';
const OG_IMAGE = `${SITE_URL}/placeholder-logo.png`;
const ROBOTS = 'index, follow, max-video-preview:-1, max-image-preview:large, max-snippet:-1';

/** Sets title, meta tags, canonical/alternate links and JSON-LD for the current page. */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly document = inject(DOCUMENT);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);

  setPage(page: PageSeo): void {
    const url = page.path === '/' ? SITE_URL : `${SITE_URL}${page.path}`;

    const addSuffix = !page.bareTitle && !page.title.endsWith(TITLE_SUFFIX);
    this.title.setTitle(addSuffix ? page.title + TITLE_SUFFIX : page.title);
    this.setName('description', page.description);
    this.setName('robots', page.noindex ? 'noindex, follow' : ROBOTS);

    if (page.keywords?.length) {
      this.setName('keywords', page.keywords.join(', '));
    } else {
      this.meta.removeTag('name="keywords"');
    }

    this.setProperty('og:type', page.type ?? 'website');
    this.setProperty('og:locale', 'uk_UA');
    this.setProperty('og:url', url);
    this.setProperty('og:title', page.title);
    this.setProperty('og:description', page.description);
    this.setProperty('og:image', OG_IMAGE);
    this.setProperty('og:image:width', '1200');
    this.setProperty('og:image:height', '630');
    this.setProperty('og:image:alt', page.title);
    this.setOptionalProperty('article:published_time', page.publishedTime);
    this.setOptionalProperty('article:modified_time', page.modifiedTime);

    this.setName('twitter:title', page.title);
    this.setName('twitter:description', page.description);
    this.setName('twitter:image', OG_IMAGE);

    this.setLinks(url, page.alternates ?? false, page.path);
    this.setJsonLd(page.jsonLd ?? []);
  }

  private setName(name: string, content: string): void {
    this.meta.updateTag({ name, content });
  }

  private setProperty(property: string, content: string): void {
    this.meta.updateTag({ property, content });
  }

  private setOptionalProperty(property: string, content: string | undefined): void {
    if (content) {
      this.setProperty(property, content);
    } else {
      this.meta.removeTag(`property="${property}"`);
    }
  }

  private setLinks(canonicalUrl: string, alternates: boolean, path: string): void {
    const head = this.document.head;
    head.querySelectorAll('link[data-seo]').forEach((link) => link.remove());

    const links: Record<string, string>[] = [{ rel: 'canonical', href: canonicalUrl }];
    if (alternates) {
      links.push(
        { rel: 'alternate', hreflang: 'x-default', href: SITE_URL },
        {
          rel: 'alternate',
          hreflang: 'uk-UA',
          href: `${SITE_URL}${path === '/' ? '/uk-ua' : path}`,
        },
      );
    }

    for (const attributes of links) {
      const link = this.document.createElement('link');
      link.setAttribute('data-seo', '');
      for (const [name, value] of Object.entries(attributes)) {
        link.setAttribute(name, value);
      }
      head.appendChild(link);
    }
  }

  private setJsonLd(schemas: readonly object[]): void {
    const head = this.document.head;
    head.querySelectorAll('script[data-seo]').forEach((script) => script.remove());

    for (const schema of schemas) {
      const script = this.document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-seo', '');
      // `<` is escaped so page content can never close the script element.
      script.textContent = JSON.stringify(schema).replace(/</g, '\\u003c');
      head.appendChild(script);
    }
  }
}
