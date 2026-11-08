/**
 * Annex Ф1 (investment profit), schema F01212xx: MoF order No. 859 of 02.10.2015 as amended by
 * order No. 119 of 26.02.2025. One table row per closed lot; amounts are kopecks.
 *
 * Investment profit is the positive difference between the sale income of each asset (exchange
 * difference included) and the documented costs of acquiring it (pp. 170.2.2 PKU); the year's
 * result is reduced by the loss of previous years (row 2) and taxed on the positive remainder.
 */
import type { FinancialPosition } from '../../declaration/f0121214/tax-model';
import { applyRate, formatAmount, sumKopecks, toKopecks, type Kopecks } from './money';
import { RATE_BP, investmentThreshold, militaryLevyBp } from './versions';
import { el } from './xml';

/** Column 2 "код виду інвестиційного активу" (form Ф1). */
export const F1_ASSET_CODE = {
  /** Corporate rights other than securities: manual entry only. */
  corporateRights: 1,
  /** Securities or derivatives traded on a stock exchange: Ukrainian broker and exchange. */
  exchangeTraded: 2,
  /** Securities or derivatives not traded on a stock exchange: manual entry. */
  offExchange: 3,
  /** Investment assets with a source outside Ukraine: IB, Freedom Finance Europe, any foreign broker. */
  foreign: 4,
} as const;

/** What the Ф1 calculation reads from a position. */
export type F1Position = Pick<
  FinancialPosition,
  'assetType' | 'purchasePrice' | 'salePrice' | 'expenses'
> &
  Partial<FinancialPosition>;

export interface F1Options {
  /** Row 2: negative total result of previous years, ≥ 0. */
  previousYearsLoss?: Kopecks;
  /** Rows 4.1 / 5.1: PDFO and military levy withheld by a Ukrainian tax agent (broker). */
  withheldPdfo?: Kopecks;
  withheldMilitaryLevy?: Kopecks;
}

export interface F1Row {
  code: number;
  description: string;
  income: Kopecks;
  costs: Kopecks;
  result: Kopecks;
}

export interface F1Calculation {
  rows: F1Row[];
  /** Row 1 "УСЬОГО": columns 4, 5, 6. */
  totalIncome: Kopecks;
  totalCosts: Kopecks;
  totalResult: Kopecks;
  /** Row 2. */
  previousYearsLoss: Kopecks;
  /** Row 3 = row 1 col. 6 − row 2. */
  financialResult: Kopecks;
  /** Row 3.1 investment profit / 3.2 loss carried to row 2 of next year. */
  profit: Kopecks;
  loss: Kopecks;
  /** Rows 4, 4.1, 4.2. */
  pdfo: Kopecks;
  pdfoWithheld: Kopecks;
  pdfoPayable: Kopecks;
  /** Rows 5, 5.1, 5.2. */
  militaryLevy: Kopecks;
  militaryLevyWithheld: Kopecks;
  militaryLevyPayable: Kopecks;
  /**
   * Pp. "а" 170.2.8: the year's sale income does not exceed the threshold, so the income and
   * costs are not included in the calculation and no Ф1 is filed.
   */
  belowThreshold: boolean;
  threshold: Kopecks | null;
  /** Positions that did not become a row (dividends, real estate, empty, excluded). */
  skipped: number;
  /** Why positions were left out, and other notes for the user. */
  warnings: string[];
}

