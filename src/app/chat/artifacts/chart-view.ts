import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { BarChart } from '../../widgets/charts/bar-chart';
import type { ChartSeries } from '../../widgets/charts/chart-utils';
import { LineChart } from '../../widgets/charts/line-chart';
import type { ChartArtifact } from '../protocol';

const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)'];

/** A bar or line chart the agent composed from its figures. */
@Component({
  selector: 'app-chart-view',
  imports: [BarChart, LineChart],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let a = artifact();
    <section class="card">
      <div class="card-header">
        <h3 class="card-title">{{ a.title }}</h3>
      </div>
      <div class="card-content">
        @if (a.chart === 'bar') {
          <app-bar-chart
            [categories]="a.categories"
            [series]="series()"
            [label]="a.title"
            [format]="format()"
            [axisFormat]="axisFormat()"
          />
        } @else {
          <app-line-chart
            [labels]="a.categories"
            [series]="series()"
            [label]="a.title"
            [format]="format()"
            [axisFormat]="axisFormat()"
          />
        }
      </div>
    </section>
  `,
})
export class ChartView {
  readonly artifact = input.required<ChartArtifact>();

  protected readonly series = computed<ChartSeries[]>(() =>
    this.artifact().series.map((s, i) => ({
      label: s.label,
      values: s.values,
      color: COLORS[i % COLORS.length],
    })),
  );

  private readonly formats = computed(() => {
    const { unit, currency } = this.artifact();
    if (unit === 'money') {
      const options = {
        style: 'currency',
        currency: currency || 'USD',
        currencyDisplay: 'narrowSymbol',
      } as const;
      return {
        full: new Intl.NumberFormat('uk', { ...options, maximumFractionDigits: 0 }),
        axis: new Intl.NumberFormat('uk', {
          ...options,
          notation: 'compact',
          maximumFractionDigits: 1,
        }),
        suffix: '',
      };
    }
    const number = new Intl.NumberFormat('uk', { maximumFractionDigits: 2 });
    return { full: number, axis: number, suffix: unit === 'percent' ? ' %' : '' };
  });
  protected readonly format = computed(() => {
    const { full, suffix } = this.formats();
    return (value: number) => full.format(value) + suffix;
  });
  protected readonly axisFormat = computed(() => {
    const { axis, suffix } = this.formats();
    return (value: number) => axis.format(value) + suffix;
  });
}
