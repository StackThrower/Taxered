import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';
import { UK } from '../../core/i18n';
import {
  COUNTRIES,
  DATA_UPDATED,
  METRICS,
  RATE_BINS,
  flagOf,
  formatRate,
  getCountry,
  type Metric,
} from '../../lib/tax-data';
import { WorldMap } from '../../widgets/tax-map/world-map';
import type { TaxMapArtifact } from '../protocol';

const s = UK.taxMap;

/** World map of tax rates with the countries the agent discussed. */
@Component({
  selector: 'app-tax-map-view',
  imports: [WorldMap],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card min-w-0" [attr.aria-labelledby]="'tax-map-title-' + artifact().id">
      <div class="card-header">
        <h3 class="card-title" [id]="'tax-map-title-' + artifact().id">
          {{ s.regions[artifact().view] }} — {{ s.metrics[metric()] }}
        </h3>
        <p class="card-description">Ставки станом на {{ updated }}. {{ s.mapHint }}</p>
      </div>
      <div class="card-content space-y-4">
        <div
          role="group"
          [attr.aria-label]="s.metric"
          class="flex flex-wrap gap-1 rounded-lg bg-muted p-1"
        >
          @for (m of metrics; track m) {
            <button
              type="button"
              class="cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              [class]="
                metric() === m
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              "
              [attr.aria-pressed]="metric() === m"
              (click)="metric.set(m)"
            >
              {{ s.metrics[m] }}
            </button>
          }
        </div>

        <app-world-map
          [view]="artifact().view"
          [metric]="metric()"
          [selected]="selected()"
          [label]="mapLabel()"
          (selectedChange)="selected.set($event)"
        />

        <ul
          class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm"
          [attr.aria-label]="s.legend"
        >
          @for (bin of bins; track bin.label) {
            <li class="flex items-center gap-1.5 text-muted-foreground">
              <span
                aria-hidden="true"
                class="size-3.5 rounded-sm"
                [style.background]="bin.bg"
              ></span>
              {{ bin.label }}
            </li>
          }
        </ul>

        @if (country(); as c) {
          <div class="rounded-lg border p-4">
            <h4 class="flex items-center gap-2 font-semibold">
              <span aria-hidden="true">{{ flag(c.code) }}</span> {{ c.name }}
            </h4>
            <p class="mt-1 text-sm tabular-nums">
              {{ s.metrics.dividends }}: {{ rate(c.rates.dividends) }} ·
              {{ s.metrics.capitalGains }}: {{ rate(c.rates.capitalGains) }} ·
              {{ s.metrics.interest }}: {{ rate(c.rates.interest) }}
            </p>
            @if (c.regime) {
              <p class="mt-2 text-sm"><span aria-hidden="true">★</span> {{ c.regime }}</p>
            }
            <ul class="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              @for (note of c.notes; track note) {
                <li>{{ note }}</li>
              }
            </ul>
          </div>
        }

        @if (rows().length > 0) {
          <div
            class="overflow-x-auto rounded-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            tabindex="0"
            role="region"
            aria-label="Ставки обраних країн"
          >
            <table class="w-full text-sm tabular-nums">
              <thead>
                <tr class="border-b text-left text-muted-foreground">
                  <th scope="col" class="py-2 pr-4 font-medium">Країна</th>
                  @for (m of metrics; track m) {
                    <th scope="col" class="py-2 pr-4 text-right font-medium">{{ s.metrics[m] }}</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (c of rows(); track c.code) {
                  <tr class="border-b last:border-0">
                    <th scope="row" class="py-2 pr-4 text-left font-medium">
                      <button
                        type="button"
                        class="cursor-pointer underline-offset-4 outline-none hover:underline focus-visible:underline"
                        (click)="selected.set(c.code)"
                      >
                        <span aria-hidden="true">{{ flag(c.code) }}</span> {{ c.name }}
                      </button>
                    </th>
                    @for (m of metrics; track m) {
                      <td class="py-2 pr-4 text-right" [class.font-semibold]="m === metric()">
                        {{ rate(c.rates[m]) }}
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    </section>
  `,
})
export class TaxMapView {
  readonly artifact = input.required<TaxMapArtifact>();

  protected readonly s = s;
  protected readonly metrics = METRICS;
  protected readonly bins = RATE_BINS;
  protected readonly updated = DATA_UPDATED;
  protected readonly flag = flagOf;
  protected readonly rate = formatRate;

  protected readonly metric = linkedSignal<Metric>(() => this.artifact().metric);
  protected readonly selected = linkedSignal<string | null>(() => this.artifact().selected);

  protected readonly country = computed(() => {
    const code = this.selected();
    return code ? getCountry(code) : undefined;
  });
  protected readonly rows = computed(() =>
    this.artifact().highlight.flatMap((code) => COUNTRIES.filter((c) => c.code === code)),
  );
  protected readonly mapLabel = computed(() =>
    s.mapLabel
      .replace('{region}', s.regions[this.artifact().view])
      .replace('{metric}', s.metrics[this.metric()]),
  );
}
