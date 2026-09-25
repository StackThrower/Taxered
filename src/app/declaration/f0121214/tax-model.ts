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
}

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
  positions: readonly Pick<
    FinancialPosition,
    'assetType' | 'purchasePrice' | 'salePrice' | 'expenses'
  >[],
  year: string,
): TaxCalculations {
  let profitFromTrades = 0;
  let dividends = 0;
  const rate = militaryTaxRate(year);

  for (const pos of positions) {
    const purchasePrice = Number.parseFloat(pos.purchasePrice) || 0;
    const salePrice = Number.parseFloat(pos.salePrice) || 0;
    const expenses = Number.parseFloat(pos.expenses) || 0;

    if (pos.assetType === 'dividends') {
      dividends += salePrice;
    } else {
      profitFromTrades += salePrice - purchasePrice - expenses;
    }
  }

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
  };
}
