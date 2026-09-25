import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FileSpreadsheet, FileText, HelpCircle, Plus, Trash2, Upload } from 'lucide';
import { map, startWith } from 'rxjs';
import { localePath } from '../../core/site';
import type { BrokerSource } from '../../lib/ib-xml-parser';
import {
  SUPPORTED_CURRENCIES,
  convertToUAH,
  fetchNBUExchangeRate,
  formatExchangeRate,
  getCurrencySymbol,
} from '../../lib/nbu-exchange-rates';
import { Icon } from '../../shared/icon';
import {
  ASSET_TYPES,
  DEFAULT_REPORT_YEAR,
  FinancialPosition,
  REPORT_YEARS,
  calculateTaxes,
  militaryTaxRateLabel,
} from './tax-model';

const ANONYMOUS_VALUE = 'Не вказано';

type PositionGroup = FormGroup<{
  [K in keyof Required<FinancialPosition>]: FormControl<FinancialPosition[K]>;
}>;

function control<T>(value: T): FormControl<T> {
  return new FormControl(value, { nonNullable: true });
}

function positionGroup(p: FinancialPosition): PositionGroup {
  return new FormGroup({
    id: control(p.id),
    assetType: control(p.assetType),
    assetDescription: control(p.assetDescription),
    symbol: control(p.symbol),
    currency: control(p.currency),
    purchaseDate: control(p.purchaseDate),
    saleDate: control(p.saleDate),
    purchasePriceForeign: control(p.purchasePriceForeign),
    salePriceForeign: control(p.salePriceForeign),
    purchaseRate: control(p.purchaseRate),
    saleRate: control(p.saleRate),
    purchasePrice: control(p.purchasePrice),
    salePrice: control(p.salePrice),
    expenses: control(p.expenses),
    quantity: control(p.quantity),
    multiplier: control(p.multiplier),
    source: control<BrokerSource | undefined>(p.source),
    sourceFile: control(p.sourceFile),
  });
}

function hasData(p: FinancialPosition): boolean {
  return !!(
    p.assetType ||
    p.purchasePrice ||
    p.salePrice ||
    p.purchasePriceForeign ||
    p.salePriceForeign
  );
}

