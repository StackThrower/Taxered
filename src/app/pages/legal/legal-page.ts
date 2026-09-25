import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SeoService } from '../../core/seo.service';
import { localePath } from '../../core/site';
import { LegalDocument, PRIVACY, TERMS } from './legal-content';

const DOCUMENTS: Record<string, LegalDocument> = { privacy: PRIVACY, terms: TERMS };

/** Privacy policy and terms of use; the document is chosen by the route's `document` data. */
@Component({
  selector: 'app-legal-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-4xl px-4 py-12 md:py-16">
      <h1 class="mb-4 text-3xl font-bold text-primary md:text-4xl">{{ doc.title }}</h1>
      <p class="mb-8 text-sm text-muted-foreground">{{ doc.lastUpdated }}</p>

      @for (section of doc.sections; track section.heading) {
        <section class="mb-8">
          <h2 class="mb-4 text-xl font-semibold text-primary md:text-2xl">{{ section.heading }}</h2>
          @for (paragraph of section.content; track $index) {
            <p class="mb-4 leading-relaxed text-muted-foreground">{{ paragraph }}</p>
          }
        </section>
      }
    </div>
  `,
})
export class LegalPage {
  protected readonly doc: LegalDocument;

  constructor() {
    const key: string = inject(ActivatedRoute).snapshot.data['document'];
    this.doc = DOCUMENTS[key];

    inject(SeoService).setPage({
      title: this.doc.title,
      description: this.doc.description,
      path: localePath(key),
      alternates: true,
    });
  }
}
