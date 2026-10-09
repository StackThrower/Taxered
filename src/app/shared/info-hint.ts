import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { CircleQuestionMark } from 'lucide';
import { Icon } from './icon';

/** Space kept between the panel and the viewport edges, and between the panel and the button. */
const GUTTER = 16;
const GAP = 6;
/** Time to move the pointer from the button onto the panel before it closes. */
const CLOSE_DELAY = 150;

let nextId = 0;

/**
 * A question-mark button with an explanation that opens on hover, keyboard focus or tap and
 * closes on Escape. The panel is a popover in the top layer, so scrolling tables and cards
 * don't clip it; its text is also the button's accessible description.
 *
 * Usage: `<app-info-hint [label]="'Податки'" [text]="'ПДФО 18% + ВЗ 5%'" />`
 */
@Component({
  selector: 'app-info-hint',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'inline-flex align-middle',
    '(pointerenter)': 'pointerEnter($event)',
    '(pointerleave)': 'pointerLeave($event)',
    '(document:pointerdown)': 'outsidePointerDown($event)',
    '(document:keydown.escape)': 'close()',
  },
  template: `
    <button
      #button
      type="button"
      class="-my-1 inline-flex size-6 cursor-help items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      [attr.aria-label]="'Як рахується: ' + label()"
      [attr.aria-describedby]="id"
      (click)="pinned.set(!pinned())"
      (focus)="focus()"
      (blur)="focused.set(false)"
    >
      <svg [appIcon]="icon" class="size-4"></svg>
    </button>
    <span
      #panel
      popover="manual"
      role="tooltip"
      class="inset-auto m-0 w-max max-w-[min(24rem,calc(100vw-2rem))] rounded-md border bg-card px-3 py-2 text-left text-sm leading-relaxed font-normal whitespace-pre-line text-card-foreground shadow-md"
      [id]="id"
      >{{ text() }}</span
    >
  `,
})
export class InfoHint {
  /** What is explained, for the button's accessible name. */
  readonly label = input.required<string>();
  /** The explanation; line breaks are kept. */
  readonly text = input.required<string>();

  protected readonly icon = CircleQuestionMark;
  protected readonly id = `info-hint-${nextId++}`;

  private readonly hovered = signal(false);
  protected readonly focused = signal(false);
  /** Opened by a click or tap; stays open until clicked again or elsewhere. */
  protected readonly pinned = signal(false);
  private readonly open = computed(() => this.hovered() || this.focused() || this.pinned());

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly button = viewChild.required<ElementRef<HTMLButtonElement>>('button');
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private closeTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.closeTimer));

    afterRenderEffect((onCleanup) => {
      const panel = this.panel().nativeElement;
      const shown = panel.matches(':popover-open');
      if (!this.open()) {
        if (shown) {
          panel.hidePopover();
        }
        return;
      }
      if (!shown) {
        panel.showPopover();
      }
      const place = () => this.place();
      place();
      window.addEventListener('scroll', place, true);
      window.addEventListener('resize', place);
      onCleanup(() => {
        window.removeEventListener('scroll', place, true);
        window.removeEventListener('resize', place);
      });
    });
  }

  protected close(): void {
    this.hovered.set(false);
    this.focused.set(false);
    this.pinned.set(false);
  }

  protected focus(): void {
    // Only keyboard focus opens the hint; a click toggles it instead.
    if (this.button().nativeElement.matches(':focus-visible')) {
      this.focused.set(true);
    }
  }

  protected pointerEnter(event: PointerEvent): void {
    if (event.pointerType === 'mouse') {
      clearTimeout(this.closeTimer);
      this.hovered.set(true);
    }
  }

  protected pointerLeave(event: PointerEvent): void {
    if (event.pointerType === 'mouse') {
      this.closeTimer = setTimeout(() => this.hovered.set(false), CLOSE_DELAY);
    }
  }

  protected outsidePointerDown(event: PointerEvent): void {
    if (this.pinned() && !this.host.nativeElement.contains(event.target as Node)) {
      this.pinned.set(false);
    }
  }

  /** Below the button, or above it when there is no room; kept within the viewport. */
  private place(): void {
    const button = this.button().nativeElement.getBoundingClientRect();
    const panel = this.panel().nativeElement;
    const { width, height } = panel.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const left = Math.max(
      GUTTER,
      Math.min(button.left + button.width / 2 - width / 2, viewportWidth - GUTTER - width),
    );
    const below = button.bottom + GAP;
    const above = button.top - GAP - height;
    const top = below + height > window.innerHeight - GUTTER && above >= GUTTER ? above : below;
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }
}
