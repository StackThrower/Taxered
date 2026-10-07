import { taxesOnIncome } from '../../declaration/f0121214/tax-model';
import { inflationFor } from '../../lib/inflation';

export type DisplayCurrency = 'USD' | 'UAH';

/** The account and period of a statement, with its value movements in USD. */
export interface StatementAccount {
  id: string;
  /** First and last day of the period, `YYYY-MM-DD`. */
  start: string;
  end: string;
  /** Account value at the start and end of the period. */
  startingValue: number;
  endingValue: number;
  /** Deposits minus withdrawals during the period. */
  deposits: number;
}

/** Realized income from one imported statement, restricted to one year. */
export interface FileIncome {
  name: string;
  account: StatementAccount;
  trades: number;
  dividends: number;
  /** Net trade profit in UAH at NBU rates on the purchase and sale dates (as in the declaration). */
  tradesUah: number;
  /**
   * The part of `tradesUah` that comes from the hryvnia rate moving between purchase and
   * sale (the cost revalued at the sale-date rate). It is taxed like any other profit.
   */
  fxUah: number;
  dividendsUah: number;
  tradesUsd: number;
  dividendsUsd: number;
  warnings: string[];
}

export interface YearInput {
  year: number;
  files: readonly FileIncome[];
  /** Money added to (negative: withdrawn from) the account at the start of the year. */
  deposits: number;
  /** Inflation for the year, percent. */
  inflation: number;
  /**
   * Change in the account value over the year not explained by deposits, in USD, from the
   * statements; absent or `null` if unknown, and then only realized income counts.
   */
  accountGainUsd?: number | null;
}

export interface AnalysisOptions {
  currency: DisplayCurrency;
  initialCapital: number;
  includeTaxes: boolean;
  /**
   * Taxes are paid from other money, not from the broker account: the capital stays at the
   * account value and the taxes count as money invested, so they raise the inflation
   * threshold instead.
   */
  taxesPaidSeparately?: boolean;
  /** NBU UAH per USD at the end of each year; `null` or absent while unknown. */
  usdRates: Readonly<Record<number, number | null>>;
}

export interface YearResult {
  year: number;
  /** A year between two uploaded years with no report: no income, but inflation still applies. */
  missing: boolean;
  /** Trade profit without the exchange-rate part (in UAH: valued at the sale-date rate). */
  trades: number;
  dividends: number;
  /**
   * The rest of the account's gain: the revaluation of open positions, plus interest,
   * fees and foreign taxes withheld. Untaxed until positions are sold.
   */
  unrealized: number;
  /**
   * Exchange-rate difference, UAH only: the dollar account revalued at the year-end NBU
   * rate, including the realized part inside trades. Zero in USD.
   */
  fx: number;
  tax: number;
  /** Part of `tax` paid on the realized exchange-rate difference. */
  taxOnFx: number;
  net: number;
  deposits: number;
  startCapital: number;
  endCapital: number;
  /** Capital that would only have kept up with inflation. */
  threshold: number;
  inflation: number;
  /** `null` when there is no capital to measure the return against. */
  returnPct: number | null;
  realReturnPct: number | null;
  /** This year's income minus what inflation took from the invested money. */
  aboveInflation: number;
}

export interface Analysis {
  rows: YearResult[];
  initialCapital: number;
  gross: number;
  unrealized: number;
  fx: number;
  tax: number;
  taxOnFx: number;
  net: number;
  finalCapital: number;
  finalThreshold: number;
  /** Final capital minus the inflation threshold, in money of the last year. */
  realGain: number;
  /** The same gain in prices of the start of the first year. */
  realGainInStartPrices: number;
  /** Geometric average of the yearly real returns, percent. */
  avgRealReturnPct: number | null;
  /** Every year has a capital base, so returns can be shown in percent. */
  hasCapital: boolean;
}

/**
 * Builds the year-by-year picture. Capital grows by the account's gain from the statements
 * (realized income plus the revaluation of open positions) less the tax on realized income,
 * so it follows the account value with the taxes paid taken out. The inflation threshold
 * compounds the invested money with inflation; the difference between the two is what the
 * investments earned above inflation.
 *
 * The broker account is assumed to be in dollars. In UAH, the capital is therefore
 * revalued at each year-end NBU rate, and that revaluation is the exchange-rate difference.
 */
