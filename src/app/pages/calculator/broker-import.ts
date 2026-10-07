import {
  IbCsvStatement,
  RealizedAmount,
  ibCsvYearIncome,
  isIbCsvStatement,
  parseIbCsvStatement,
} from '../../lib/ib-csv-parser';
import { fetchNBUExchangeRate } from '../../lib/nbu-exchange-rates';
import type { FileIncome } from './returns-model';

/** Parallel NBU requests per import; enough to be quick without hammering the API. */
const CONCURRENCY = 6;

/** An Interactive Brokers CSV statement as read. */
export interface BrokerReport {
  name: string;
  statement: IbCsvStatement;
}

export async function readBrokerReport(file: File): Promise<BrokerReport> {
  const content = await file.text();
  if (!isIbCsvStatement(content)) {
    throw new Error('це не CSV-виписка Interactive Brokers (Activity Statement)');
  }
  return { name: file.name, statement: parseIbCsvStatement(content) };
}

/**
 * Sums the realized income of `year` in an Interactive Brokers CSV statement, in UAH (NBU
 * rates, as for the declaration) and in USD. `history` holds every statement uploaded: the
 * statement does not list the lots a sale closes, so their purchase dates come from there.
 */
export async function importBrokerReport(
  report: BrokerReport,
  year: number,
  onProgress: (done: number, total: number) => void,
  history: readonly IbCsvStatement[],
): Promise<FileIncome> {
  const { statement } = report;
  const { amounts, trades, dividends, unmatched } = ibCsvYearIncome(statement, history, year);

  const warnings: string[] = [];
  if (trades === 0 && dividends === 0) {
    const period = statement.period ? ` (${statement.period})` : '';
    warnings.push(
      `У виписці${period} немає закритих угод і дивідендів за ${year} — її використано лише для дат купівлі.`,
    );
  }
  if (unmatched > 0) {
    warnings.push(
      `Для ${unmatched} продажів не знайдено купівлі в завантажених виписках — їх оцінено за курсом НБУ на дату продажу. Додайте виписки за роки, коли купували ці папери.`,
    );
  }
  if (statement.forexTrades > 0) {
    warnings.push(`Конвертації валют (${statement.forexTrades}) не враховано.`);
  }

  const income: FileIncome = {
    name: report.name,
    account: {
      id: statement.account,
      start: statement.start,
      end: statement.end,
      startingValue: statement.startingValue,
      endingValue: statement.endingValue,
      deposits: statement.deposits,
    },
    trades,
    dividends,
    tradesUah: 0,
    fxUah: 0,
    dividendsUah: 0,
    tradesUsd: 0,
    dividendsUsd: 0,
    warnings,
  };

  let done = 0;
  let skipped = 0;
  onProgress(0, amounts.length);

  await forEachLimited(amounts, CONCURRENCY, async (amount) => {
    const result = await amountIncome(amount);
    onProgress(++done, amounts.length);
    if (!result) {
      skipped++;
      return;
    }
    if (amount.kind === 'dividend') {
      income.dividendsUah += result.uah;
      income.dividendsUsd += result.usd;
    } else {
      income.tradesUah += result.uah;
      income.fxUah += result.fx;
      income.tradesUsd += result.usd;
    }
  });

  if (skipped > 0) {
    warnings.push(`Не вдалося отримати курс НБУ для ${skipped} операцій — їх не враховано.`);
  }
  return income;
}

/**
 * Profit of one closed position (or dividend) in UAH and USD, and the exchange-rate part of
 * the UAH profit: what is left after valuing the dollar profit at the sale-date rate.
 * `null` if a rate is missing.
 */
async function amountIncome(
  a: RealizedAmount,
): Promise<{ uah: number; usd: number; fx: number } | null> {
  // Dividends have no purchase; positions without a purchase date are valued on the sale date.
  const purchaseDate = a.kind === 'dividend' || !a.purchaseDate ? a.saleDate : a.purchaseDate;

  const [saleRate, purchaseRate] = await Promise.all([
    fetchNBUExchangeRate(a.saleDate, a.currency),
    fetchNBUExchangeRate(purchaseDate, a.currency),
  ]);
  if (saleRate === null || purchaseRate === null) {
    return null;
  }
  const saleUah = (a.sale - a.expenses) * saleRate;
  const purchaseUah = a.purchase * purchaseRate;
  const uah = saleUah - purchaseUah;

  if (a.currency === 'USD') {
    const usd = a.sale - a.expenses - a.purchase;
    return { uah, usd, fx: uah - usd * saleRate };
  }

  const [saleUsdRate, purchaseUsdRate] = await Promise.all([
    fetchNBUExchangeRate(a.saleDate, 'USD'),
    fetchNBUExchangeRate(purchaseDate, 'USD'),
  ]);
  if (saleUsdRate === null || purchaseUsdRate === null) {
    return null;
  }
  const usd = saleUah / saleUsdRate - purchaseUah / purchaseUsdRate;
  return { uah, usd, fx: uah - usd * saleUsdRate };
}

async function forEachLimited<T>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      await task(items[next++]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
