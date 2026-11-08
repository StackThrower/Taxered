import { computeDeclaration } from '../../lib/dps-xml/declaration';
import { computeF1, type F1Calculation } from '../../lib/dps-xml/f1';
import { computeForeignIncome, isForeignIncome } from '../../lib/dps-xml/foreign-income';
import { toHryvnias, toKopecks } from '../../lib/dps-xml/money';
import { militaryLevyBp } from '../../lib/dps-xml/versions';
import type { BrokerSource } from '../../lib/ib-xml-parser';

export type AssetType =
  | ''
  | 'stocks'
  | 'bonds'
  | 'options'
  | 'dividends'
  | 'interest'
  | 'crypto'
  | 'real_estate'
  | 'other';

export const ASSET_TYPES: { value: Exclude<AssetType, ''>; label: string }[] = [
  { value: 'stocks', label: 'Акції' },
  { value: 'bonds', label: 'Облігації' },
  { value: 'options', label: 'Опціони' },
  { value: 'dividends', label: 'Дивіденди' },
  { value: 'interest', label: 'Проценти, купони (іноземні)' },
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
  /** ISIN of the security, if the broker report has it. */
  isin?: string;
  /** Broker name for column 3 of Ф1, e.g. "Freedom Finance Europe". */
  broker?: string;
  /**
   * Whose broker this is: 'ua' — a Ukrainian broker (tax agent, domestic exchange), 'foreign' —
   * IB, Freedom Finance Europe and other foreign brokers. Decides the Ф1 column 2 code.
   */
  brokerJurisdiction?: BrokerJurisdiction;
  /** Manual Ф1 column 2 code "1"–"4"; empty = automatic. */
  assetCode?: string;
  /** Settlement date of the sale (open question 1: the sale rate is taken on `saleDate`). */
  saleSettlementDate?: string;
  /**
   * Broker commissions in their own currency. On import they are converted to UAH at the NBU
   * rate of their currency on the purchase / sale date and added to `expenses`.
   */
  purchaseCommissionForeign?: string;
  purchaseCommissionCurrency?: string;
  saleCommissionForeign?: string;
  saleCommissionCurrency?: string;
  /** Country of the income source for row 10.10; by default from the ISIN. */
  country?: string;
}

export type BrokerJurisdiction = '' | 'foreign' | 'ua';

/** Annual inputs of the calculation besides the positions; UAH amounts as typed. */
export interface TaxOptions {
  /** Ф1 row 2: loss of previous years not yet offset. */
  previousYearsLoss?: string;
  /** Ф1 rows 4.1 / 5.1: withheld by a Ukrainian broker as tax agent. */
  withheldPdfo?: string;
  withheldMilitaryLevy?: string;
  /**
   * Declaration row 18: foreign tax to credit. Set only when the taxpayer has a legalised
   * certificate of the foreign tax authority.
   */
  foreignTaxCredit?: string;
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
  /** Declaration row 18 in UAH: foreign tax credited against PDFO. */
  foreignTaxCredit: number;
  /** Annex Ф1 rows, in kopecks; the source of the trade figures above. */
  f1: F1Calculation;
}

type TaxablePosition = Pick<
  FinancialPosition,
  'assetType' | 'purchasePrice' | 'salePrice' | 'expenses'
> &
  Partial<FinancialPosition>;

function reportYear(year: string): number {
  return parseInt(year) || 2026;
}

/** Military levy: 1.5% for report years up to 2024, 5% from 2025. */
export function militaryTaxRate(year: string): number {
  return militaryLevyBp(reportYear(year)) / 10000;
}

/** Rate for display, e.g. "5" or "1.5". */
export function militaryTaxRateLabel(year: string): string {
  return String(militaryLevyBp(reportYear(year)) / 100);
}

/**
 * Trades: annex Ф1 — 18% PDFO + military levy on the year's result less previous losses, nothing
 * below the pp. "а" 170.2.8 threshold. Dividends: reduced 9% PDFO + military levy on the gross
 * amount. All amounts are computed in kopecks and returned in hryvnias.
 */
