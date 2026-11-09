import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { AlertCircle } from 'lucide';
import { UK } from '../../core/i18n';
import { analyzeReturns } from '../../lib/returns-model';
import { Icon } from '../../shared/icon';
import { InfoHint } from '../../shared/info-hint';
import { BarChart } from '../../widgets/charts/bar-chart';
import type { ChartSeries } from '../../widgets/charts/chart-utils';
import { LineChart } from '../../widgets/charts/line-chart';
import type { ReturnsArtifact } from '../protocol';

const percentFormat = new Intl.NumberFormat('uk', {
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
});

/** Year-by-year returns: summary, return and capital charts and the table. */
@Component({
  selector: 'app-returns-view',
  imports: [BarChart, LineChart, Icon, InfoHint],
  templateUrl: './returns-view.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReturnsView {
  readonly artifact = input.required<ReturnsArtifact>();

  protected readonly s = UK.calculator;
  protected readonly h = UK.calculator.hints;
  protected readonly icons = { AlertCircle };

  protected readonly currency = computed(() => this.artifact().currency);
  protected readonly analysis = computed(() => {
    const a = this.artifact();
    return analyzeReturns(a.years, {
      currency: a.currency,
      initialCapital: a.initialCapital,
      includeTaxes: a.includeTaxes,
      taxesPaidSeparately: a.taxesPaidSeparately,
      usdRates: a.usdRates,
    });
  });

  private readonly moneyFormat = computed(
    () =>
      new Intl.NumberFormat('uk', {
        style: 'currency',
        currency: this.currency(),
        currencyDisplay: 'narrowSymbol',
        maximumFractionDigits: 0,
      }),
  );
  private readonly compactFormat = computed(
    () =>
      new Intl.NumberFormat('uk', {
        style: 'currency',
        currency: this.currency(),
        currencyDisplay: 'narrowSymbol',
        notation: 'compact',
        maximumFractionDigits: 1,
      }),
  );

  protected readonly money = computed(() => {
    const format = this.moneyFormat();
    return (value: number) => format.format(value);
  });
  protected readonly signedMoney = computed(() => {
    const format = this.moneyFormat();
    return (value: number) => (value > 0 ? '+' : '') + format.format(value);
  });
  protected readonly compactMoney = computed(() => {
    const format = this.compactFormat();
    return (value: number) => format.format(value);
  });
  protected readonly percent = (value: number | null) =>
    value === null ? '—' : `${percentFormat.format(value)} %`;
  protected readonly axisPercent = (value: number) => `${value} %`;

  protected readonly returnsChart = computed(() => {
    const { rows, hasCapital } = this.analysis();
    const categories = rows.map((r) => String(r.year));
    const series: ChartSeries[] = hasCapital
      ? [
          {
            label: this.s.nominal,
            color: 'var(--chart-1)',
            values: rows.map((r) => r.returnPct ?? 0),
          },
          {
            label: this.s.colInflation,
            color: 'var(--chart-2)',
            values: rows.map((r) => r.inflation),
          },
          {
            label: this.s.real,
            color: 'var(--chart-3)',
            values: rows.map((r) => r.realReturnPct ?? 0),
          },
        ]
      : [{ label: this.s.netIncome, color: 'var(--chart-1)', values: rows.map((r) => r.net) }];
    return { categories, series, hasCapital };
  });

  protected readonly capitalChart = computed(() => {
    const a = this.analysis();
    const labels = [this.s.start, ...a.rows.map((r) => String(r.year))];
    const capital = [a.initialCapital, ...a.rows.map((r) => r.endCapital)];
    const threshold = [a.initialCapital, ...a.rows.map((r) => r.threshold)];
    const signedMoney = this.signedMoney();
    return {
      labels,
      series: [
        { label: this.s.capital, color: 'var(--chart-1)', values: capital },
        { label: this.s.threshold, color: 'var(--chart-2)', values: threshold },
      ] satisfies ChartSeries[],
      detail: (i: number) => `${this.s.gap}: ${signedMoney(capital[i] - threshold[i])}`,
    };
  });
}
