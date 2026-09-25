import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { AlertCircle, Briefcase, Calculator, TrendingUp } from 'lucide';
import { UK } from '../../core/i18n';
import { SeoService } from '../../core/seo.service';
import { SITE_URL, localePath } from '../../core/site';
import {
  CALCULATOR_COUNTRIES,
  CURRENCY_SYMBOLS,
  CalculatorCountry,
  IncomeType,
  taxCalculations,
} from '../../lib/tax-calculations';
import { Icon } from '../../shared/icon';

const INCOME_TYPES: IncomeType[] = ['salary', 'investment'];

@Component({
  selector: 'app-calculator-page',
  imports: [ReactiveFormsModule, Icon],
  templateUrl: './calculator-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalculatorPage {
  protected readonly s = UK.calculator;
  protected readonly countryNames = UK.country;
  protected readonly countries = CALCULATOR_COUNTRIES;
  protected readonly incomeTypes = INCOME_TYPES;
  protected readonly icons = { AlertCircle, Briefcase, Calculator, TrendingUp };

  protected readonly income = new FormControl('100000', { nonNullable: true });
  protected readonly country = new FormControl<CalculatorCountry>('ua', { nonNullable: true });
  protected readonly incomeType = signal<IncomeType>('salary');

  private readonly selectedCountry = toSignal(this.country.valueChanges, {
    initialValue: this.country.value,
  });
  /** Income value used for the last calculation; `null` means no result is shown. */
  private readonly calculatedIncome = signal<number | null>(null);

  protected readonly currency = computed(() => CURRENCY_SYMBOLS[this.selectedCountry()]);

  // Recalculates automatically when the income type or country changes after a first calculation.
  protected readonly result = computed(() => {
    const income = this.calculatedIncome();
    if (income === null) {
      return null;
    }
    const result = taxCalculations[this.selectedCountry()](income, this.incomeType());
    return { ...result, income, effectiveRate: ((result.totalTax / income) * 100).toFixed(2) };
  });

  private readonly numberFormat = new Intl.NumberFormat('uk', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  constructor() {
    const title = UK.calculator.title;
    const url = `${SITE_URL}${localePath('calculator')}`;
    inject(SeoService).setPage({
      title: `Податковий калькулятор ${new Date().getFullYear()} - Розрахунок податків онлайн | Taxered`,
      description:
        'Безкоштовний онлайн калькулятор податків для України та інших країн. Розрахуйте ПДФО, військовий збір, податок на інвестиції. Порівняйте ставки податків у різних країнах.',
      keywords: [
        'податковий калькулятор',
        'розрахунок податків',
        'ПДФО калькулятор',
        'військовий збір',
        'податок на інвестиції',
        'податки Україна',
        'онлайн калькулятор',
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

  protected calculate(): void {
    const income = parseFloat(this.income.value);
    this.calculatedIncome.set(isNaN(income) || income <= 0 ? null : income);
  }

  protected reset(): void {
    this.income.setValue('');
    this.calculatedIncome.set(null);
  }

  protected format(value: number): string {
    return this.numberFormat.format(value);
  }

  /** Arrow-key navigation between the income-type tabs (WAI-ARIA tabs pattern). */
  protected onTabKeydown(event: KeyboardEvent, tablist: HTMLElement): void {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') {
      return;
    }
    event.preventDefault();
    const next = this.incomeType() === 'salary' ? 'investment' : 'salary';
    this.incomeType.set(next);
    tablist.querySelector<HTMLElement>(`#income-tab-${next}`)?.focus();
  }
}
