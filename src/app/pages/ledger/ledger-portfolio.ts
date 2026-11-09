import { ChangeDetectionStrategy, Component, computed, input, resource } from '@angular/core';
import { AlertCircle, RefreshCw } from 'lucide';
import { UK } from '../../core/i18n';
import { fetchMarketPrices } from '../../lib/crypto-prices';
import type { LedgerAnalysis, LedgerOperation } from '../../lib/ledger-csv';
import {
  currentHoldings,
  heldTickers,
  negativeBalances,
  portfolioHistory,
} from '../../lib/ledger-portfolio';
import { Icon } from '../../shared/icon';
import { ChartSeries } from '../calculator/chart-utils';
import { LineChart } from '../calculator/line-chart';
import { LedgerFormatters } from './format';

/** Current holdings at market prices and the portfolio value after each transaction. */
@Component({
  selector: 'app-ledger-portfolio',
  imports: [Icon, LineChart],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block space-y-6' },
  template: `
    @let f = format();
    @let p = portfolio();

    @if (negative().length > 0) {
      <div class="alert" role="note">
        <svg [appIcon]="icons.AlertCircle" class="size-4"></svg>
        <p>{{ s.negative.replace('{tickers}', negative().join(', ')) }}</p>
      </div>
    }

    <div class="card">
      <div class="card-header">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="space-y-1.5">
            <h2 class="card-title">{{ s.portfolioTitle }}</h2>
            <p class="card-description">{{ s.portfolioDescription }}</p>
          </div>
          <button
            type="button"
            class="btn btn-outline btn-sm"
            [disabled]="market.isLoading()"
            (click)="market.reload()"
          >
            <svg [appIcon]="icons.RefreshCw" class="size-4"></svg>
            {{ s.refresh }}
          </button>
        </div>
        <p class="text-sm text-muted-foreground" aria-live="polite">
          @if (market.isLoading()) {
            {{ s.pricesLoading }}
          } @else if (market.error()) {
            <span class="text-destructive">{{ s.pricesFailed }}</span>
          } @else if (market.hasValue()) {
            {{ s.pricesFrom.replace('{time}', f.time(market.value().time)) }}
          }
        </p>
      </div>
      <div class="card-content space-y-6">
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div class="rounded-lg bg-muted/50 p-4">
            <p class="text-sm text-muted-foreground">{{ s.valueNow }}</p>
            <p class="text-2xl font-semibold tabular-nums">{{ f.money(p.value) }}</p>
          </div>
          <div class="rounded-lg bg-muted/50 p-4">
            <p class="text-sm text-muted-foreground">{{ s.invested }}</p>
            <p class="text-2xl font-semibold tabular-nums">{{ f.money(p.invested) }}</p>
            <p class="text-sm text-muted-foreground">{{ s.investedHint }}</p>
          </div>
          <div class="rounded-lg bg-muted/50 p-4">
            <p class="text-sm text-muted-foreground">{{ s.result }}</p>
            <p
              class="text-2xl font-semibold tabular-nums"
              [class.text-destructive]="p.result < -0.005"
              [class.text-primary]="p.result > 0.005"
            >
              {{ f.money(p.result) }}
            </p>
            @if (p.invested > 0) {
              <p class="text-sm text-muted-foreground">
                {{ f.signedPercent((p.result / p.invested) * 100) }}
              </p>
            }
          </div>
        </div>

        @if (holdings().length === 0) {
          <p class="text-sm text-muted-foreground">{{ s.noHoldings }}</p>
        } @else {
          <div
            class="overflow-x-auto rounded-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            tabindex="0"
            role="region"
            [attr.aria-label]="s.portfolioTitle"
          >
            <table class="w-full text-sm tabular-nums">
              <thead>
                <tr class="border-b text-left text-muted-foreground">
                  <th scope="col" class="py-2 pr-4 font-medium">{{ s.asset }}</th>
                  <th scope="col" class="py-2 pr-4 text-right font-medium">{{ s.amount }}</th>
                  <th scope="col" class="py-2 pr-4 text-right font-medium">{{ s.price }}</th>
                  <th scope="col" class="py-2 pr-4 text-right font-medium">{{ s.change24h }}</th>
                  <th scope="col" class="py-2 pr-4 text-right font-medium">{{ s.value }}</th>
                  <th scope="col" class="py-2 text-right font-medium">{{ s.share }}</th>
                </tr>
              </thead>
              <tbody>
                @for (h of holdings(); track h.ticker) {
                  <tr class="border-b last:border-0">
                    <th scope="row" class="py-2 pr-4 text-left font-medium whitespace-nowrap">
                      {{ h.ticker }}
                      @if (h.source === 'export') {
                        <span class="badge ml-1 font-normal" [title]="s.priceFromFileHint">
                          {{ s.priceFromFile }}
                        </span>
                      }
                    </th>
                    <td class="py-2 pr-4 text-right">{{ f.amount(h.amount) }}</td>
                    <td class="py-2 pr-4 text-right whitespace-nowrap">
                      {{ h.price === null ? s.noPrice : f.money(h.price) }}
                    </td>
                    <td
                      class="py-2 pr-4 text-right whitespace-nowrap"
                      [class.text-destructive]="(h.change24h ?? 0) < -0.005"
                      [class.text-primary]="(h.change24h ?? 0) > 0.005"
                    >
                      {{ h.change24h === null ? '—' : f.signedPercent(h.change24h) }}
                    </td>
                    <td class="py-2 pr-4 text-right whitespace-nowrap">{{ f.money(h.value) }}</td>
                    <td class="py-2 text-right">
                      {{ p.value > 0 ? f.percent((h.value / p.value) * 100) : '—' }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    </div>

    @if (chart(); as c) {
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">{{ s.chartTitle }}</h2>
          <p class="card-description">{{ s.chartDescription }}</p>
        </div>
        <div class="card-content">
          <app-line-chart
            [labels]="c.labels"
            [series]="c.series"
            [label]="s.chartLabel"
            [format]="f.money"
            [axisFormat]="f.compactMoney"
            [fillBetween]="true"
            [detail]="c.detail"
          />
        </div>
      </div>
    }
  `,
})
export class LedgerPortfolio {
  readonly operations = input.required<readonly LedgerOperation[]>();
  readonly analysis = input.required<LedgerAnalysis>();
  readonly format = input.required<LedgerFormatters>();