@Component({
  selector: 'app-form-f0121214',
  imports: [ReactiveFormsModule, RouterLink, Icon],
  templateUrl: './form-f0121214.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormF0121214 {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly icons = { FileSpreadsheet, FileText, HelpCircle, Plus, Trash2, Upload };
  protected readonly assetTypes = ASSET_TYPES;
  protected readonly years = REPORT_YEARS;
  protected readonly currencies = SUPPORTED_CURRENCIES;
  protected readonly ibGuidePath = localePath('knowledge', 'flex-report-ib');
  protected readonly getCurrencySymbol = getCurrencySymbol;

  private idCounter = 0;
  /** Latest NBU request per position+side, so a slow stale response cannot overwrite a newer one. */
  private readonly rateRequests = new Map<string, number>();

  protected readonly form = new FormGroup({
    fullName: control(''),
    taxNumber: control(''),
    taxOfficeCode: control(''),
    year: control(DEFAULT_REPORT_YEAR),
    notes: control(''),
    anonymous: control(false),
    positions: new FormArray<PositionGroup>([positionGroup(this.emptyPosition())]),
  });

  protected get positions(): FormArray<PositionGroup> {
    return this.form.controls.positions;
  }

  /** Raw form value (including disabled controls) as a signal. */
  protected readonly value = toSignal(
    this.form.valueChanges.pipe(
      startWith(null),
      map(() => this.form.getRawValue()),
    ),
    { requireSync: true },
  );

  protected readonly calculations = computed(() =>
    calculateTaxes(this.value().positions, this.value().year),
  );
  protected readonly militaryRate = computed(() => militaryTaxRateLabel(this.value().year));

  protected readonly importing = signal(false);
  protected readonly importProgress = signal(0);
  protected readonly importStatus = signal('');

  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  constructor() {
    const { fullName, taxNumber, taxOfficeCode, anonymous } = this.form.controls;
    fullName.addValidators(Validators.required);
    taxNumber.addValidators(Validators.required);
    fullName.updateValueAndValidity({ emitEvent: false });
    taxNumber.updateValueAndValidity({ emitEvent: false });

    // Filling anonymously disables (and so stops validating) the identifying fields.
    anonymous.valueChanges.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((isAnonymous) => {
      for (const field of [fullName, taxNumber, taxOfficeCode]) {
        if (isAnonymous) {
          field.disable();
        } else {
          field.enable();
        }
      }
    });
  }

  protected showError(name: 'fullName' | 'taxNumber'): boolean {
    const field = this.form.controls[name];
    return field.invalid && field.touched;
  }

  protected formatRate(rate: string, currency: string): string {
    return formatExchangeRate(parseFloat(rate) || null, currency);
  }

  protected abs(value: number): number {
    return Math.abs(value);
  }

  protected quantity(value: string | undefined): number {
    return value ? parseFloat(value) : 0;
  }

  protected sourceName(source: BrokerSource): string {
    return source === 'interactive_brokers' ? 'IB' : source === 'freedom_finance' ? 'FF' : 'Manual';
  }

  protected sourceClass(source: BrokerSource): string {
    switch (source) {
      case 'interactive_brokers':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100';
      case 'freedom_finance':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100';
    }
  }

  // --- Positions -----------------------------------------------------------

  protected addPosition(): void {
    this.positions.push(positionGroup(this.emptyPosition()));
  }

  protected removePosition(index: number): void {
    if (this.positions.length > 1) {
      this.positions.removeAt(index);
    }
  }

  protected onCurrencyChange(index: number): void {
    const group = this.positions.at(index);
    const { currency, purchaseDate, saleDate } = group.getRawValue();
    if (currency === 'UAH') {
      this.resetToUah(group);
      return;
    }
    if (purchaseDate) {
      this.loadRate(group, 'purchase');
    }
    if (saleDate) {
      this.loadRate(group, 'sale');
    }
  }

  protected onDateChange(index: number, side: 'purchase' | 'sale'): void {
    const group = this.positions.at(index);
    const { currency, purchaseDate, saleDate } = group.getRawValue();
    if (currency === 'UAH') {
      this.resetToUah(group);
      return;
    }
    if (side === 'purchase' ? purchaseDate : saleDate) {
      this.loadRate(group, side);
    }
  }

  /** Recalculate the UAH amount when a foreign-currency amount is typed. */
  protected onForeignAmountInput(index: number, side: 'purchase' | 'sale'): void {
    const group = this.positions.at(index);
    const p = group.getRawValue();
    if (p.currency === 'UAH') {
      return;
    }
    const foreign =
      parseFloat(side === 'purchase' ? p.purchasePriceForeign : p.salePriceForeign) || 0;
    const rate = parseFloat(side === 'purchase' ? p.purchaseRate : p.saleRate) || 1;
    group.controls[side === 'purchase' ? 'purchasePrice' : 'salePrice'].setValue(
      convertToUAH(foreign, rate).toFixed(2),
    );
  }

  private resetToUah(group: PositionGroup): void {
    const p = group.getRawValue();
    group.patchValue({
      purchaseRate: '1',
      saleRate: '1',
      purchasePrice: p.purchasePriceForeign || p.purchasePrice,
      salePrice: p.salePriceForeign || p.salePrice,
    });
  }

  private async loadRate(group: PositionGroup, side: 'purchase' | 'sale'): Promise<void> {
    const p = group.getRawValue();
    const key = `${p.id}:${side}`;
    const request = (this.rateRequests.get(key) ?? 0) + 1;
    this.rateRequests.set(key, request);

    const rate = await fetchNBUExchangeRate(
      side === 'purchase' ? p.purchaseDate : p.saleDate,
      p.currency,
    );
    if (
      rate === null ||
      this.rateRequests.get(key) !== request ||
      !this.positions.controls.includes(group)
    ) {
      return;
    }

    const { controls } = group;
    const [rateControl, foreignControl, uahControl] =
      side === 'purchase'
        ? [controls.purchaseRate, controls.purchasePriceForeign, controls.purchasePrice]
        : [controls.saleRate, controls.salePriceForeign, controls.salePrice];

    rateControl.setValue(rate.toFixed(4));
    // Auto-convert if a foreign amount is already entered.
    if (foreignControl.value) {
      uahControl.setValue(convertToUAH(parseFloat(foreignControl.value), rate).toFixed(2));
    }
  }

  // --- Broker XML import ---------------------------------------------------

  protected triggerFileInput(): void {
    this.fileInput().nativeElement.click();
  }

  protected async importFiles(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) {
      return;
    }

    const existing = this.positions.getRawValue();
    const shouldAppend =
      existing.some(hasData) &&
      window.confirm(
        `У вас вже є ${existing.length} позиція(й).\n\nНатисніть "OK" щоб ДОДАТИ нові дані до існуючих.\nНатисніть "Скасувати" щоб ЗАМІНИТИ всі дані.`,
      );

    this.importing.set(true);
    this.importProgress.set(0);
    this.importStatus.set('Читання файлів...');

    try {
      const { parseAnyBrokerXML, readFileAsText } = await import('../../lib/ib-xml-parser');

      const imported: FinancialPosition[] = [];
      const summaries: {
        source: string;
        trades: number;
        dividends: number;
        profit: number;
        currency: string;
      }[] = [];
      const warnings: string[] = [];
      const totalFiles = files.length;
      const reportYear = parseInt(this.form.controls.year.value) || new Date().getFullYear();

      for (let fileIndex = 0; fileIndex < totalFiles; fileIndex++) {
        const file = files[fileIndex];
        this.importProgress.set((fileIndex / totalFiles) * 40);
        this.importStatus.set(`Читання файлу ${fileIndex + 1}/${totalFiles}: ${file.name}...`);

        const xmlContent = await readFileAsText(file);
        this.importStatus.set(`Парсинг ${file.name}...`);

        const result = parseAnyBrokerXML(xmlContent, file.name, reportYear);
        warnings.push(...(result.warnings ?? []).map((w) => `${file.name}: ${w}`));

        if (result.positions.length === 0) {
          console.warn(`No positions found in file: ${file.name}`);
          continue;
        }

        imported.push(...(result.positions as FinancialPosition[]));
        summaries.push({
          source:
            result.source === 'interactive_brokers' ? 'Interactive Brokers' : 'Freedom Finance',
          trades: result.summary.trades,
          dividends: result.summary.dividends,
          profit: result.summary.totalProfit,
          currency: result.summary.currency,
        });
      }

      if (imported.length === 0) {
        window.alert(
          'Виберіть рік звіту в формі для правильних розрахунків. Або ви завантажили файл без закритих позицій та дивідендів',
        );
        return;
      }

      const all = shouldAppend
        ? [...existing.filter((p) => p.assetType || p.purchasePrice || p.salePrice), ...imported]
        : imported;

      this.importProgress.set(40);
      this.importStatus.set(`Імпортовано ${all.length} позиції(й). Завантаження курсів НБУ...`);

      const updated = [...all];
      const progressPerPosition = 55 / updated.length;
      for (let i = 0; i < updated.length; i++) {
        const position = updated[i];
        this.importProgress.set(40 + (i + 1) * progressPerPosition);
        this.importStatus.set(`Завантаження курсів НБУ... (${i + 1}/${updated.length})`);

        if (position.currency !== 'UAH' && position.saleDate) {
          try {
            updated[i] = await withNbuRates(position);
          } catch (error) {
            console.error(`Error fetching rates for position ${position.id}:`, error);
          }
        }
      }

      this.importProgress.set(95);
      this.importStatus.set('Фінальні розрахунки...');
      this.replacePositions(updated);

      this.importProgress.set(100);
      this.importStatus.set('Завершено!');

      const summaryText = summaries
        .map(
          (s) =>
            `${s.source}: ${s.trades} трейдів${s.dividends > 0 ? `, ${s.dividends} дивідендів` : ''} (${s.profit >= 0 ? '+' : ''}${s.profit.toFixed(2)} ${s.currency})`,
        )
        .join('\n');
      const modeText = shouldAppend ? '(додано до існуючих)' : '(замінено)';
      const warningsText =
        warnings.length > 0 ? '\n\n⚠️ ПОПЕРЕДЖЕННЯ:\n' + warnings.join('\n') : '';

      // Let the progress bar reach 100% before the blocking alert.
      await new Promise((resolve) => setTimeout(resolve, 500));
      window.alert(
        `✅ Успішно імпортовано ${imported.length} позиції(й) з ${totalFiles} файл(ів) ${modeText}!\n\n` +
          (shouldAppend ? `Загалом позицій: ${all.length}\n\n` : '') +
          summaryText +
          '\n\nКурси НБУ завантажено та суми конвертовано в гривні.' +
          warningsText,
      );
    } catch (error) {
      console.error('Error importing XML:', error);
      window.alert(
        `Помилка при імпорті файлу: ${error instanceof Error ? error.message : 'Невідома помилка'}`,
      );
    } finally {
      this.importing.set(false);
      this.importProgress.set(0);
      this.importStatus.set('');
      input.value = '';
    }
  }

  private replacePositions(positions: FinancialPosition[]): void {
    this.positions.clear({ emitEvent: false });
    for (const position of positions) {
      this.positions.push(positionGroup(position), { emitEvent: false });
    }
    this.positions.updateValueAndValidity();
  }

  // --- Export --------------------------------------------------------------

  protected async generatePdf(): Promise<void> {
    if (!this.validateIdentity()) {
      return;
    }
    const { generateF0121214PDF } = await import('../../lib/pdf-generator');
    const v = this.form.getRawValue();
    await generateF0121214PDF(
      {
        ...this.identity(),
        year: v.year,
        notes: v.notes,
        positions: v.positions,
        calculations: this.calculations(),
      },
      'uk',
    );
  }

  protected async exportExcel(): Promise<void> {
    if (!this.validateIdentity()) {
      return;
    }
    const { generateTaxCalculationExcel } = await import('../../lib/excel-generator');
    const v = this.form.getRawValue();
    generateTaxCalculationExcel(
      {
        ...this.identity(),
        year: v.year,
        positions: v.positions,
        calculations: this.calculations(),
      },
      'uk',
    );
  }

  protected clear(): void {
    this.form.reset({
      fullName: '',
      taxNumber: '',
      taxOfficeCode: '',
      year: DEFAULT_REPORT_YEAR,
      notes: '',
      anonymous: false,
    });
    this.replacePositions([this.emptyPosition()]);
  }

  private identity(): { fullName: string; taxNumber: string } {
    const v = this.form.getRawValue();
    return v.anonymous
      ? { fullName: ANONYMOUS_VALUE, taxNumber: ANONYMOUS_VALUE }
      : { fullName: v.fullName, taxNumber: v.taxNumber };
  }

  /** Name and tax ID are required unless filling anonymously; focuses the first missing field. */
  private validateIdentity(): boolean {
    if (this.form.valid) {
      return true;
    }
    this.form.markAllAsTouched();
    const { fullName, taxNumber } = this.form.controls;
    const firstInvalid = fullName.invalid ? 'fullName' : taxNumber.invalid ? 'taxNumber' : null;
    if (firstInvalid) {
      this.host.nativeElement.querySelector<HTMLElement>(`#${firstInvalid}`)?.focus();
    }
    return false;
  }

  private emptyPosition(): FinancialPosition {
    return {
      id: `position-${this.idCounter++}`,
      assetType: '',
      currency: 'UAH',
      purchaseDate: '',
      saleDate: '',
      purchasePriceForeign: '',
      salePriceForeign: '',
      purchaseRate: '1',
      saleRate: '1',
      purchasePrice: '',
      salePrice: '',
      expenses: '',
      quantity: '',
      multiplier: '1',
    };
  }
}

/**
 * Fetch NBU rates for an imported position and convert its amounts to UAH.
 * Dividends only need the payment-date rate.
 */
async function withNbuRates(position: FinancialPosition): Promise<FinancialPosition> {
  let result = position;

  if (position.assetType !== 'dividends' && position.purchaseDate) {
    const purchaseRate = await fetchNBUExchangeRate(position.purchaseDate, position.currency);
    if (purchaseRate !== null) {
      result = {
        ...result,
        purchaseRate: purchaseRate.toFixed(4),
        purchasePrice: convertToUAH(
          parseFloat(position.purchasePriceForeign) || 0,
          purchaseRate,
        ).toFixed(2),
      };
    }
  }

  const saleRate = await fetchNBUExchangeRate(position.saleDate, position.currency);
  if (saleRate !== null) {
    result = {
      ...result,
      saleRate: saleRate.toFixed(4),
      salePrice: convertToUAH(parseFloat(position.salePriceForeign) || 0, saleRate).toFixed(2),
    };
  }

  return result;
}
