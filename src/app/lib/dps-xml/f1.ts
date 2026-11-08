/**
 * Annex Ф1 (investment profit), schema F01212xx: MoF order No. 859 of 02.10.2015 as amended by
 * order No. 119 of 26.02.2025. Rows follow the form; amounts are kopecks.
 */
import type { FinancialPosition } from '../../declaration/f0121214/tax-model';
import { applyRate, formatAmount, sumKopecks, toKopecks, type Kopecks } from './money';
import { RATE_BP, militaryLevyBp } from './versions';
import { el } from './xml';

/** Column 2 "код виду інвестиційного активу". */
export const F1_ASSET_CODE = {
  /** Corporate rights other than securities. */
  corporateRights: 1,
  /** Securities or derivatives traded on a stock exchange. */
  exchangeTraded: 2,
  /** Securities or derivatives not traded on a stock exchange. */
  offExchange: 3,
  /** Investment assets with a source outside Ukraine. */
  foreign: 4,
} as const;

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
  /** Row 3: total result less the loss of previous years. */
  financialResult: Kopecks;
  /** Row 3.1 / 3.2. */
  profit: Kopecks;
  loss: Kopecks;
  /** Rows 4, 4.2 and 5, 5.2. */
  pdfo: Kopecks;
  pdfoPayable: Kopecks;
  militaryLevy: Kopecks;
  militaryLevyPayable: Kopecks;
  /** Positions that did not become a row. */
  skipped: number;
}

export function computeF1(positions: readonly FinancialPosition[], year: number): F1Calculation {
  const included = positions.filter(isF1Position);
  const rows = included.map(toRow);

  const totalIncome = sumKopecks(rows.map((r) => r.income));
  const totalCosts = sumKopecks(rows.map((r) => r.costs));
  const totalResult = sumKopecks(rows.map((r) => r.result));
  const financialResult = totalResult;
  const profit = Math.max(0, financialResult);
  const loss = Math.max(0, -financialResult);
  const pdfo = applyRate(profit, RATE_BP.pdfo);
  const militaryLevy = applyRate(profit, militaryLevyBp(year));

  return {
    rows,
    totalIncome,
    totalCosts,
    totalResult,
    financialResult,
    profit,
    loss,
    pdfo,
    pdfoPayable: pdfo,
    militaryLevy,
    militaryLevyPayable: militaryLevy,
    skipped: positions.length - included.length,
  };
}

/** DECLARBODY of Ф1 after the header fields, in xs:sequence order, up to HBOS. */
export function renderF1Rows(f1: F1Calculation): string[] {
  const column = (name: string, value: (r: F1Row) => string | number) =>
    f1.rows.map((r, i) => el(name, value(r), i + 1));
  const amount = (name: string, kopecks: Kopecks) => [el(name, formatAmount(kopecks))];
  const positive = (name: string, kopecks: Kopecks) => (kopecks > 0 ? amount(name, kopecks) : []);

  return [
    ...column('T1RXXXXG2', (r) => r.code),
    ...column('T1RXXXXG3S', (r) => r.description),
    ...column('T1RXXXXG4', (r) => formatAmount(r.income)),
    ...column('T1RXXXXG5', (r) => formatAmount(r.costs)),
    ...column('T1RXXXXG6', (r) => formatAmount(r.result)),
    ...amount('R001G4', f1.totalIncome),
    ...amount('R001G5', f1.totalCosts),
    ...amount('R001G6', f1.totalResult),
    ...amount('R003G6', f1.financialResult),
    ...positive('R031G6', f1.profit),
    ...positive('R032G6', f1.loss),
    ...positive('R004G6', f1.pdfo),
    ...positive('R042G6', f1.pdfoPayable),
    ...positive('R005G6', f1.militaryLevy),
    ...positive('R052G6', f1.militaryLevyPayable),
  ];
}

/** Trades with investment assets; dividends and real estate are declared elsewhere. */
function isF1Position(p: FinancialPosition): boolean {
  if (p.assetType === 'dividends' || p.assetType === 'real_estate') {
    return false;
  }
  return toKopecks(p.salePrice) !== 0 || toKopecks(p.purchasePrice) !== 0;
}

function toRow(p: FinancialPosition): F1Row {
  const income = toKopecks(p.salePrice);
  const costs = toKopecks(p.purchasePrice) + toKopecks(p.expenses);
  const foreign =
    (!!p.currency && p.currency !== 'UAH') ||
    p.source === 'interactive_brokers' ||
    p.source === 'freedom_finance';
  return {
    code: foreign ? F1_ASSET_CODE.foreign : F1_ASSET_CODE.exchangeTraded,
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
  crypto: 'Віртуальні активи',
  other: 'Інвестиційний актив',
};

function describe(p: FinancialPosition): string {
  const name = p.assetDescription?.trim() || p.symbol?.trim() || '';
  const label = ASSET_LABELS[p.assetType] ?? ASSET_LABELS['other'];
  const quantity = parseFloat(p.quantity ?? '');
  const parts = [name ? `${label}: ${name}` : label];
  if (quantity) {
    parts.push(`${Math.abs(quantity)} шт.`);
  }
  if (p.saleDate) {
    parts.push(`продаж ${formatIsoDate(p.saleDate)}`);
  }
  return parts.join(', ');
}

/** "2025-03-14" -> "14.03.2025"; other formats pass through. */
export function formatIsoDate(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : value;
}