export function computeF1(
  positions: readonly F1Position[],
  year: number,
  options: F1Options = {},
): F1Calculation {
  const trades = positions.filter(isTrade);
  const crypto = trades.filter((p) => p.assetType === 'crypto');
  const govBonds = trades.filter(isExemptBond);
  const included = trades.filter((p) => p.assetType !== 'crypto' && !isExemptBond(p));
  const rows = included.map(toRow);

  const warnings: string[] = [];
  if (crypto.length > 0) {
    // Open question 5: virtual assets have their own tax regime; not in Ф1 by default.
    warnings.push(
      `Віртуальні активи (${crypto.length}) не включено до Ф1: для них діє окремий режим оподаткування.`,
    );
  }
  if (govBonds.length > 0) {
    warnings.push(
      `ОВДП та облігації НБУ (${govBonds.length}) не включено до розрахунку (пп. «б» 170.2.8, пп. 165.1.52 ПКУ).`,
    );
  }
  if (included.some((p) => p.assetType === 'options')) {
    // Open question 6: pp. 170.2.2 excludes derivative operations; the calculation is unchanged.
    warnings.push(
      'Опціони розраховано за загальними правилами Ф1. Пп. 170.2.2 ПКУ містить застереження щодо операцій з деривативами — за потреби перевірте з податковим консультантом.',
    );
  }

  const totalIncome = sumKopecks(rows.map((r) => r.income));
  const totalCosts = sumKopecks(rows.map((r) => r.costs));
  const totalResult = sumKopecks(rows.map((r) => r.result));

  const threshold = investmentThreshold(year);
  const belowThreshold = rows.length > 0 && threshold !== null && totalIncome <= threshold;
  if (belowThreshold && threshold !== null) {
    warnings.push(
      `Дохід від продажу інвестиційних активів (${formatAmount(totalIncome)} грн) не перевищує ${formatAmount(threshold)} грн, тому за пп. «а» 170.2.8 ПКУ доходи й витрати до розрахунку не включаються і Ф1 не подається.`,
    );
  }

  const previousYearsLoss = Math.max(0, options.previousYearsLoss ?? 0);
  const financialResult = belowThreshold ? 0 : totalResult - previousYearsLoss;
  const profit = Math.max(0, financialResult);
  const loss = belowThreshold ? 0 : Math.max(0, -financialResult);

  const pdfo = applyRate(profit, RATE_BP.pdfo);
  const militaryLevy = applyRate(profit, militaryLevyBp(year));
  const pdfoWithheld = Math.max(0, options.withheldPdfo ?? 0);
  const militaryLevyWithheld = Math.max(0, options.withheldMilitaryLevy ?? 0);

  return {
    rows,
    totalIncome,
    totalCosts,
    totalResult,
    previousYearsLoss,
    financialResult,
    profit,
    loss,
    pdfo,
    pdfoWithheld,
    pdfoPayable: Math.max(0, pdfo - pdfoWithheld),
    militaryLevy,
    militaryLevyWithheld,
    militaryLevyPayable: Math.max(0, militaryLevy - militaryLevyWithheld),
    belowThreshold,
    threshold,
    skipped: positions.length - rows.length,
    warnings,
  };
}

/** DECLARBODY of Ф1 after the header fields, in xs:sequence order, up to HBOS. */
export function renderF1Rows(f1: F1Calculation): string[] {
  const column = (name: string, value: (r: F1Row) => string | number) =>
    f1.rows.map((r, i) => el(name, value(r), i + 1));
  const amount = (name: string, kopecks: Kopecks) => [el(name, formatAmount(kopecks))];
  const positive = (name: string, kopecks: Kopecks) => (kopecks > 0 ? amount(name, kopecks) : []);
  const taxed = f1.profit > 0;

  return [
    ...column('T1RXXXXG2', (r) => r.code),
    ...column('T1RXXXXG3S', (r) => r.description),
    ...column('T1RXXXXG4', (r) => formatAmount(r.income)),
    ...column('T1RXXXXG5', (r) => formatAmount(r.costs)),
    ...column('T1RXXXXG6', (r) => formatAmount(r.result)),
    ...amount('R001G4', f1.totalIncome),
    ...amount('R001G5', f1.totalCosts),
    ...amount('R001G6', f1.totalResult),
    ...positive('R002G6', f1.previousYearsLoss),
    ...amount('R003G6', f1.financialResult),
    ...positive('R031G6', f1.profit),
    ...positive('R032G6', f1.loss),
    ...(taxed ? amount('R004G6', f1.pdfo) : []),
    ...(taxed ? positive('R041G6', f1.pdfoWithheld) : []),
    ...(taxed ? amount('R042G6', f1.pdfoPayable) : []),
    ...(taxed ? amount('R005G6', f1.militaryLevy) : []),
    ...(taxed ? positive('R051G6', f1.militaryLevyWithheld) : []),
    ...(taxed ? amount('R052G6', f1.militaryLevyPayable) : []),
  ];
}

