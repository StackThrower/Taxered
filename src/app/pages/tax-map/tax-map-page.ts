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
import { Info } from 'lucide';
import { UK } from '../../core/i18n';
import { SeoService } from '../../core/seo.service';
import { SITE_URL, localePath } from '../../core/site';
import { Icon } from '../../shared/icon';
import {
  BASELINE_CODE,
  COUNTRIES,
  CountryTax,
  DATA_UPDATED,
  METRICS,
  Metric,
  RATE_BINS,
  REGIONS,
  Region,
  countriesIn,
  flagOf,
  formatRate,
  getCountry,
  rateBin,
} from './tax-data';

const s = UK.taxMap;
const BASELINE = getCountry(BASELINE_CODE)!;
/** Rates are drawn on a 0–55% scale in the comparison bars. */
const BAR_MAX = 55;

const usd = new Intl.NumberFormat('uk-UA', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const shortRate = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 1 });

interface Tile {
  country: CountryTax;
  rate: number;
  text: string;
  bg: string;
  fg: string;
  label: string;
}

@Component({
  selector: 'app-tax-map-page',
  imports: [ReactiveFormsModule, Icon],
  templateUrl: './tax-map-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaxMapPage {
  protected readonly s = s;
  protected readonly icons = { Info };
  protected readonly regions = REGIONS;
  protected readonly metrics = METRICS;
  protected readonly bins = RATE_BINS;
  protected readonly baseline = BASELINE;
  protected readonly flagOf = flagOf;
  protected readonly formatRate = formatRate;
  protected readonly disclaimer = s.disclaimer.map((line) => line.replace('{date}', DATA_UPDATED));

  protected readonly region = signal<Region>('europe');
  protected readonly metric = signal<Metric>('dividends');
  protected readonly selectedCode = signal(BASELINE_CODE);

  protected readonly amountControl = new FormControl('10000', { nonNullable: true });
  private readonly amountValue = toSignal(this.amountControl.valueChanges, {
    initialValue: this.amountControl.value,
  });
  protected readonly amount = computed(() => {
    const value = Number(this.amountValue().replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(value) && value > 0 ? value : 0;
  });

  private readonly detailHeading = viewChild.required<ElementRef<HTMLElement>>('detailHeading');

  protected readonly countries = computed(() => countriesIn(this.region()));

  protected readonly grid = computed(() => {
    const list = this.countries();
    return {
      cols: Math.max(...list.map((c) => c.col)),
      rows: Math.max(...list.map((c) => c.row)),
    };
  });

  protected readonly tiles = computed<Tile[]>(() => {
    const metric = this.metric();
    return this.countries().map((country) => {
      const rate = country.rates[metric];
      const bin = rateBin(rate);
      return {
        country,
        rate,
        text: `${shortRate.format(rate)}%`,
        bg: bin.bg,
        fg: bin.fg,
        label: `${country.name}: ${formatRate(rate)}${country.regime ? `, ${s.regimeMark}` : ''}`,
      };
    });
  });

  protected readonly mapLabel = computed(() =>
    s.mapLabel
      .replace('{region}', s.regions[this.region()])
      .replace('{metric}', s.metrics[this.metric()]),
  );

  protected readonly selected = computed(() => getCountry(this.selectedCode()) ?? BASELINE);

  protected readonly comparison = computed(() => {
    const country = this.selected();
    const amount = this.amount();
    return METRICS.map((metric) => {
      const rate = country.rates[metric];
      const base = BASELINE.rates[metric];
      const diffTax = (amount * (rate - base)) / 100;
      return {
        metric,
        label: s.metrics[metric],
        rate,
        base,
        bin: rateBin(rate),
        width: Math.min(rate, BAR_MAX) / BAR_MAX,
        baseWidth: Math.min(base, BAR_MAX) / BAR_MAX,
        tax: usd.format((amount * rate) / 100),
        diff:
          rate === base
            ? s.same
            : `${usd.format(Math.abs(diffTax))} ${rate < base ? s.cheaper : s.pricier}`,
        better: rate < base,
        worse: rate > base,
      };
    });
  });

  protected readonly barsHint = computed(() =>
    s.barsHint.replace('{country}', this.selected().name).replace('{baseline}', BASELINE.name),
  );

  /** Announced to screen readers when another country is selected. */
  protected readonly liveSummary = computed(() => {
    const country = this.selected();
    const rates = METRICS.map((m) => `${s.metrics[m]} ${formatRate(country.rates[m])}`);
    return `${country.name}: ${rates.join(', ')}`;
  });

  protected readonly ranking = computed(() => {
    const metric = this.metric();
    return [...this.countries()].sort(
      (a, b) => a.rates[metric] - b.rates[metric] || a.name.localeCompare(b.name, 'uk'),
    );
  });

  protected readonly tableCaption = computed(() =>
    s.tableCaption
      .replace('{region}', s.regions[this.region()])
      .replace('{metric}', s.metrics[this.metric()]),
  );

  constructor() {
    this.setSeo();
  }

  protected select(code: string): void {
    this.selectedCode.set(code);
  }

  /** From the ranking table: select and move focus to the details so the change is noticed. */
  protected selectAndShow(code: string): void {
    this.selectedCode.set(code);
    const heading = this.detailHeading().nativeElement;
    heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
    heading.focus({ preventScroll: true });
  }

  protected binFor(rate: number) {
    return rateBin(rate);
  }

  private setSeo(): void {
    const path = localePath('tax-map');
    const url = `${SITE_URL}${path}`;
    inject(SeoService).setPage({
      title: `Податки на інвестиції у світі ${new Date().getFullYear()}: карта для релокації`,
      description: `Інтерактивна карта податків на дивіденди, приріст капіталу та відсотки у ${COUNTRIES.length} країнах Європи, Азії та Америки. Порівняння з Україною та пільгові режими для нових резидентів.`,
      keywords: [
        'податки на інвестиції',
        'податок на дивіденди',
        'податок на приріст капіталу',
        'релокація інвестора',
        'країни без податків',
        'non-dom',
        'податкове резидентство',
        'карта податків',
      ],
      path,
      alternates: true,
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: s.title,
          description: s.subtitle,
          url,
          inLanguage: 'uk',
          isPartOf: { '@type': 'WebSite', name: 'Taxered Tax Declaration', url: SITE_URL },
        },
        {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}${localePath()}` },
            { '@type': 'ListItem', position: 2, name: s.title, item: url },
          ],
        },
      ],
    });
  }
}