export function calculateTaxes(
  positions: readonly TaxablePosition[],
  year: string,
  options: TaxOptions = {},
): TaxCalculations {
  const y = reportYear(year);
  const f1 = computeF1(positions, y, {
    previousYearsLoss: toKopecks(options.previousYearsLoss),
    withheldPdfo: toKopecks(options.withheldPdfo),
    withheldMilitaryLevy: toKopecks(options.withheldMilitaryLevy),
  });

  const foreign = computeForeignIncome(positions, y);
  const declaration = computeDeclaration(f1.belowThreshold ? null : f1, foreign, {
    foreignTaxCredit: toKopecks(options.foreignTaxCredit),
  });

  // Exchange-rate difference of the lots that made it into Ф1 (display only).
  const fxDifference = f1.belowThreshold
    ? 0
    : positions
        .filter((p) => !isForeignIncome(p) && p.assetType !== 'crypto')
        .reduce((sum, p) => sum + positionFxDifference(p), 0);

  // Row 18 reduces PDFO only, never the military levy.
  const pdfo = f1.pdfoPayable + foreign.pdfo - declaration.row18;
  const militaryTax = f1.militaryLevyPayable + foreign.militaryLevy;
  const profitFromTrades = toHryvnias(f1.financialResult);
  const rate = militaryTaxRate(year);
  const withoutFx = Math.max(0, profitFromTrades - fxDifference);
  const pdfoFromTrades = toHryvnias(f1.pdfoPayable);
  const militaryTaxFromTrades = toHryvnias(f1.militaryLevyPayable);

  return {
    profit: profitFromTrades + toHryvnias(foreign.total),
    pdfo: toHryvnias(pdfo),
    militaryTax: toHryvnias(militaryTax),
    total: toHryvnias(pdfo + militaryTax),
    profitFromTrades,
    dividends: toHryvnias(foreign.total),
    pdfoFromTrades,
    pdfoFromDividends: toHryvnias(foreign.pdfo),
    militaryTaxFromTrades,
    militaryTaxFromDividends: toHryvnias(foreign.militaryLevy),
    fxDifference,
    taxOnFx: f1.profit > 0 ? pdfoFromTrades + militaryTaxFromTrades - withoutFx * (0.18 + rate) : 0,
    foreignTaxCredit: toHryvnias(declaration.row18),
    f1,
  };
}

/**
 * Exchange-rate difference of a foreign-currency trade: the purchase cost revalued from the
 * purchase-date to the sale-date NBU rate. It is the part of the UAH profit that comes from the
 * hryvnia rate alone, so it is taxed even when the trade broke even in the currency.
 */
export function positionFxDifference(pos: TaxablePosition): number {
  if (isForeignIncome(pos) || !pos.currency || pos.currency === 'UAH') {
    return 0;
  }
  const purchase = Number.parseFloat(pos.purchasePriceForeign ?? '') || 0;
  const purchaseRate = Number.parseFloat(pos.purchaseRate ?? '') || 0;
  const saleRate = Number.parseFloat(pos.saleRate ?? '') || 0;
  return purchaseRate && saleRate ? purchase * (saleRate - purchaseRate) : 0;
}

/**
 * Taxes on already aggregated UAH income (the returns calculator): net trade profit and dividends
 * received. `fxDifference` is the exchange-rate part of `profitFromTrades`.
 */
export function taxesOnIncome(
  profitFromTrades: number,
  dividends: number,
  year: string,
  fxDifference = 0,
): Omit<TaxCalculations, 'f1' | 'foreignTaxCredit'> {
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

/**
 * Explanations printed in the PDF and Excel next to the figures: rows of Ф1 that are not obvious
 * from the totals, excluded positions and how lots were matched (open question 9).
 */
export function calculationNotes(
  calc: Pick<TaxCalculations, 'f1'>,
  positions: readonly Pick<FinancialPosition, 'source' | 'assetType'>[],
): string[] {
  const { f1 } = calc;
  const uah = (kopecks: number) => `${toHryvnias(kopecks).toFixed(2)} грн`;
  const notes: string[] = [];
  if (f1.previousYearsLoss > 0) {
    notes.push(
      `Ф1, рядок 2 — від'ємний фінансовий результат попередніх років: ${uah(f1.previousYearsLoss)}.`,
    );
  }
  if (f1.loss > 0) {
    notes.push(`Ф1, рядок 3.2 — збиток, що переноситься на наступний рік: ${uah(f1.loss)}.`);
  }
  if (f1.pdfoWithheld > 0 || f1.militaryLevyWithheld > 0) {
    notes.push(
      `Ф1, рядки 4.1 / 5.1 — утримано податковим агентом: ПДФО ${uah(f1.pdfoWithheld)}, військовий збір ${uah(f1.militaryLevyWithheld)}.`,
    );
  }
  notes.push(...f1.warnings);

  const trades = positions.filter((p) => !isForeignIncome(p));
  const methods = [
    trades.some((p) => p.source === 'interactive_brokers')
      ? 'Interactive Brokers — закриті лоти зі звіту брокера'
      : '',
    trades.some((p) => p.source === 'freedom_finance') ? 'Freedom Finance — FIFO' : '',
  ].filter(Boolean);
  if (methods.length > 0) {
    notes.push(`Метод визначення лотів: ${methods.join('; ')}.`);
  }
  return notes;
}
