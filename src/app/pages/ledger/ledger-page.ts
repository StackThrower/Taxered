import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { AlertCircle, FileText, Info, Upload } from 'lucide';
import { UK } from '../../core/i18n';
import { SeoService } from '../../core/seo.service';
import { SITE_URL, localePath } from '../../core/site';
import {
  LedgerAnalysis,
  LedgerOperation,
  Swap,
  analyzeLedger,
  isLedgerCsv,
  parseLedgerCsv,
  spreadsByPair,
} from '../../lib/ledger-csv';
import { Icon } from '../../shared/icon';
import { ledgerFormatters } from './format';
import { LedgerPortfolio } from './ledger-portfolio';

@Component({
  selector: 'app-ledger-page',
  imports: [ReactiveFormsModule, Icon, LedgerPortfolio],
  templateUrl: './ledger-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LedgerPage {
  protected readonly s = UK.ledger;
  protected readonly icons = { AlertCircle, FileText, Info, Upload };

  protected readonly fileName = signal<string | null>(null);
  protected readonly operations = signal<LedgerOperation[]>([]);
  protected readonly analysis = signal<LedgerAnalysis | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly reading = signal(false);
  protected readonly dragging = signal(false);

  protected readonly includeLinked = new FormControl(true, { nonNullable: true });
  protected readonly includeLinkedValue = toSignal(this.includeLinked.valueChanges, {
    initialValue: true,
  });

  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  protected readonly swaps = computed<Swap[]>(() => {
    const swaps = this.analysis()?.swaps ?? [];
    return this.includeLinkedValue() ? swaps : swaps.filter((swap) => swap.kind === 'tx');
  });

  protected readonly linkedCount = computed(
    () => this.analysis()?.swaps.filter((swap) => swap.kind === 'linked').length ?? 0,
  );

  protected readonly pairs = computed(() => spreadsByPair(this.swaps()));

  protected readonly totals = computed(() => {
    const swaps = this.swaps();
    const given = swaps.reduce((sum, swap) => sum + swap.givenValue, 0);
    const received = swaps.reduce((sum, swap) => sum + swap.receivedValue, 0);
    const spread = given - received;
    return {
      given,
      received,
      spread,
      spreadPercent: given > 0 ? (spread / given) * 100 : 0,
      fee: swaps.reduce((sum, swap) => sum + swap.fee, 0),
    };
  });

  protected readonly feeTransactions = computed(
    () => this.analysis()?.fees.reduce((sum, fee) => sum + fee.transactions, 0) ?? 0,
  );

  protected readonly formatters = computed(() => ledgerFormatters(this.analysis()?.fiat || 'USD'));

  protected readonly methodNotes = computed(() => {
    const fiat = this.analysis()?.fiat || 'USD';
    return this.s.method.map((note) => note.replace('{fiat}', fiat));
  });

  constructor() {
    const url = `${SITE_URL}${localePath('ledger')}`;
    inject(SeoService).setPage({
      title: 'Спреди та комісії Ledger Live — аналіз історії операцій',
      description:
        'Завантажте CSV-історію операцій Ledger Live і дізнайтеся, скільки ви втратили на спредах обмінів та комісіях мережі. Файл обробляється лише у вашому браузері.',
      keywords: [
        'Ledger Live',
        'Ledger CSV',
        'спред обміну',
        'комісія мережі',
        'gas fee',
        'swap',
        'криптовалюта',
        'історія операцій',
      ],
      path: localePath('ledger'),
      alternates: true,
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'WebApplication',
          name: UK.ledger.title,
          description: UK.ledger.subtitle,
          url,
          inLanguage: 'uk',
          applicationCategory: 'FinanceApplication',
          operatingSystem: 'Any',
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'UAH' },
        },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}${localePath()}` },
            { '@type': 'ListItem', position: 2, name: UK.ledger.title, item: url },
          ],
        },
      ],
    });
  }

  protected chooseFile(): void {
    this.fileInput().nativeElement.click();
  }

  protected async onFileChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) {
      await this.load(file);
    }
  }

  protected onDragOver(event: DragEvent): void {
    if (event.dataTransfer?.types.includes('Files')) {
      event.preventDefault();
      this.dragging.set(true);
    }
  }

  /** Ignores leaving into a child of the drop zone. */
  protected onDragLeave(event: DragEvent): void {
    const zone = event.currentTarget as HTMLElement;
    if (!zone.contains(event.relatedTarget as Node | null)) {
      this.dragging.set(false);
    }
  }

  protected async onDrop(event: DragEvent): Promise<void> {
    const file = event.dataTransfer?.files[0];
    if (!file) {
      return;
    }
    event.preventDefault();
    this.dragging.set(false);
    await this.load(file);
  }

  private async load(file: File): Promise<void> {
    this.reading.set(true);
    this.error.set(null);
    try {
      const content = await file.text();
      if (!isLedgerCsv(content)) {
        throw new Error(this.s.notLedger);
      }
      const operations = parseLedgerCsv(content);
      const analysis = analyzeLedger(operations);
      if (analysis.operations === 0) {
        throw new Error(this.s.empty);
      }
      this.fileName.set(file.name);
      this.operations.set(operations);
      this.analysis.set(analysis);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.error.set(`${this.s.readFailed} ${file.name}: ${message}`);
    } finally {
      this.reading.set(false);
    }
  }
}
