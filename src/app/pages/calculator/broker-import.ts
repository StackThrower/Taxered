import { parseAnyBrokerXML, readFileAsText } from '../../lib/ib-xml-parser';
import { fetchNBUExchangeRate } from '../../lib/nbu-exchange-rates';
import type { FileIncome } from './returns-model';

/** Parallel NBU requests per import; enough to be quick without hammering the API. */
const CONCURRENCY = 6;

/**
 * Reads an Interactive Brokers or Freedom Finance XML report and sums the realized
 * income of `year` in UAH (NBU rates, as for the declaration) and in USD.
 */
export async function importBrokerReport(
  file: File,
  year: number,
  onProgress: (done: number, total: number) => void,
): Promise<FileIncome> {
  const content = await readFileAsText(file);
  const parsed = parseAnyBrokerXML(content, file.name, year);
  const warnings = [...parsed.warnings];

  const income: FileIncome = {
    name: file.name,
    source: parsed.source,
    trades: 0,
    dividends: 0,
    tradesUah: 0,
    fxUah: 0,
    dividendsUah: 0,
    tradesUsd: 0,
    dividendsUsd: 0,
    warnings,
  };

  let done = 0;
  let skipped = 0;
  onProgress(0, parsed.positions.length);

  await forEachLimited(parsed.positions, CONCURRENCY, async (position) => {
    const amounts = await positionIncome(position);
    onProgress(++done, parsed.positions.length);
    if (!amounts) {
      skipped++;
      return;
    }
    if (position.assetType === 'dividends') {
      income.dividends++;
      income.dividendsUah += amounts.uah;
      income.dividendsUsd += amounts.usd;
    } else {
      income.trades++;
      income.tradesUah += amounts.uah;
      income.fxUah += amounts.fx;
      income.tradesUsd += amounts.usd;
    }
  });

  if (skipped > 0) {
    warnings.push(`Не вдалося отримати курс НБУ для ${skipped} операцій — їх не враховано.`);
  }
  return income;
}

interface PositionAmounts {
  currency: string;
  assetType: string;
  purchaseDate: string;
  saleDate: string;
  purchasePriceForeign: string;
  salePriceForeign: string;
  expenses: string;
}

/**
 * Profit of one closed position (or dividend) in UAH and USD, and the exchange-rate part of
 * the UAH profit: what is left after valuing the dollar profit at the sale-date rate.
 * `null` if a rate is missing.
 */
async function positionIncome(
  p: PositionAmounts,
): Promise<{ uah: number; usd: number; fx: number } | null> {
  const purchase = parseFloat(p.purchasePriceForeign) || 0;
  const sale = parseFloat(p.salePriceForeign) || 0;
  const expenses = parseFloat(p.expenses) || 0;
  // Dividends have no purchase; positions without a purchase date are valued on the sale date.
  const purchaseDate = p.assetType === 'dividends' || !p.purchaseDate ? p.saleDate : p.purchaseDate;

  const [saleRate, purchaseRate] = await Promise.all([
    fetchNBUExchangeRate(p.saleDate, p.currency),
    fetchNBUExchangeRate(purchaseDate, p.currency),
  ]);
  if (saleRate === null || purchaseRate === null) {
    return null;
  }
  const saleUah = (sale - expenses) * saleRate;
  const purchaseUah = purchase * purchaseRate;
  const uah = saleUah - purchaseUah;

  if (p.currency === 'USD') {
    const usd = sale - expenses - purchase;
    return { uah, usd, fx: uah - usd * saleRate };
  }

  const [saleUsdRate, purchaseUsdRate] = await Promise.all([
    fetchNBUExchangeRate(p.saleDate, 'USD'),
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
