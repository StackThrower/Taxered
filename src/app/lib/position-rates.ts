/**
 * UAH amounts of an imported position from NBU rates: income at the rate of the sale date,
 * each cost at the rate of its own date and currency (pp. 164.4, 170.2.2 PKU; open question 2).
 */
import type { FinancialPosition } from '../declaration/f0121214/tax-model';
import { convertToKopecks, formatAmount } from './dps-xml/money';

/** NBU rate of a currency on an ISO date, or null if unknown. */
export type RateSource = (date: string, currency: string) => Promise<number | null>;

export async function applyNbuRates(
  position: FinancialPosition,
  fetchRate: RateSource,
): Promise<FinancialPosition> {
  if (!position.currency || position.currency === 'UAH' || !position.saleDate) {
    return position;
  }
  const rates = new Map<string, Promise<number | null>>();
  const rate = (date: string, currency: string): Promise<number | null> => {
    if (currency === 'UAH') {
      return Promise.resolve(1);
    }
    const key = `${date}|${currency}`;
    if (!rates.has(key)) {
      rates.set(key, fetchRate(date, currency));
    }
    return rates.get(key)!;
  };

  let result = position;
  const isTrade = position.assetType !== 'dividends' && position.assetType !== 'interest';

  if (isTrade && position.purchaseDate) {
    const purchaseRate = await rate(position.purchaseDate, position.currency);
    if (purchaseRate !== null) {
      result = {
        ...result,
        purchaseRate: purchaseRate.toFixed(4),
        purchasePrice: formatAmount(
          convertToKopecks(position.purchasePriceForeign, purchaseRate.toFixed(4)),
        ),
      };
    }
  }

  const saleRate = await rate(position.saleDate, position.currency);
  if (saleRate !== null) {
    result = {
      ...result,
      saleRate: saleRate.toFixed(4),
      salePrice: formatAmount(convertToKopecks(position.salePriceForeign, saleRate.toFixed(4))),
    };
  }

  if (isTrade && (position.purchaseCommissionForeign || position.saleCommissionForeign)) {
    const commissions = [
      [
        position.purchaseCommissionForeign,
        position.purchaseCommissionCurrency,
        position.purchaseDate,
      ],
      [position.saleCommissionForeign, position.saleCommissionCurrency, position.saleDate],
    ] as const;
    // The commissions are the costs of an imported lot; recomputed, never added twice.
    let expenses = 0;
    for (const [amount, currency, date] of commissions) {
      if (!amount || !date) {
        continue;
      }
      const commissionRate = await rate(date, currency || position.currency);
      if (commissionRate !== null) {
        expenses += convertToKopecks(amount, commissionRate.toFixed(4));
      }
    }
    result = { ...result, expenses: formatAmount(expenses) };
  }

  return result;
}
