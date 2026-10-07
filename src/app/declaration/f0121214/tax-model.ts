import type { BrokerSource } from '../../lib/ib-xml-parser';

export type AssetType =
  '' | 'stocks' | 'bonds' | 'options' | 'dividends' | 'crypto' | 'real_estate' | 'other';

export const ASSET_TYPES: { value: Exclude<AssetType, ''>; label: string }[] = [
  { value: 'stocks', label: 'Акції' },
  { value: 'bonds', label: 'Облігації' },
  { value: 'options', label: 'Опціони' },
  { value: 'dividends', label: 'Дивіденди' },
  { value: 'crypto', label: 'Крипто активи' },
  { value: 'real_estate', label: 'Нерухоме майно' },
  { value: 'other', label: 'Інше' },
];

export const REPORT_YEARS = ['2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026'];
export const DEFAULT_REPORT_YEAR = '2026';

/** One closed position or dividend payment. Amounts are kept as the strings the inputs hold. */
export interface FinancialPosition {
  id: string;
  assetType: string;
  assetDescription?: string;
  symbol?: string;
  currency: string;
  purchaseDate: string;
  saleDate: string;
  purchasePriceForeign: string;
  salePriceForeign: string;
  purchaseRate: string;
  saleRate: string;
  purchasePrice: string;
  salePrice: string;
  expenses: string;
  quantity?: string;
  multiplier?: string;
  source?: BrokerSource;
  sourceFile?: string;
}

export interface TaxCalculations {
  profit: number;
  pdfo: number;
  militaryTax: number;
  total: number;
  profitFromTrades: number;
  dividends: number;
  pdfoFromTrades: number;
  pdfoFromDividends: number;
  militaryTaxFromTrades: number;
  militaryTaxFromDividends: number;
  /** Exchange-rate part of the trade profit, already included in `profitFromTrades`. */
  fxDifference: number;
  /** PDFO and military levy that the exchange-rate difference adds (negative if it lowers them). */
  taxOnFx: number;
}

type TaxablePosition = Pick<
  FinancialPosition,
  'assetType' | 'purchasePrice' | 'salePrice' | 'expenses'
> &
  Partial<
    Pick<FinancialPosition, 'currency' | 'purchasePriceForeign' | 'purchaseRate' | 'saleRate'>
  >;

/** Military levy: 1.5% for report years up to 2024, 5% from 2025. */
export function militaryTaxRate(year: string): number {
  const reportYear = parseInt(year) || 2026;
  return reportYear >= 2025 ? 0.05 : 0.015;
}

/** Rate for display, e.g. "5" or "1.5". */
export function militaryTaxRateLabel(year: string): string {
  return militaryTaxRate(year) === 0.05 ? '5' : '1.5';
}

/**
 * Trades: 18% PDFO + military levy on the net profit (losses offset gains).
 * Dividends: reduced 9% PDFO + military levy on the amount received.
 */
export function calculateTaxes(
  positions: readonly TaxablePosition[],
  year: string,
): TaxCalculations {
  let profitFromTrades = 0;
  let dividends = 0;
  let fxDifference = 0;

  for (const pos of positions) {
    const purchasePrice = Number.parseFloat(pos.purchasePrice) || 0;
    const salePrice = Number.parseFloat(pos.salePrice) || 0;
    const expenses = Number.parseFloat(pos.expenses) || 0;

    if (pos.assetType === 'dividends') {
      dividends += salePrice;
    } else {
      profitFromTrades += salePrice - purchasePrice - expenses;
      fxDifference += positionFxDifference(pos);
    }
  }

  return taxesOnIncome(profitFromTrades, dividends, year, fxDifference);
}

/**
 * Exchange-rate difference of a foreign-currency trade: the purchase cost revalued from the
 * purchase-date to the sale-date NBU rate. It is the part of the UAH profit that comes from the
 * hryvnia rate alone, so it is taxed even when the trade broke even in the currency.
 */
export function positionFxDifference(pos: TaxablePosition): number {
  if (pos.assetType === 'dividends' || !pos.currency || pos.currency === 'UAH') {
    return 0;
  }
  const purchase = Number.parseFloat(pos.purchasePriceForeign ?? '') || 0;
  const purchaseRate = Number.parseFloat(pos.purchaseRate ?? '') || 0;
  const saleRate = Number.parseFloat(pos.saleRate ?? '') || 0;
  return purchaseRate && saleRate ? purchase * (saleRate - purchaseRate) : 0;
}

/**
 * Taxes on already aggregated UAH income: net trade profit and dividends received.
 * `fxDifference` is the exchange-rate part of `profitFromTrades`, used to report the tax it adds.
 */
export function taxesOnIncome(
  profitFromTrades: number,
  dividends: number,
  year: string,
  fxDifference = 0,
): TaxCalculations {
  const rate = militaryTaxRate(year);
  const withoutFx = Math.max(0, profitFromTrades - fxDifference);
  const pdfoFromTrades = profitFromTrades > 0 ? profitFromTrades * 0.18 : 0;
  const militaryTaxFromTrades = profitFromTrades > 0 ? profitFromTrades * rate : 0;
  const pdfoFromDividends = dividends > 0 ? dividends * 0.09 : 0;
  const militaryTaxFromDividends = dividends > 0 ? dividends * rate : 0;

  const pdfo = pdfoFromTrades + pdfoFromDividends;
  const militaryTax = militaryTaxFromTrades + militaryTaxFromDividends;

  return {
    profit: profitFromTrades + dividends,
    pdfo,
    militaryTax,
    total: pdfo + militaryTax,
    profitFromTrades,
    dividends,
    pdfoFromTrades,
    pdfoFromDividends,
    militaryTaxFromTrades,
    militaryTaxFromDividends,
    fxDifference,
    taxOnFx: pdfoFromTrades + militaryTaxFromTrades - withoutFx * (0.18 + rate),
  };
}
