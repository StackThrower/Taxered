/**
 * Income from sources outside Ukraine other than investment profit: declaration row 10.10.
 * Gross amount (before foreign withholding) at the NBU rate of the accrual date; PDFO 9% on
 * dividends from non-residents (pp. 167.5.4), 18% on interest, coupons and other foreign income
 * (pp. 170.11.1); military levy on all of it.
 */
import type { FinancialPosition } from '../../declaration/f0121214/tax-model';
import { applyRate, sumKopecks, toKopecks, type Kopecks } from './money';
import { RATE_BP, militaryLevyBp } from './versions';

export type ForeignIncomePosition = Pick<FinancialPosition, 'assetType' | 'salePrice'> &
  Partial<FinancialPosition>;

export interface ForeignIncome {
  dividends: Kopecks;
  /** Interest, coupons and other foreign income taxed at 18%. */
  other: Kopecks;
  /** Column 3 of row 10.10. */
  total: Kopecks;
  /** Column 6. */
  pdfo: Kopecks;
  /** Column 7. */
  militaryLevy: Kopecks;
  /** Column 2: "country, ...; currency, ...". */
  sourcesText: string;
  warnings: string[];
}

export function isForeignIncome(p: Pick<FinancialPosition, 'assetType'>): boolean {
  return p.assetType === 'dividends' || p.assetType === 'interest';
}

export function computeForeignIncome(
  positions: readonly ForeignIncomePosition[],
  year: number,
): ForeignIncome {
  const items = positions.filter((p) => isForeignIncome(p) && toKopecks(p.salePrice) > 0);
  const dividends = sumKopecks(
    items.filter((p) => p.assetType === 'dividends').map((p) => toKopecks(p.salePrice)),
  );
  const other = sumKopecks(
    items.filter((p) => p.assetType === 'interest').map((p) => toKopecks(p.salePrice)),
  );
  const total = dividends + other;

  const countries = new Set<string>();
  const currencies = new Set<string>();
  let unknownCountry = 0;
  for (const p of items) {
    const country = p.country?.trim() || countryByIsin(p.isin);
    if (country) {
      countries.add(country);
    } else {
      unknownCountry++;
    }
    currencies.add(currencyName(p.currency || 'UAH'));
  }

  const warnings: string[] = [];
  if (unknownCountry > 0) {
    warnings.push(
      `Для ${unknownCountry} виплат не вдалося визначити країну джерела (немає ISIN) — вкажіть країну в рядку, щоб заповнити графу 2 рядка 10.10.`,
    );
  }

  return {
    dividends,
    other,
    total,
    pdfo: applyRate(dividends, RATE_BP.pdfoDividends) + applyRate(other, RATE_BP.pdfo),
    militaryLevy: applyRate(total, militaryLevyBp(year)),
    sourcesText: [[...countries].join(', '), [...currencies].join(', ')].filter(Boolean).join('; '),
    warnings,
  };
}

const CURRENCY_NAMES: Record<string, string> = {
  USD: 'долар США',
  EUR: 'євро',
  GBP: 'фунт стерлінгів',
  PLN: 'злотий',
  CHF: 'швейцарський франк',
  CAD: 'канадський долар',
  JPY: 'єна',
  CNY: 'юань женьміньбі',
  HKD: 'гонконгський долар',
  AUD: 'австралійський долар',
  SEK: 'шведська крона',
  NOK: 'норвезька крона',
  DKK: 'данська крона',
  CZK: 'чеська крона',
  UAH: 'гривня',
};

export function currencyName(code: string): string {
  return CURRENCY_NAMES[code.toUpperCase()] ?? code.toUpperCase();
}

/** Issuer country from the first two letters of the ISIN (ISO 3166-1). */
const ISIN_COUNTRIES: Record<string, string> = {
  US: 'США',
  IE: 'Ірландія',
  GB: 'Велика Британія',
  DE: 'Німеччина',
  NL: 'Нідерланди',
  LU: 'Люксембург',
  FR: 'Франція',
  CH: 'Швейцарія',
  CA: 'Канада',
  JP: 'Японія',
  CN: 'Китай',
  HK: 'Гонконг',
  TW: 'Тайвань',
  KR: 'Республіка Корея',
  IL: 'Ізраїль',
  AU: 'Австралія',
  SE: 'Швеція',
  NO: 'Норвегія',
  DK: 'Данія',
  FI: 'Фінляндія',
  ES: 'Іспанія',
  IT: 'Італія',
  BE: 'Бельгія',
  AT: 'Австрія',
  PL: 'Польща',
  CZ: 'Чехія',
  CY: 'Кіпр',
  KY: 'Кайманові острови',
  BM: 'Бермудські острови',
  JE: 'Джерсі',
  GG: 'Гернсі',
  SG: 'Сінгапур',
  BR: 'Бразилія',
  IN: 'Індія',
  KZ: 'Казахстан',
  UA: 'Україна',
};

export function countryByIsin(isin: string | undefined): string {
  return isin ? (ISIN_COUNTRIES[isin.slice(0, 2).toUpperCase()] ?? '') : '';
}
