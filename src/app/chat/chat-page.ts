import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import {
  ArrowRightLeft,
  Calculator,
  FileText,
  LineChart,
  LoaderCircle,
  Map as MapIcon,
  Paperclip,
  RotateCcw,
  Send,
  Square,
  Wallet,
  X,
} from 'lucide';
import { SeoService } from '../core/seo.service';
import { LOCALE, SITE_URL, localePath } from '../core/site';
import { Icon } from '../shared/icon';
import { ChatMessageView } from './chat-message';
import { ChatService } from './chat.service';
import { MAX_MESSAGE_CHARS } from './protocol';

interface Suggestion {
  id: string;
  title: string;
  hint: string;
  prompt: string;
  icon: typeof Calculator;
  /** Opens the file picker: the task needs a file. */
  needsFile: boolean;
}

const SUGGESTIONS: readonly Suggestion[] = [
  {
    id: 'f1',
    title: 'Декларація Ф1',
    hint: 'XML-звіт Interactive Brokers або Freedom Finance → форма Ф1, PDF, Excel, XML для Е-кабінету',
    prompt: 'Розрахуй додаток Ф1 за 2025 рік за моїм звітом брокера',
    icon: Calculator,
    needsFile: true,
  },
  {
    id: 'returns',
    title: 'Дохідність інвестицій',
    hint: 'CSV-виписки IB → реальна дохідність за роками з податками та інфляцією',
    prompt: 'Порахуй реальну дохідність мого рахунку з урахуванням податків та інфляції',
    icon: LineChart,
    needsFile: true,
  },
  {
    id: 'tax-map',
    title: 'Карта податків',
    hint: 'Ставки на дивіденди, приріст капіталу й відсотки у 60+ країнах',
    prompt: 'Де в Європі найнижчі податки на дивіденди? Покажи на карті й порівняй з Україною',
    icon: MapIcon,
    needsFile: false,
  },
  {
    id: 'spreads',
    title: 'Спреди та комісії',
    hint: 'CSV Ledger Live → скільки коштували обміни й комісії мережі',
    prompt: 'Скільки я втратив на спредах обмінів і комісіях мережі?',
    icon: ArrowRightLeft,
    needsFile: true,
  },
  {
    id: 'ledger',
    title: 'Портфель Ledger',
    hint: 'CSV Ledger Live → активи, вартість і динаміка портфеля',
    prompt: 'Покажи мій портфель Ledger: активи, вартість і динаміку',
    icon: Wallet,
    needsFile: true,
  },
];

