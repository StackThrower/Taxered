import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { ChartSeries, barPath, clampTooltip, hostWidth, niceTicks } from './chart-utils';

const HEIGHT = 260;
const MARGIN = { top: 12, right: 8, bottom: 28, left: 64 };
const MAX_BAR = 24;
const GAP = 2;

/** Grouped column chart: one group per category, one bar per series; values may be negative. */
@Component({
  selector: 'app-bar-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block' },
  template: `
    @if (series().length > 1) {
      <ul class="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        @for (s of series(); track s.label) {
          <li class="flex items-center gap-1.5">
            <span class="size-2.5 rounded-sm" [style.background]="s.color"></span>
            {{ s.label }}
          </li>
        }
      </ul>
    }

    <svg
      role="group"
      [attr.aria-label]="label()"
      [attr.width]="width()"
      [attr.height]="height"
      class="block overflow-visible text-xs"
    >
      @let g = geometry();
      @for (tick of g.ticks; track tick.value) {
        <line
          [attr.x1]="margin.left"
          [attr.x2]="width() - margin.right"
          [attr.y1]="tick.y"
          [attr.y2]="tick.y"
          [attr.stroke]="tick.value === 0 ? 'var(--chart-axis)' : 'var(--chart-grid)'"
          stroke-width="1"
          shape-rendering="crispEdges"
        />
        <text
          [attr.x]="margin.left - 8"
          [attr.y]="tick.y"
          text-anchor="end"
          dominant-baseline="middle"
          class="fill-muted-foreground tabular-nums"
        >
          {{ axisFormat()(tick.value) }}
        </text>
      }

      @for (group of g.groups; track group.category; let i = $index) {
        @if (active() === i) {
          <rect
            [attr.x]="group.bandX"
            [attr.y]="margin.top"
            [attr.width]="g.band"
            [attr.height]="g.plotHeight"
            class="fill-muted"
            opacity="0.6"
          />
        }
        @for (bar of group.bars; track $index) {
          <path [attr.d]="bar.d" [attr.fill]="bar.color" />
        }
        <text
          [attr.x]="group.center"
          [attr.y]="height - 8"
          text-anchor="middle"
          class="fill-muted-foreground tabular-nums"
        >
          {{ group.category }}
        </text>
        <rect
          role="img"
          tabindex="0"
          [attr.aria-label]="group.description"
          [attr.x]="group.bandX"
          [attr.y]="margin.top"
          [attr.width]="g.band"
          [attr.height]="g.plotHeight"
          fill="transparent"
          class="cursor-pointer outline-none focus-visible:stroke-ring focus-visible:stroke-2"
          (pointerenter)="active.set(i)"
          (pointerleave)="active.set(null)"
          (focus)="active.set(i)"
          (blur)="active.set(null)"
        />
      }
    </svg>

    @if (tooltip(); as t) {
      <div
        class="pointer-events-none absolute z-10 min-w-40 -translate-x-1/2 rounded-md border bg-card px-3 py-2 text-sm shadow-md"
        [style.left.px]="t.left"
        [style.top.px]="40"
        aria-hidden="true"
      >
        <p class="mb-1 font-semibold">{{ t.category }}</p>
        @for (row of t.rows; track row.label) {
          <p class="flex items-center gap-2">
            <span class="h-0.5 w-3 rounded" [style.background]="row.color"></span>
            <span class="font-semibold whitespace-nowrap tabular-nums">{{ row.value }}</span>
            <span class="text-muted-foreground">{{ row.label }}</span>
          </p>
        }
      </div>
    }
  `,
})
export class BarChart {
  readonly categories = input.required<readonly string[]>();
  readonly series = input.required<readonly ChartSeries[]>();
  readonly label = input.required<string>();
  readonly format = input.required<(value: number) => string>();
  readonly axisFormat = input.required<(value: number) => string>();

  protected readonly height = HEIGHT;
  protected readonly margin = MARGIN;
  protected readonly width = hostWidth(640);
  protected readonly active = signal<number | null>(null);

  protected readonly geometry = computed(() => {
    const series = this.series();
    const categories = this.categories();
    const values = series.flatMap((s) => s.values);
    const ticks = niceTicks(Math.min(...values), Math.max(...values));
    const lo = ticks[0];
    const hi = ticks[ticks.length - 1];
    const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
    const y = (v: number) => MARGIN.top + ((hi - v) / (hi - lo)) * plotHeight;
    const baseline = y(0);

    const plotWidth = this.width() - MARGIN.left - MARGIN.right;
    const band = plotWidth / Math.max(categories.length, 1);
    const barWidth = Math.max(
      2,
      Math.min(MAX_BAR, (band * 0.75 - GAP * (series.length - 1)) / series.length),
    );
    const groupWidth = barWidth * series.length + GAP * (series.length - 1);
    const format = this.format();

    return {
      band,
      plotHeight,
      ticks: ticks.map((value) => ({ value, y: y(value) })),
      groups: categories.map((category, i) => {
        const bandX = MARGIN.left + i * band;
        const start = bandX + (band - groupWidth) / 2;
        return {
          category,
          bandX,
          center: bandX + band / 2,
          description:
            `${category}: ` + series.map((s) => `${s.label} ${format(s.values[i])}`).join(', '),
          bars: series.map((s, j) => ({
            color: s.color,
            d: barPath(start + j * (barWidth + GAP), barWidth, baseline, y(s.values[i])),
          })),
        };
      }),
    };
  });

  protected readonly tooltip = computed(() => {
    const i = this.active();
    if (i === null) {
      return null;
    }
    const group = this.geometry().groups[i];
    const format = this.format();
    return {
      category: group.category,
      left: clampTooltip(group.center, this.width()),
      rows: this.series().map((s) => ({
        label: s.label,
        color: s.color,
        value: format(s.values[i]),
      })),
    };
  });
}
