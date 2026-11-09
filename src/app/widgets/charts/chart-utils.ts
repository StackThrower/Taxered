import { DestroyRef, ElementRef, Signal, afterNextRender, inject, signal } from '@angular/core';

export interface ChartSeries {
  label: string;
  /** CSS colour, normally one of the `--chart-*` tokens. */
  color: string;
  values: readonly number[];
}

/** Rendered width of the host element; `fallback` during SSR and before the first layout. */
export function hostWidth(fallback: number): Signal<number> {
  const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  const destroyRef = inject(DestroyRef);
  const width = signal(fallback);

  afterNextRender(() => {
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) {
        width.set(Math.round(entry.contentRect.width));
      }
    });
    observer.observe(host);
    destroyRef.onDestroy(() => observer.disconnect());
  });

  return width.asReadonly();
}

/** Round axis ticks covering [min, max]; bars need zero in range, lines do not. */
export function niceTicks(min: number, max: number, count = 5, includeZero = true): number[] {
  let lo = includeZero ? Math.min(0, min) : min;
  let hi = includeZero ? Math.max(0, max) : max;
  if (lo === hi) {
    const pad = Math.abs(lo) * 0.1 || 1;
    lo -= includeZero && lo === 0 ? 0 : pad;
    hi += pad;
  }
  const rough = (hi - lo) / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? rough;
  const ticks: number[] = [];
  for (let t = Math.floor(lo / step) * step; t <= hi + step * 1e-9; t += step) {
    ticks.push(Math.abs(t) < step * 1e-9 ? 0 : t);
  }
  if (ticks[ticks.length - 1] < hi) {
    ticks.push(ticks[ticks.length - 1] + step);
  }
  return ticks;
}

/** A bar from the baseline to `end` with a 4px rounded data end and a square base. */
export function barPath(x: number, width: number, baseline: number, end: number): string {
  const height = Math.abs(end - baseline);
  const r = Math.min(4, height, width / 2);
  if (end <= baseline) {
    return (
      `M${x},${baseline}V${end + r}Q${x},${end} ${x + r},${end}` +
      `H${x + width - r}Q${x + width},${end} ${x + width},${end + r}V${baseline}Z`
    );
  }
  return (
    `M${x},${baseline}V${end - r}Q${x},${end} ${x + r},${end}` +
    `H${x + width - r}Q${x + width},${end} ${x + width},${end - r}V${baseline}Z`
  );
}

/** Keeps a centred tooltip of `half` width inside the chart. */
export function clampTooltip(x: number, width: number, half = 96): number {
  return Math.min(Math.max(x, half), Math.max(half, width - half));
}