@Component({
  selector: 'app-chat-page',
  imports: [ReactiveFormsModule, Icon, ChatMessageView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-1 flex-col',
    '(dragover)': 'onDragOver($event)',
    '(dragleave)': 'onDragLeave($event)',
    '(drop)': 'onDrop($event)',
  },
  template: `
    <section class="relative mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 pt-6 pb-4 md:pt-10">
      <div class="mb-6 flex items-start justify-between gap-4">
        <div class="space-y-1">
          <h1 class="text-2xl font-bold text-balance md:text-3xl">
            Taxered — <span class="text-primary">податковий AI-асистент</span>
          </h1>
          <p class="text-sm text-muted-foreground md:text-base">
            Надішліть звіт брокера чи історію Ledger і отримайте форму Ф1, графіки дохідності, карту
            податків або файли з розрахунками.
          </p>
        </div>
        @if (chat.messages().length > 0) {
          <button type="button" class="btn btn-outline btn-sm shrink-0" (click)="reset()">
            <svg [appIcon]="icons.RotateCcw" class="size-4"></svg>
            Нова розмова
          </button>
        }
      </div>

      @if (chat.messages().length === 0) {
        <div class="mb-6">
          <h2 class="mb-3 text-sm font-semibold text-muted-foreground">Що вміє асистент</h2>
          <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            @for (s of suggestions; track s.id) {
              <li>
                <button
                  type="button"
                  class="card h-full w-full cursor-pointer gap-1 px-4 py-4 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  (click)="useSuggestion(s)"
                >
                  <span class="flex items-center gap-2 font-semibold">
                    <svg [appIcon]="s.icon" class="size-4 text-primary"></svg>{{ s.title }}
                  </span>
                  <span class="text-sm text-muted-foreground">{{ s.hint }}</span>
                </button>
              </li>
            }
          </ul>
        </div>
      }

      <div class="flex-1 space-y-6 pb-4">
        @for (m of chat.messages(); track m.id) {
          <app-chat-message [message]="m" />
        }
        <div #end></div>
      </div>

      <p class="sr-only" role="status" aria-live="polite">{{ announcement() }}</p>

      @if (dragging()) {
        <div
          class="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-background/80 text-lg font-semibold"
          aria-hidden="true"
        >
          Відпустіть, щоб прикріпити файли
        </div>
      }

      <form
        class="sticky bottom-0 z-20 rounded-xl border bg-card p-2 shadow-sm"
        (ngSubmit)="submit()"
        aria-label="Нове повідомлення"
      >
        @if (chat.attachments().length > 0) {
          <ul class="flex flex-wrap gap-2 p-1" aria-label="Файли до відправлення">
            @for (a of chat.attachments(); track a.key) {
              <li
                class="inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs"
                [class.border-destructive]="a.state === 'failed'"
              >
                <svg
                  [appIcon]="a.state === 'uploading' ? icons.LoaderCircle : icons.FileText"
                  class="size-3.5"
                  [class.animate-spin]="a.state === 'uploading'"
                ></svg>
                <span class="truncate">{{ a.name }}</span>
                @if (a.state === 'failed') {
                  <span class="text-destructive">— {{ a.error }}</span>
                }
                <button
                  type="button"
                  class="btn btn-ghost btn-icon size-5 cursor-pointer"
                  [attr.aria-label]="'Прибрати ' + a.name"
                  (click)="chat.removeAttachment(a.key)"
                >
                  <svg [appIcon]="icons.X" class="size-3"></svg>
                </button>
              </li>
            }
          </ul>
        }
        <div class="flex items-end gap-2">
          <button
            type="button"
            class="btn btn-ghost btn-icon shrink-0"
            aria-label="Прикріпити файли (XML або CSV)"
            title="Прикріпити файли"
            (click)="fileInput.click()"
          >
            <svg [appIcon]="icons.Paperclip" class="size-5"></svg>
          </button>
          <input
            #fileInput
            type="file"
            class="sr-only"
            tabindex="-1"
            aria-hidden="true"
            multiple
            accept=".xml,.csv,text/xml,text/csv,application/xml"
            (change)="onFiles($event)"
          />
          <label for="chat-input" class="sr-only">Повідомлення асистенту</label>
          <textarea
            id="chat-input"
            #input
            class="max-h-48 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-base outline-none placeholder:text-muted-foreground"
            rows="1"
            [attr.maxlength]="maxChars"
            placeholder="Запитайте про податки або прикріпіть звіт…"
            aria-describedby="chat-input-hint"
            [formControl]="text"
            (keydown.enter)="onEnter($event)"
          ></textarea>
          @if (chat.busy()) {
            <button
              type="button"
              class="btn btn-outline btn-icon shrink-0"
              aria-label="Зупинити відповідь"
              (click)="chat.stop()"
            >
              <svg [appIcon]="icons.Square" class="size-4"></svg>
            </button>
          } @else {
            <button
              type="submit"
              class="btn btn-primary btn-icon shrink-0"
              aria-label="Надіслати"
              [disabled]="!canSend()"
            >
              <svg [appIcon]="icons.Send" class="size-4"></svg>
            </button>
          }
        </div>
        <p id="chat-input-hint" class="px-2 pt-1 text-xs text-muted-foreground">
          Enter — надіслати, Shift+Enter — новий рядок. Файли обробляються на сервері Taxered і
          зберігаються тимчасово — до 2 годин неактивності; моделі Claude (Anthropic) передаються
          ваші повідомлення та підсумки розрахунків. Це довідковий розрахунок, не податкова
          консультація.
        </p>
      </form>
    </section>
  `,
})
export class ChatPage {
  protected readonly chat = inject(ChatService);

  protected readonly icons = {
    FileText,
    LoaderCircle,
    Paperclip,
    RotateCcw,
    Send,
    Square,
    X,
  };
  protected readonly suggestions = SUGGESTIONS;
  protected readonly maxChars = MAX_MESSAGE_CHARS;
  protected readonly text = new FormControl('', { nonNullable: true });
  protected readonly dragging = signal(false);

  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');
  private readonly input = viewChild.required<ElementRef<HTMLTextAreaElement>>('input');
  private readonly end = viewChild.required<ElementRef<HTMLElement>>('end');

