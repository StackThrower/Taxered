import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { AlertCircle, RefreshCw } from 'lucide';
import { UK } from '../../core/i18n';
import { supportsLivePrices, watchLivePrices } from '../../lib/binance-ticker';
import { MarketPrice, fetchMarketPrices } from '../../lib/crypto-prices';
import type { LedgerAnalysis, LedgerOperation } from '../../lib/ledger-csv';
import {
  Holding,
  currentHoldings,
  heldTickers,
  negativeBalances,
  portfolioHistory,
} from '../../lib/ledger-portfolio';
import { Icon } from '../../shared/icon';
import { ChartSeries } from '../charts/chart-utils';
import { LineChart } from '../charts/line-chart';
import { LedgerFormatters } from './format';

const MARKET_REFRESH_MS = 60_000;
/** How long a price stays green or red after it changes. */
const MOVE_HIGHLIGHT_MS = 1500;

type PriceMove = 'up' | 'down';

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
            [disabled]="marketLoading()"
            (click)="refreshMarket()"
          >
            <svg [appIcon]="icons.RefreshCw" class="size-4"></svg>
            {{ s.refresh }}
          </button>
        </div>
        <p class="text-sm text-muted-foreground">
          @if (liveTickers().length > 0) {
            {{ s.pricesLive.replace('{tickers}', liveTickers().join(', ')) }}
          }
          @if (market(); as m) {
            {{ s.pricesFrom.replace('{time}', f.time(m.time)) }}
          } @else if (marketLoading()) {
            {{ s.pricesLoading }}
          }
        </p>
        @if (marketFailed()) {
          <p class="text-sm text-destructive" role="alert">{{ s.pricesFailed }}</p>
        }
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
                      @if (h.source === 'live') {
                        <span
                          class="ml-1 inline-block size-2 animate-pulse rounded-full bg-primary motion-reduce:animate-none"
                          [title]="s.liveHint"
                        ></span>
                        <span class="sr-only">({{ s.live }})</span>
                      } @else if (h.source === 'export') {
                        <span class="badge ml-1 font-normal" [title]="s.priceFromFileHint">
                          {{ s.priceFromFile }}
                        </span>
                      }
                    </th>
                    <td class="py-2 pr-4 text-right">{{ f.amount(h.amount) }}</td>
                    @let move = priceMoves().get(h.ticker);
                    <td
                      class="py-2 pr-4 text-right whitespace-nowrap transition-colors"
                      [class.text-primary]="move === 'up'"
                      [class.text-destructive]="move === 'down'"
                    >
                      {{ h.price === null ? s.noPrice : f.money(h.price) }}
                      <span class="inline-block w-3 text-center text-xs" aria-hidden="true">{{
                        move === 'up' ? '▲' : move === 'down' ? '▼' : ''
                      }}</span>
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

  private readonly tickers = computed(() => heldTickers(this.operations()));
  private readonly fiat = computed(() => this.analysis().fiat || 'USD');

  /** CoinGecko prices of the assets still held; `time` is when they were fetched. */
  protected readonly market = signal<{
    prices: ReadonlyMap<string, MarketPrice>;
    time: number;
  } | null>(null);
  protected readonly marketLoading = signal(false);
  protected readonly marketFailed = signal(false);
  /** Prices streamed from Binance; they take precedence over CoinGecko's. */
  private readonly live = signal<ReadonlyMap<string, MarketPrice>>(new Map());
  /** Drops responses to requests made for an earlier file. */
  private marketRequest = 0;

  /** Tickers whose price just went up or down; they are shown green or red for a moment. */
  protected readonly priceMoves = signal<ReadonlyMap<string, PriceMove>>(new Map());
  /** Last price and its source per ticker; a change of source is not a move. */
  private readonly lastPrices = new Map<string, { price: number; source: Holding['source'] }>();
  private readonly moveTimers = new Map<string, ReturnType<typeof setTimeout>>();

  protected readonly liveTickers = computed(() =>
    this.holdings()
      .filter((h) => h.source === 'live')
      .map((h) => h.ticker),
  );

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) {
      return;
    }

    effect(() => {
      this.tickers();
      this.fiat();
      untracked(() => {
        this.market.set(null);
        void this.refreshMarket();
      });
    });

    effect((onCleanup) => {
      const tickers = this.tickers();
      const fiat = this.fiat();
      this.live.set(new Map());
      if (supportsLivePrices(fiat)) {
        const stop = watchLivePrices(tickers, (prices) =>
          this.live.update((all) => new Map([...all, ...prices])),
        );
        onCleanup(stop);
      }
    });

    // CoinGecko refreshes its prices about once a minute; polling faster gains nothing and
    // runs into its rate limit. A hidden tab is not polled.
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void this.refreshMarket();
      }
    }, MARKET_REFRESH_MS);
    effect(() => {
      const holdings = this.holdings();
      untracked(() => this.trackMoves(holdings));
    });

    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      this.moveTimers.forEach((t) => clearTimeout(t));
    });
  }

  /** Marks tickers whose market price changed since the last update. */
  private trackMoves(holdings: readonly Holding[]): void {
    for (const { ticker, price, source } of holdings) {
      if (price === null || (source !== 'live' && source !== 'market')) {
        continue;
      }
      const last = this.lastPrices.get(ticker);
      this.lastPrices.set(ticker, { price, source });
      if (!last || last.source !== source || last.price === price) {
        continue;
      }
      this.priceMoves.update((moves) =>
        new Map(moves).set(ticker, price > last.price ? 'up' : 'down'),
      );
      clearTimeout(this.moveTimers.get(ticker));
      this.moveTimers.set(
        ticker,
        setTimeout(() => {
          this.moveTimers.delete(ticker);
          this.priceMoves.update((moves) => {
            const next = new Map(moves);
            next.delete(ticker);
            return next;
          });
        }, MOVE_HIGHLIGHT_MS),
      );
    }
  }

  /** Fetches CoinGecko prices; on failure the last ones fetched are kept. */
  protected async refreshMarket(): Promise<void> {
    const request = ++this.marketRequest;
    this.marketLoading.set(true);
    try {
      const prices = await fetchMarketPrices(this.tickers(), this.fiat());
      if (request === this.marketRequest) {
        this.market.set({ prices, time: Date.now() });
        this.marketFailed.set(false);
      }
    } catch {
      if (request === this.marketRequest) {
        this.marketFailed.set(true);
      }
    } finally {
      if (request === this.marketRequest) {
        this.marketLoading.set(false);
      }
    }
  }

  protected readonly negative = computed(() => negativeBalances(this.operations()));

  protected readonly holdings = computed(() =>
    currentHoldings(this.operations(), this.market()?.prices ?? new Map(), this.live()),
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
