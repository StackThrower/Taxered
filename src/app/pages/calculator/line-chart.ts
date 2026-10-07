import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { ChartSeries, clampTooltip, hostWidth, niceTicks } from './chart-utils';

const HEIGHT = 280;
const MARGIN = { top: 12, right: 16, bottom: 28, left: 64 };

/**
 * Line chart over ordered points with a crosshair. With `fillBetween`, the gap between
 * the first two series is washed in the first series' colour.
 */
@Component({
  selector: 'app-line-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block' },
  template: `
    <ul class="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
      @for (s of series(); track s.label) {
        <li class="flex items-center gap-1.5">
          <span class="h-0.5 w-4 rounded" [style.background]="s.color"></span>
          {{ s.label }}
          <span class="font-semibold text-foreground tabular-nums">{{
            format()(s.values[s.values.length - 1])
          }}</span>
        </li>
      }
    </ul>

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
      @for (point of g.points; track $index) {
        @if (point.showLabel) {
          <text
            [attr.x]="point.x"
            [attr.y]="height - 8"
            text-anchor="middle"
            class="fill-muted-foreground tabular-nums"
          >
            {{ point.label }}
          </text>
        }
      }

      @if (g.band) {
        <path [attr.d]="g.band" [attr.fill]="series()[0].color" opacity="0.1" />
      }
      @if (active() !== null) {
        <line
          [attr.x1]="g.points[active()!].x"
          [attr.x2]="g.points[active()!].x"
          [attr.y1]="margin.top"
          [attr.y2]="height - margin.bottom"
          stroke="var(--chart-axis)"
          stroke-width="1"
        />
      }
      @for (line of g.lines; track line.label) {
        <path
          [attr.d]="line.d"
          fill="none"
          [attr.stroke]="line.color"
          stroke-width="2"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
        @let dot = line.dots[active() ?? line.dots.length - 1];
        <circle
          [attr.cx]="dot.x"
          [attr.cy]="dot.y"
          r="4"
          [attr.fill]="line.color"
          stroke="var(--card)"
          stroke-width="2"
        />
      }

      @for (point of g.points; track $index; let i = $index) {
        <rect
          role="img"
          tabindex="0"
          [attr.aria-label]="point.description"
          [attr.x]="point.x - g.step / 2"
          [attr.y]="margin.top"
          [attr.width]="g.step"
          [attr.height]="g.plotHeight"
          fill="transparent"
          class="cursor-crosshair outline-none focus-visible:stroke-ring focus-visible:stroke-2"
          (pointerenter)="active.set(i)"
          (pointerleave)="active.set(null)"
          (focus)="active.set(i)"
          (blur)="active.set(null)"
        />
      }
    </svg>

    @if (tooltip(); as t) {
      <div
        class="pointer-events-none absolute z-10 min-w-48 -translate-x-1/2 rounded-md border bg-card px-3 py-2 text-sm shadow-md"
        [style.left.px]="t.left"
        [style.top.px]="40"
        aria-hidden="true"
      >
        <p class="mb-1 font-semibold">{{ t.label }}</p>
        @for (row of t.rows; track row.label) {
          <p class="flex items-center gap-2">
            <span class="h-0.5 w-3 rounded" [style.background]="row.color"></span>
            <span class="font-semibold whitespace-nowrap tabular-nums">{{ row.value }}</span>
            <span class="text-muted-foreground">{{ row.label }}</span>
          </p>
        }
        @if (t.extra) {
          <p class="mt-1 border-t pt-1 text-muted-foreground">{{ t.extra }}</p>
        }
      </div>
    }
  `,
})
export class LineChart {
  readonly labels = input.required<readonly string[]>();
  readonly series = input.required<readonly ChartSeries[]>();
  readonly label = input.required<string>();
  readonly format = input.required<(value: number) => string>();
  readonly axisFormat = input.required<(value: number) => string>();
  readonly fillBetween = input(false);
  /** Extra tooltip line per point, e.g. the gap between the series. */
  readonly detail = input<(index: number) => string>();

  protected readonly height = HEIGHT;
  protected readonly margin = MARGIN;
  protected readonly width = hostWidth(640);
  protected readonly active = signal<number | null>(null);

  protected readonly geometry = computed(() => {
    const series = this.series();
    const labels = this.labels();
    const values = series.flatMap((s) => s.values);
    const ticks = niceTicks(Math.min(...values), Math.max(...values), 4, false);
    const lo = ticks[0];
    const hi = ticks[ticks.length - 1];
    const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
    const y = (v: number) => MARGIN.top + ((hi - v) / (hi - lo)) * plotHeight;

    const plotWidth = this.width() - MARGIN.left - MARGIN.right;
    const step = plotWidth / Math.max(labels.length - 1, 1);
    const x = (i: number) => MARGIN.left + (labels.length > 1 ? i * step : plotWidth / 2);
    // Thin out x labels so they never collide (about 56px each).
    const every = Math.max(1, Math.ceil(56 / step));
    const format = this.format();

    const lines = series.map((s) => {
      const dots = s.values.map((v, i) => ({ x: x(i), y: y(v) }));
      return {
        label: s.label,
        color: s.color,
        dots,
        d: dots.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(''),
      };
    });

    const [first, second] = lines;
    const band =
      this.fillBetween() && first && second
        ? `${first.d}${[...second.dots]
            .reverse()
            .map((p) => `L${p.x},${p.y}`)
            .join('')}Z`
        : null;

    return {
      step,
      plotHeight,
      band,
      lines,
      ticks: ticks.map((value) => ({ value, y: y(value) })),
      points: labels.map((label, i) => ({
        label,
        x: x(i),
        showLabel: (labels.length - 1 - i) % every === 0,
        description:
          `${label}: ` + series.map((s) => `${s.label} ${format(s.values[i])}`).join(', '),
      })),
    };
  });

  protected readonly tooltip = computed(() => {
    const i = this.active();
    if (i === null) {
      return null;
    }
    const format = this.format();
    return {
      label: this.labels()[i],
      left: clampTooltip(this.geometry().points[i].x, this.width(), 110),
      rows: this.series().map((s) => ({
        label: s.label,
        color: s.color,
        value: format(s.values[i]),
      })),
      extra: this.detail()?.(i) ?? null,
    };
  });
}