export function analyzeReturns(years: readonly YearInput[], options: AnalysisOptions): Analysis {
  const { currency, initialCapital, includeTaxes, usdRates } = options;
  const byYear = new Map(years.map((y) => [y.year, y]));
  const sorted = [...byYear.keys()].sort((a, b) => a - b);
  const rows: YearResult[] = [];

  let capital = initialCapital;
  let threshold = initialCapital;
  let priceLevel = 1;

  for (let year = sorted[0]; sorted.length > 0 && year <= sorted[sorted.length - 1]; year++) {
    const input: YearInput = byYear.get(year) ?? {
      year,
      files: [],
      deposits: 0,
      inflation: inflationFor(currency, year),
    };
    const sum = (pick: (f: FileIncome) => number) =>
      input.files.reduce((total, f) => total + pick(f), 0);

    const tradesUah = sum((f) => f.tradesUah);
    const fxUah = sum((f) => f.fxUah);
    const dividendsUah = sum((f) => f.dividendsUah);
    const tradesUsd = sum((f) => f.tradesUsd);
    const dividendsUsd = sum((f) => f.dividendsUsd);
    const taxUah = includeTaxes ? taxesOnIncome(tradesUah, dividendsUah, String(year)).total : 0;
    const taxWithoutFxUah = includeTaxes
      ? taxesOnIncome(tradesUah - fxUah, dividendsUah, String(year)).total
      : 0;

    const startRate = usdRates[year - 1] ?? null;
    const endRate = usdRates[year] ?? null;
    const toUsd = (uah: number) =>
      uahToUsd(uah, endRate, tradesUsd + dividendsUsd, tradesUah + dividendsUah);
    const unrealizedUsd =
      input.accountGainUsd == null ? 0 : input.accountGainUsd - tradesUsd - dividendsUsd;

    const startCapital = capital;
    const base = capital + input.deposits;
    let trades: number;
    let dividends: number;
    let unrealized: number;
    let fx = 0;
    let tax: number;
    let taxOnFx: number;

    if (currency === 'UAH') {
      trades = tradesUah - fxUah;
      dividends = dividendsUah;
      // Open positions are valued at the end of the year, so they add no rate difference.
      unrealized = unrealizedUsd * (endRate ?? startRate ?? 0);
      tax = taxUah;
      taxOnFx = taxUah - taxWithoutFxUah;
      // Dollars held through the year: the start capital bought at the start rate, the
      // income after tax, all valued at the end rate. Without both rates only the
      // realized difference inside trades is known.
      fx =
        startRate && endRate
          ? (base / startRate + tradesUsd + dividendsUsd) * endRate -
            taxUah -
            base -
            (trades + dividends - tax)
          : fxUah;
    } else {
      trades = tradesUsd;
      dividends = dividendsUsd;
      unrealized = unrealizedUsd;
      tax = toUsd(taxUah);
      taxOnFx = toUsd(taxUah - taxWithoutFxUah);
    }
    const net = trades + dividends + unrealized + fx - tax;

    const inflation = input.inflation / 100;
    const thresholdBase = threshold + input.deposits;
    const returnPct = base > 0 ? (net / base) * 100 : null;

    const taxFromOutside = options.taxesPaidSeparately ? tax : 0;
    capital = base + net + taxFromOutside;
    threshold = thresholdBase * (1 + inflation) + taxFromOutside;
    priceLevel *= 1 + inflation;

    rows.push({
      year,
      missing: !byYear.has(year),
      trades,
      dividends,
      unrealized,
      fx,
      tax,
      taxOnFx,
      net,
      deposits: input.deposits,
      startCapital,
      endCapital: capital,
      threshold,
      inflation: input.inflation,
      returnPct,
      realReturnPct:
        returnPct === null ? null : ((1 + returnPct / 100) / (1 + inflation) - 1) * 100,
      aboveInflation: net - thresholdBase * inflation,
    });
  }

  const total = (pick: (r: YearResult) => number) => rows.reduce((t, r) => t + pick(r), 0);
  const hasCapital = rows.length > 0 && rows.every((r) => r.realReturnPct !== null);
  const realGain = capital - threshold;

  return {
    rows,
    initialCapital,
    gross: total((r) => r.trades + r.dividends),
    unrealized: total((r) => r.unrealized),
    fx: total((r) => r.fx),
    tax: total((r) => r.tax),
    taxOnFx: total((r) => r.taxOnFx),
    net: total((r) => r.net),
    finalCapital: capital,
    finalThreshold: threshold,
    realGain,
    realGainInStartPrices: realGain / priceLevel,
    avgRealReturnPct: hasCapital
      ? (Math.pow(
          rows.reduce((product, r) => product * (1 + (r.realReturnPct ?? 0) / 100), 1),
          1 / rows.length,
        ) -
          1) *
        100
      : null,
    hasCapital,
  };
}

/**
 * Account value at the start of `year`, in USD: for each account, the value at the start
 * of its statement that begins earliest that year. `null` if no statement begins then.
 */
export function startingCapital(
  files: readonly FileIncome[],
  year: number,
): { value: number; date: string } | null {
  const first = earliestPerAccount(files.filter((f) => f.account.start.startsWith(`${year}-`)));
  if (first.length === 0) {
    return null;
  }
  return {
    value: first.reduce((sum, a) => sum + a.startingValue, 0),
    date: first.reduce((date, a) => (a.start < date ? a.start : date), first[0].start),
  };
}

/**
 * Deposits minus withdrawals of `year` and the account's gain beyond them, in USD, from the
 * statements that lie within that year (for each account, the one that begins earliest).
 * `null` if there is none.
 */
export function statementYear(
  files: readonly FileIncome[],
  year: number,
): { deposits: number; gain: number } | null {
  const prefix = `${year}-`;
  const statements = earliestPerAccount(
    files.filter((f) => f.account.start.startsWith(prefix) && f.account.end.startsWith(prefix)),
  );
  if (statements.length === 0) {
    return null;
  }
  return {
    deposits: statements.reduce((sum, a) => sum + a.deposits, 0),
    gain: statements.reduce((sum, a) => sum + a.endingValue - a.startingValue - a.deposits, 0),
  };
}

/** Per account, the statement that begins earliest and, of those, ends latest. */
function earliestPerAccount(files: readonly FileIncome[]): StatementAccount[] {
  const byAccount = new Map<string, StatementAccount>();
  for (const { account } of files) {
    const current = byAccount.get(account.id);
    if (
      !current ||
      account.start < current.start ||
      (account.start === current.start && account.end > current.end)
    ) {
      byAccount.set(account.id, account);
    }
  }
  return [...byAccount.values()];
}

/** Converts a UAH tax at the year-end rate, or in proportion to income if that rate is unknown. */
function uahToUsd(
  taxUah: number,
  usdRate: number | null,
  incomeUsd: number,
  incomeUah: number,
): number {
  if (taxUah === 0) {
    return 0;
  }
  if (usdRate) {
    return taxUah / usdRate;
  }
  return incomeUah > 0 ? (taxUah * incomeUsd) / incomeUah : 0;
}
