import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Minus, Plus, RotateCcw } from 'lucide';
import { UK } from '../../core/i18n';
import { Icon } from '../../shared/icon';
import { COUNTRIES, CountryTax, Metric, Region, formatRate, rateBin } from '../../lib/tax-data';
import { BACKGROUND_PATH, COUNTRY_SHAPES, MAP_VIEWS, ViewBox } from './world-shapes';

export type MapView = Region | 'world';

const s = UK.taxMap;
/** Width / height of the map; every view box is widened or heightened to it. */
const RATIO = 16 / 10;
const ANIMATION_MS = 450;
const MAX_ZOOM = 8;
/** Pointer travel (px) after which a press counts as a drag, not a click. */
const DRAG_THRESHOLD = 4;
const MARKER_PX = 5;
const WORLD = MAP_VIEWS.world;

interface MapCountry {
  country: CountryTax;
  d: string;
  marker: readonly [number, number] | null;
  fill: string;
  label: string;
  /** In the current view: focusable and exposed to assistive technology. */
  inView: boolean;
}

interface Tooltip {
  name: string;
  rate: string;
  x: number;
  y: number;
}

/** Widens or heightens a view box around its centre to the map's aspect ratio. */
function fitRatio([x, y, w, h]: ViewBox): ViewBox {
  if (w / h > RATIO) {
    const nh = w / RATIO;
    return [x, y - (nh - h) / 2, w, nh];
  }
  const nw = h * RATIO;
  return [x - (nw - w) / 2, y, nw, h];
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * Geographic choropleth of investment-income tax rates. Countries with data are buttons;
 * tiny ones also get a dot. The view zooms to the selected region and can be zoomed further
 * with the buttons and panned by dragging.
 */
@Component({
  selector: 'app-world-map',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block' },
  styles: `
    .water {
      fill: color-mix(in srgb, var(--chart-1) 10%, var(--card));
    }
    .land {
      fill: var(--muted);
      stroke: var(--card);
      stroke-width: 0.6;
    }
    .country {
      stroke: var(--card);
      stroke-width: 0.6;
      cursor: pointer;
      outline: none;
      transition: filter 0.15s;
    }
    .country:hover {
      filter: brightness(0.9) saturate(1.2);
    }
    .marker {
      stroke: var(--card);
      stroke-width: 1.5;
    }
    .selected {
      fill: none;
      stroke: var(--foreground);
      stroke-width: 2.5;
      pointer-events: none;
    }
    .focused {
      fill: none;
      stroke: var(--ring);
      stroke-width: 4;
      stroke-dasharray: 5 3;
      pointer-events: none;
    }
    path,
    circle {
      vector-effect: non-scaling-stroke;
    }
  `,
  template: `
    <svg
      #svg
      class="block h-auto w-full touch-pan-y rounded-lg select-none"
      [class.cursor-grab]="zoom() > 1"
      [style.touch-action]="zoom() > 1 ? 'none' : null"
      [attr.viewBox]="viewBoxAttr()"
      [style.aspect-ratio]="ratio"
      role="group"
      [attr.aria-label]="label()"
      (pointerdown)="dragStart($event)"
      (pointermove)="dragMove($event)"
      (pointerup)="dragEnd($event)"
      (pointercancel)="dragEnd($event)"
    >
      <rect class="water" x="-1000" y="-1000" width="3000" height="3000" />
      <path class="land" [attr.d]="background" aria-hidden="true" />
      @for (c of countries(); track c.country.code) {
        <path
          class="country"
          [attr.d]="c.d"
          [attr.fill]="c.fill"
          [attr.role]="c.marker || !c.inView ? null : 'button'"
          [attr.tabindex]="c.marker || !c.inView ? null : 0"
          [attr.aria-label]="c.marker || !c.inView ? null : c.label"
          [attr.aria-pressed]="c.marker || !c.inView ? null : c.country.code === selected()"
          [attr.aria-hidden]="c.marker || !c.inView ? 'true' : null"
          (click)="pick(c.country)"
          (keydown.enter)="pick(c.country)"
          (keydown.space)="$event.preventDefault(); pick(c.country)"
          (pointermove)="hover($event, c)"
          (pointerleave)="tooltip.set(null)"
          (focus)="focus($event, c)"
          (blur)="blur()"
        />
      }
      @for (c of countries(); track c.country.code) {
        @if (c.marker; as m) {
          <circle
            class="country marker"
            [attr.cx]="m[0]"
            [attr.cy]="m[1]"
            [attr.r]="markerRadius()"
            [attr.fill]="c.fill"
            [attr.role]="c.inView ? 'button' : null"
            [attr.tabindex]="c.inView ? 0 : null"
            [attr.aria-label]="c.inView ? c.label : null"
            [attr.aria-pressed]="c.inView ? c.country.code === selected() : null"
            [attr.aria-hidden]="c.inView ? null : 'true'"
            (click)="pick(c.country)"
            (keydown.enter)="pick(c.country)"
            (keydown.space)="$event.preventDefault(); pick(c.country)"
            (pointermove)="hover($event, c)"
            (pointerleave)="tooltip.set(null)"
            (focus)="focus($event, c)"
            (blur)="blur()"
          />
        }
      }
      @for (outline of outlines(); track outline.kind) {
        @if (outline.c.marker; as m) {
          <circle
            [class]="outline.kind"
            [attr.cx]="m[0]"
            [attr.cy]="m[1]"
            [attr.r]="markerRadius() * 1.6"
            aria-hidden="true"
          />
        } @else {
          <path [class]="outline.kind" [attr.d]="outline.c.d" aria-hidden="true" />
        }
      }
    </svg>

    <div class="absolute top-2 right-2 flex flex-col gap-1">
      <button
        type="button"
        class="btn btn-outline btn-icon size-8"
        [attr.aria-label]="s.zoomIn"
        [disabled]="zoom() >= maxZoom"
        (click)="zoomBy(1.6)"
      >
        <svg [appIcon]="icons.Plus" class="size-4"></svg>
      </button>
      <button
        type="button"
        class="btn btn-outline btn-icon size-8"
        [attr.aria-label]="s.zoomOut"
        [disabled]="zoom() <= 1"
        (click)="zoomBy(1 / 1.6)"
      >
        <svg [appIcon]="icons.Minus" class="size-4"></svg>
      </button>
      @if (zoom() > 1) {
        <button
          type="button"
          class="btn btn-outline btn-icon size-8"
          [attr.aria-label]="s.zoomReset"
          (click)="reset()"
        >
          <svg [appIcon]="icons.RotateCcw" class="size-4"></svg>
        </button>
      }
    </div>

    @if (tooltip(); as t) {
      <div
        aria-hidden="true"
        class="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border bg-card px-2.5 py-1.5 text-sm whitespace-nowrap text-card-foreground shadow-md"
        [style.left.px]="t.x"
        [style.top.px]="t.y - 10"
      >
        <span class="font-medium">{{ t.name }}</span>
        <span class="ml-1.5 tabular-nums">{{ t.rate }}</span>
      </div>
    }
  `,
})
export class WorldMap {
  readonly view = input.required<MapView>();
  readonly metric = input.required<Metric>();
  readonly selected = input.required<string | null>();
  readonly label = input.required<string>();
  readonly selectedChange = output<string>();

  protected readonly s = s;
  protected readonly icons = { Minus, Plus, RotateCcw };
  protected readonly background = BACKGROUND_PATH;
  protected readonly ratio = String(RATIO);
  protected readonly maxZoom = MAX_ZOOM;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly svg = viewChild.required<ElementRef<SVGSVGElement>>('svg');
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** The region's own view box; zoom and pan are relative to it. */
  private readonly home = computed(() => fitRatio(MAP_VIEWS[this.view()]));
  protected readonly box = signal<ViewBox>(fitRatio(MAP_VIEWS.europe));
  protected readonly zoom = computed(() => this.home()[2] / this.box()[2]);
  protected readonly viewBoxAttr = computed(() =>
    this.box()
      .map((n) => Math.round(n * 100) / 100)
      .join(' '),
  );

  private readonly widthPx = signal(720);
  protected readonly markerRadius = computed(() => (MARKER_PX * this.box()[2]) / this.widthPx());

  protected readonly tooltip = signal<Tooltip | null>(null);
  private readonly focusedCode = signal<string | null>(null);

  protected readonly countries = computed<MapCountry[]>(() => {
    const metric = this.metric();
    const view = this.view();
    const byCode = new Map(COUNTRY_SHAPES.map((shape) => [shape.code, shape]));
    return COUNTRIES.flatMap((country) => {
      const shape = byCode.get(country.code);
      if (!shape) {
        return [];
      }
      const rate = country.rates[metric];
      return {
        country,
        d: shape.d,
        marker: shape.marker,
        fill: rateBin(rate).bg,
        label: `${country.name}: ${formatRate(rate)}${country.regime ? `, ${s.regimeMark}` : ''}`,
        inView: view === 'world' || country.region === view,
      };
    });
  });

  /** Selected and keyboard-focused countries are outlined on top of their neighbours. */
  protected readonly outlines = computed(() => {
    const find = (code: string | null) => this.countries().find((c) => c.country.code === code);
    const selected = find(this.selected());
    const focused = find(this.focusedCode());
    return [
      ...(selected ? [{ kind: 'selected', c: selected }] : []),
      ...(focused ? [{ kind: 'focused', c: focused }] : []),
    ];
  });

  private frame = 0;
  private drag: { x: number; y: number; box: ViewBox; id: number } | null = null;
  private dragged = false;

  constructor() {
    const destroyRef = inject(DestroyRef);

    effect(() => {
      const target = this.home();
      untracked(() => this.animateTo(target));
    });

    if (this.browser) {
      const observer = new ResizeObserver(([entry]) => {
        if (entry.contentRect.width > 0) {
          this.widthPx.set(entry.contentRect.width);
        }
      });
      observer.observe(this.host.nativeElement);
      destroyRef.onDestroy(() => {
        observer.disconnect();
        cancelAnimationFrame(this.frame);
      });
    }
  }

  protected pick(country: CountryTax): void {
    if (this.dragged) {
      return;
    }
    this.selectedChange.emit(country.code);
  }

  protected hover(event: PointerEvent, c: MapCountry): void {
    if (this.drag || event.pointerType !== 'mouse') {
      return;
    }
    const rect = this.host.nativeElement.getBoundingClientRect();
    this.showTooltip(c, event.clientX - rect.left, event.clientY - rect.top);
  }

  protected focus(event: FocusEvent, c: MapCountry): void {
    const target = event.target as SVGGraphicsElement;
    if (!target.matches(':focus-visible')) {
      return;
    }
    this.focusedCode.set(c.country.code);
    const rect = this.host.nativeElement.getBoundingClientRect();
    const box = target.getBoundingClientRect();
    this.showTooltip(c, box.left + box.width / 2 - rect.left, box.top - rect.top);
  }

  protected blur(): void {
    this.focusedCode.set(null);
    this.tooltip.set(null);
  }

  protected zoomBy(factor: number): void {
    const [x, y, w, h] = this.box();
    const max = this.home()[2];
    const nw = Math.min(max, Math.max(max / MAX_ZOOM, w / factor));
    const nh = (nw / w) * h;
    this.animateTo(this.clamp([x + (w - nw) / 2, y + (h - nh) / 2, nw, nh]));
  }

  protected reset(): void {
    this.animateTo(this.home());
  }

  protected dragStart(event: PointerEvent): void {
    this.dragged = false;
    if (event.button !== 0 || this.zoom() <= 1) {
      return;
    }
    this.drag = { x: event.clientX, y: event.clientY, box: this.box(), id: event.pointerId };
  }

  protected dragMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || drag.id !== event.pointerId) {
      return;
    }
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!this.dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD) {
      return;
    }
    if (!this.dragged) {
      this.dragged = true;
      this.tooltip.set(null);
      this.svg().nativeElement.setPointerCapture(event.pointerId);
    }
    const [x, y, w, h] = drag.box;
    const scale = w / this.svg().nativeElement.getBoundingClientRect().width;
    cancelAnimationFrame(this.frame);
    this.box.set(this.clamp([x - dx * scale, y - dy * scale, w, h]));
  }

  protected dragEnd(event: PointerEvent): void {
    if (this.drag?.id === event.pointerId) {
      this.drag = null;
    }
  }

  private showTooltip(c: MapCountry, x: number, y: number): void {
    this.tooltip.set({
      name: c.country.name,
      rate: formatRate(c.country.rates[this.metric()]),
      x,
      y,
    });
  }

  /** Keeps the view's centre over the world map. */
  private clamp([x, y, w, h]: ViewBox): ViewBox {
    const [wx, wy, ww, wh] = WORLD;
    const cx = Math.min(wx + ww, Math.max(wx, x + w / 2));
    const cy = Math.min(wy + wh, Math.max(wy, y + h / 2));
    return [cx - w / 2, cy - h / 2, w, h];
  }

  private animateTo(target: ViewBox): void {
    if (!this.browser || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.box.set(target);
      return;
    }
    cancelAnimationFrame(this.frame);
    const from = this.box();
    const start = performance.now();
    const step = (now: number) => {
      const t = ease(Math.min(1, (now - start) / ANIMATION_MS));
      this.box.set(from.map((v, i) => v + (target[i] - v) * t) as unknown as ViewBox);
      if (t < 1) {
        this.frame = requestAnimationFrame(step);
      }
    };
    this.frame = requestAnimationFrame(step);
  }
}