  /** Announced to screen readers: the agent's progress, not every streamed word. */
  protected readonly announcement = computed(() => {
    const last = this.chat.messages().at(-1);
    if (!last || last.role !== 'assistant') {
      return '';
    }
    if (last.error) {
      return `Помилка: ${last.error}`;
    }
    if (last.pending) {
      return last.status?.text ?? 'Асистент відповідає…';
    }
    return 'Відповідь готова.';
  });

  protected readonly canSend = computed(
    () =>
      !this.chat.uploading() &&
      (this.textValue().trim() !== '' || this.chat.attachments().some((a) => a.state === 'ready')),
  );
  private readonly textValue = toSignal(this.text.valueChanges, { initialValue: '' });

  constructor() {
    // Keep the newest message in view while the answer streams in.
    afterRenderEffect(() => {
      const last = this.chat.messages().at(-1);
      if (last) {
        void last.text.length;
        void last.artifacts.length;
        this.end().nativeElement.scrollIntoView?.({ block: 'end' });
      }
    });

    const topic = inject(ActivatedRoute).snapshot.queryParamMap.get('topic');
    const suggestion = SUGGESTIONS.find((s) => s.id === topic);
    if (suggestion) {
      this.text.setValue(suggestion.prompt);
    }
    this.setSeo(inject(ActivatedRoute).snapshot.data['root'] === true);
  }

  protected useSuggestion(s: Suggestion): void {
    this.text.setValue(s.prompt);
    if (s.needsFile) {
      this.fileInput().nativeElement.click();
    } else {
      this.input().nativeElement.focus();
    }
  }

  protected async onFiles(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    this.input().nativeElement.focus();
    await this.chat.attach(files);
  }

  protected onEnter(event: Event): void {
    const keyboard = event as KeyboardEvent;
    if (!keyboard.shiftKey && !keyboard.isComposing) {
      event.preventDefault();
      this.submit();
    }
  }

  protected submit(): void {
    if (!this.canSend() || this.chat.busy()) {
      return;
    }
    const value = this.text.value;
    this.text.setValue('');
    void this.chat.send(value);
  }

  protected reset(): void {
    this.chat.reset();
    this.text.setValue('');
    this.input().nativeElement.focus();
  }

  protected onDragOver(event: DragEvent): void {
    if (event.dataTransfer?.types.includes('Files')) {
      event.preventDefault();
      this.dragging.set(true);
    }
  }

  protected onDragLeave(event: DragEvent): void {
    const zone = event.currentTarget as HTMLElement;
    if (!zone.contains(event.relatedTarget as Node | null)) {
      this.dragging.set(false);
    }
  }

  protected async onDrop(event: DragEvent): Promise<void> {
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length === 0) {
      return;
    }
    event.preventDefault();
    this.dragging.set(false);
    await this.chat.attach(files);
  }

  private setSeo(root: boolean): void {
    const year = new Date().getFullYear();
    const description =
      'AI-асистент для інвесторів: надішліть звіт Interactive Brokers, Freedom Finance чи історію Ledger Live і отримайте декларацію Ф1 (F0121215) з ПДФО та військовим збором, дохідність з урахуванням інфляції, карту податків, спреди й комісії — з графіками та файлами PDF, Excel, XML.';
    inject(SeoService).setPage({
      title: root
        ? `Податковий AI-асистент: декларація Ф1, дохідність, податки ${year}`
        : `Taxered — податковий AI-асистент для інвесторів ${year}`,
      description,
      keywords: [
        'податковий асистент',
        'декларація Ф1',
        'F0121215',
        'F0100215',
        'ПДФО інвестиції',
        'військовий збір',
        'Interactive Brokers',
        'Freedom Finance',
        'дохідність інвестицій',
        'карта податків',
        'Ledger Live',
      ],
      path: root ? '/' : localePath(),
      bareTitle: root,
      alternates: true,
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'WebApplication',
          name: 'Taxered — податковий AI-асистент',
          description,
          url: `${SITE_URL}/${LOCALE}`,
          inLanguage: 'uk',
          applicationCategory: 'FinanceApplication',
          operatingSystem: 'Any',
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'UAH' },
          featureList: [
            'Розрахунок додатка Ф1 (F0121215) за звітами брокерів',
            'Пакет XML для Електронного кабінету ДПС',
            'Реальна дохідність інвестицій з урахуванням інфляції',
            'Карта податків на інвестиційний дохід',
            'Спреди, комісії та портфель Ledger Live',
          ],
        },
      ],
    });
  }
}
