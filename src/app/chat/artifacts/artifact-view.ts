import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { ChatArtifact } from '../protocol';
import { ChartView } from './chart-view';
import { F1View } from './f1-view';
import { FileView } from './file-view';
import { LedgerView } from './ledger-view';
import { ReturnsView } from './returns-view';
import { SpreadsView } from './spreads-view';
import { TaxMapView } from './tax-map-view';

/**
 * Renders what a sub-agent produced. The heavy widgets (forms, charts, maps) are deferred so
 * the chat page itself stays small; they load when the first such answer arrives.
 */
@Component({
  selector: 'app-artifact-view',
  imports: [ChartView, F1View, FileView, LedgerView, ReturnsView, SpreadsView, TaxMapView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let a = artifact();
    @switch (a.kind) {
      @case ('file') {
        <app-file-view [artifact]="a" />
      }
      @case ('f1') {
        @defer {
          <app-f1-view [artifact]="a" />
        } @placeholder {
          <p class="text-sm text-muted-foreground">Завантаження форми Ф1…</p>
        }
      }
      @case ('returns') {
        @defer {
          <app-returns-view [artifact]="a" />
        } @placeholder {
          <p class="text-sm text-muted-foreground">Завантаження графіків…</p>
        }
      }
      @case ('tax-map') {
        @defer {
          <app-tax-map-view [artifact]="a" />
        } @placeholder {
          <p class="text-sm text-muted-foreground">Завантаження карти…</p>
        }
      }
      @case ('spreads') {
        @defer {
          <app-spreads-view [artifact]="a" />
        } @placeholder {
          <p class="text-sm text-muted-foreground">Завантаження таблиць…</p>
        }
      }
      @case ('ledger') {
        @defer {
          <app-ledger-view [artifact]="a" />
        } @placeholder {
          <p class="text-sm text-muted-foreground">Завантаження портфеля…</p>
        }
      }
      @case ('chart') {
        @defer {
          <app-chart-view [artifact]="a" />
        } @placeholder {
          <p class="text-sm text-muted-foreground">Завантаження графіка…</p>
        }
      }
    }
  `,
})
export class ArtifactView {
  readonly artifact = input.required<ChatArtifact>();
}