/**
 * Column 2 code: a manual override wins; otherwise the broker's jurisdiction decides, not the
 * import source. Open question 4: exchange-traded securities bought through a foreign broker get
 * code 4.
 */
export function f1AssetCode(p: F1Position): number {
  const manual = parseInt(p.assetCode ?? '');
  if (manual >= 1 && manual <= 4) {
    return manual;
  }
  if (p.brokerJurisdiction === 'ua') {
    return F1_ASSET_CODE.exchangeTraded;
  }
  if (
    p.brokerJurisdiction === 'foreign' ||
    p.source === 'interactive_brokers' ||
    p.source === 'freedom_finance'
  ) {
    return F1_ASSET_CODE.foreign;
  }
  return !p.currency || p.currency === 'UAH' ? F1_ASSET_CODE.exchangeTraded : F1_ASSET_CODE.foreign;
}

/** Trades with investment assets; dividends, other income and real estate are declared elsewhere. */
function isTrade(p: F1Position): boolean {
  if (p.assetType === 'dividends' || p.assetType === 'interest' || p.assetType === 'real_estate') {
    return false;
  }
  return toKopecks(p.salePrice) !== 0 || toKopecks(p.purchasePrice) !== 0;
}

/** Pp. "б" 170.2.8: government bonds (OVDP) and NBU bonds are not part of the calculation. */
function isExemptBond(p: F1Position): boolean {
  if (p.assetType !== 'bonds') {
    return false;
  }
  const text = `${p.assetDescription ?? ''} ${p.symbol ?? ''}`;
  return (
    !!p.isin?.toUpperCase().startsWith('UA4000') ||
    /ОВДП|облігац\S* внутрішньої державної позики|облігац\S* НБУ/i.test(text)
  );
}

function toRow(p: F1Position): F1Row {
  const income = toKopecks(p.salePrice);
  const costs = toKopecks(p.purchasePrice) + toKopecks(p.expenses);
  return {
    code: f1AssetCode(p),
    description: describe(p),
    income,
    costs,
    result: income - costs,
  };
}

const ASSET_LABELS: Record<string, string> = {
  stocks: 'Акції',
  bonds: 'Облігації',
  options: 'Опціони',
  other: 'Інвестиційний актив',
};

/**
 * Column 3: asset type, ticker, ISIN, quantity, dates, currency amounts and rates, broker. The
 * XSD sets no maxLength for T1RXXXXG3S, so nothing is cut.
 */
function describe(p: F1Position): string {
  const name = p.assetDescription?.trim() || p.symbol?.trim() || '';
  const label = ASSET_LABELS[p.assetType] ?? ASSET_LABELS['other'];
  const parts = [name ? `${label}: ${name}` : label];
  if (p.isin && !name.includes(p.isin)) {
    parts.push(`ISIN ${p.isin}`);
  }
  const quantity = parseFloat(p.quantity ?? '');
  if (quantity) {
    parts.push(`${Math.abs(quantity)} шт.`);
  }
  if (p.purchaseDate) {
    parts.push(`купівля ${formatIsoDate(p.purchaseDate)}${foreignPart(p, 'purchase')}`);
  }
  if (p.saleDate) {
    parts.push(`продаж ${formatIsoDate(p.saleDate)}${foreignPart(p, 'sale')}`);
  }
  const broker = brokerName(p);
  if (broker) {
    parts.push(broker);
  }
  return parts.join(', ');
}

function foreignPart(p: F1Position, side: 'purchase' | 'sale'): string {
  if (!p.currency || p.currency === 'UAH') {
    return '';
  }
  const amount = side === 'purchase' ? p.purchasePriceForeign : p.salePriceForeign;
  const rate = side === 'purchase' ? p.purchaseRate : p.saleRate;
  return amount && rate ? ` ${amount} ${p.currency} за курсом ${rate}` : '';
}

function brokerName(p: F1Position): string {
  if (p.broker) {
    return p.broker;
  }
  switch (p.source) {
    case 'interactive_brokers':
      return 'Interactive Brokers';
    case 'freedom_finance':
      return 'Freedom Finance';
    default:
      return '';
  }
}

/** "2025-03-14" -> "14.03.2025"; other formats pass through. */
export function formatIsoDate(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : value;
}
