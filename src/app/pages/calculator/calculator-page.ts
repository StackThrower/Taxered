import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AlertCircle, FileText, LineChart as LineChartIcon, Plus, Trash2, Upload, X } from 'lucide';
import { map, startWith } from 'rxjs';
import { UK } from '../../core/i18n';
import { SeoService } from '../../core/seo.service';
import { SITE_URL, localePath } from '../../core/site';
import {
  FIRST_INFLATION_YEAR,
  PRELIMINARY_INFLATION_YEAR,
  inflationFor,
} from '../../lib/inflation';
import { fetchYearEndUSDRate } from '../../lib/nbu-exchange-rates';
import { Icon } from '../../shared/icon';
import { BarChart } from './bar-chart';
import { ChartSeries } from './chart-utils';
import { LineChart } from './line-chart';
import { DisplayCurrency, FileIncome, YearInput, analyzeReturns } from './returns-model';

const CURRENT_YEAR = new Date().getFullYear();

type YearGroup = FormGroup<{
  year: FormControl<number>;
  deposits: FormControl<string>;
  inflation: FormControl<string>;
}>;

function control<T>(value: T): FormControl<T> {
  return new FormControl(value, { nonNullable: true });
}

@Component({
  selector: 'app-calculator-page',
  imports: [ReactiveFormsModule, RouterLink, Icon, BarChart, LineChart],
  templateUrl: './calculator-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalculatorPage {
  protected readonly s = UK.calculator;
  protected readonly icons = { AlertCircle, FileText, LineChartIcon, Plus, Trash2, Upload, X };
  protected readonly ibGuidePath = localePath('knowledge', 'flex-report-ib');
  protected readonly preliminaryYear = PRELIMINARY_INFLATION_YEAR;

  protected readonly settings = new FormGroup({
    currency: control<DisplayCurrency>('USD'),
    initialCapital: control(''),
    includeTaxes: control(true),
  });
  protected readonly years = new FormArray<YearGroup>([]);
  protected readonly yearToAdd = control(CURRENT_YEAR - 1);

  /** Imported reports per year. */
  protected readonly files = signal<Record<number, readonly FileIncome[]>>({});
  /** Import errors per year (unreadable or duplicate files). */
  protected readonly errors = signal<Record<number, readonly string[]>>({});
  protected readonly importStatus = signal<{ year: number; text: string } | null>(null);
  /** NBU UAH per USD at the end of each year, for the exchange-rate difference. */
  private readonly usdRates = signal<Record<number, number | null>>({});
  private readonly requestedRates = new Set<number>();
  private uploadYear = 0;

  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  private readonly settingsValue = toSignal(
    this.settings.valueChanges.pipe(map(() => this.settings.getRawValue())),
    { initialValue: this.settings.getRawValue() },
  );
  private readonly yearsValue = toSignal(
    this.years.valueChanges.pipe(
      startWith(null),
      map(() => this.years.getRawValue()),
    ),
    { requireSync: true },
  );

  protected readonly currency = computed(() => this.settingsValue().currency);
  protected readonly addedYears = computed(() => this.yearsValue().map((y) => y.year));
  protected readonly availableYears = computed(() => {
    const added = new Set(this.addedYears());
    const years: number[] = [];
    for (let year = CURRENT_YEAR; year >= FIRST_INFLATION_YEAR; year--) {
      if (!added.has(year)) {
        years.push(year);
      }
    }
    return years;
  });
  protected readonly hasData = computed(() =>
    Object.values(this.files()).some((list) => list.length > 0),
  );

  protected readonly analysis = computed(() => {
    const files = this.files();
    const { currency, initialCapital, includeTaxes } = this.settingsValue();
    const years: YearInput[] = this.yearsValue().map((y) => ({
      year: y.year,
      files: files[y.year] ?? [],
      deposits: parseFloat(y.deposits) || 0,
      inflation: parseFloat(y.inflation) || 0,
    }));
    return analyzeReturns(years, {
      currency,
      initialCapital: Math.max(0, parseFloat(initialCapital) || 0),
      includeTaxes,
      usdRates: this.usdRates(),
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
  private readonly percentFormat = new Intl.NumberFormat('uk', {
    maximumFractionDigits: 1,
    signDisplay: 'exceptZero',
  });

  protected readonly money = computed(() => {
    const f = this.moneyFormat();
    return (value: number) => f.format(value);
  });
  protected readonly signedMoney = computed(() => {
    const f = this.moneyFormat();
    return (value: number) => (value > 0 ? '+' : '') + f.format(value);
  });
  protected readonly compactMoney = computed(() => {
    const f = this.compactFormat();
    return (value: number) => f.format(value);
  });
  protected readonly percent = (value: number | null) =>
    value === null ? '—' : `${this.percentFormat.format(value)} %`;
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

  constructor() {
    this.addYear(CURRENT_YEAR - 1);

    // Each currency has its own inflation; switching resets the per-year values to its defaults.
    this.settings.controls.currency.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((currency) => {
        for (const group of this.years.controls) {
          group.controls.inflation.setValue(
            String(inflationFor(currency, group.controls.year.value)),
          );
        }
      });

    // Year-end rates from the year before the first one (the starting rate) to the last.
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      effect(() => {
        const years = this.addedYears();
        if (years.length > 0) {
          untracked(() => this.loadRates(Math.min(...years) - 1, Math.max(...years)));
        }
      });
    }

    this.setSeo();
  }

  private loadRates(from: number, to: number): void {
    for (let year = from; year <= to; year++) {
      if (this.requestedRates.has(year)) {
        continue;
      }
      this.requestedRates.add(year);
      fetchYearEndUSDRate(year).then((rate) => {
        this.usdRates.update((rates) => ({ ...rates, [year]: rate }));
        if (rate === null) {
          this.requestedRates.delete(year);
        }
      });
    }
  }

  protected addYear(year = this.yearToAdd.value): void {
    const value = Number(year);
    if (this.addedYears().includes(value)) {
      return;
    }
    const group: YearGroup = new FormGroup({
      year: control(value),
      deposits: control(''),
      inflation: control(String(inflationFor(this.settings.controls.currency.value, value))),
    });
    const index = this.years.controls.findIndex((g) => g.controls.year.value > value);
    if (index === -1) {
      this.years.push(group);
    } else {
      this.years.insert(index, group);
    }
    const next = this.availableYears()[0];
    if (next !== undefined) {
      this.yearToAdd.setValue(next);
    }
  }

  protected removeYear(index: number): void {
    const year = this.years.at(index).controls.year.value;
    this.years.removeAt(index);
    this.files.update(({ [year]: _, ...rest }) => rest);
    this.errors.update(({ [year]: _, ...rest }) => rest);
  }

  protected removeFile(year: number, name: string): void {
    this.files.update((all) => ({
      ...all,
      [year]: (all[year] ?? []).filter((f) => f.name !== name),
    }));
  }

  protected chooseFiles(year: number): void {
    this.uploadYear = year;
    this.fileInput().nativeElement.click();
  }

  protected async importFiles(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const year = this.uploadYear;
    const chosen = Array.from(input.files ?? []);
    input.value = '';
    if (chosen.length === 0) {
      return;
    }

    const errors: string[] = [];
    this.importStatus.set({ year, text: `${this.s.importing}…` });
    try {
      const { importBrokerReport } = await import('./broker-import');

      for (const [i, file] of chosen.entries()) {
        if ((this.files()[year] ?? []).some((f) => f.name === file.name)) {
          errors.push(`${file.name}: ${this.s.duplicateFile}`);
          continue;
        }
        try {
          const income = await importBrokerReport(file, year, (done, total) =>
            this.importStatus.set({
              year,
              text: `${this.s.importing} ${file.name} (${i + 1}/${chosen.length}): ${done}/${total}`,
            }),
          );
          this.files.update((all) => ({ ...all, [year]: [...(all[year] ?? []), income] }));
        } catch (error) {
          errors.push(
            `${this.s.importFailed} ${file.name}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    } finally {
      this.errors.update((all) => ({ ...all, [year]: errors }));
      this.importStatus.set(null);
    }
  }

  protected sourceName(file: FileIncome): string {
    return file.source === 'interactive_brokers' ? 'IB' : 'Freedom';
  }

  protected fileIncome(file: FileIncome): number {
    return this.currency() === 'UAH'
      ? file.tradesUah + file.dividendsUah
      : file.tradesUsd + file.dividendsUsd;
  }

  private setSeo(): void {
    const title = UK.calculator.title;
    const url = `${SITE_URL}${localePath('calculator')}`;
    inject(SeoService).setPage({
      title: `Калькулятор дохідності інвестицій з урахуванням інфляції ${CURRENT_YEAR} | Taxered`,
      description:
        'Безкоштовний калькулятор реальної дохідності інвестицій за звітами Interactive Brokers та Freedom Finance. Дохідність за роками, податки, інфляція та крива капіталу.',
      keywords: [
        'калькулятор дохідності',
        'реальна дохідність',
        'інфляція',
        'Interactive Brokers',
        'Freedom Finance',
        'крива капіталу',
        'дохідність інвестицій',
        'ПДФО інвестиції',
      ],
      path: localePath('calculator'),
      alternates: true,
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'WebApplication',
          name: title,
          description: UK.calculator.subtitle,
          url,
          inLanguage: 'uk',
          applicationCategory: 'FinanceApplication',
          operatingSystem: 'Any',
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
          isPartOf: { '@type': 'WebSite', name: 'Taxered Tax Declaration', url: SITE_URL },
        },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}${localePath()}` },
            { '@type': 'ListItem', position: 2, name: title, item: url },
          ],
        },
      ],
    });
  }
}