  protected readonly s = UK.ledger;
  protected readonly icons = { AlertCircle, RefreshCw };

  /** Market prices of the assets still held; `time` is when they were fetched. */
  protected readonly market = resource({
    params: () => ({ tickers: heldTickers(this.operations()), fiat: this.analysis().fiat }),
    loader: async ({ params }) => ({
      prices: await fetchMarketPrices(params.tickers, params.fiat || 'USD'),
      time: Date.now(),
    }),
  });

  protected readonly negative = computed(() => negativeBalances(this.operations()));

  protected readonly holdings = computed(() =>
    currentHoldings(
      this.operations(),
      this.market.hasValue() ? this.market.value().prices : new Map(),
    ),
  );

  private readonly history = computed(() =>
    portfolioHistory(this.operations(), this.analysis().flows, this.analysis().swaps),
  );

  protected readonly portfolio = computed(() => {
    const value = this.holdings().reduce((sum, h) => sum + h.value, 0);
    const invested = this.history().at(-1)?.invested ?? 0;
    return { value, invested, result: value - invested };
  });

  protected readonly chart = computed(() => {
    const history = this.history();
    if (history.length < 2) {
      return null;
    }
    const f = this.format();
    const { value, invested } = this.portfolio();
    const points = [...history, { time: Number.NaN, value, invested }];
    const series: ChartSeries[] = [
      { label: this.s.value, color: 'var(--chart-1)', values: points.map((p) => p.value) },
      { label: this.s.invested, color: 'var(--chart-2)', values: points.map((p) => p.invested) },
    ];
    return {
      labels: points.map((p) => (Number.isNaN(p.time) ? this.s.now : f.shortDate(p.time))),
      series,
      detail: (i: number) => {
        const point = points[i];
        const when = Number.isNaN(point.time) ? '' : `${f.dateTime(point.time)} · `;
        return when + this.s.resultDetail.replace('{value}', f.money(point.value - point.invested));
      },
    };
  });
}
