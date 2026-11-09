/**
 * Balances and value of a Ledger Live portfolio over its operation history.
 *
 * Balances start at zero and follow every confirmed operation, so the history has to be
 * complete. The value at each transaction uses the prices found in the file (Ledger's
 * countervalues), interpolated between operations of the same asset.
 */

import type { MarketPrice } from './crypto-prices';
import { CONFIRMED, Flow, LedgerOperation, PriceBook, Swap } from './ledger-csv';

/** Balances below this are rounding left over from sending everything. */
const DUST_AMOUNT = 1e-9;
/** Holdings worth less than this are hidden. */
const DUST_VALUE = 0.01;

export interface Holding {
  ticker: string;
  amount: number;
  /** Current price; `null` if neither CoinGecko nor the file has one. */
  price: number | null;
  value: number;
  change24h: number | null;
  /** `market`: CoinGecko now; `export`: Ledger's price when the file was exported. */
  source: 'market' | 'export' | null;
}

export interface PortfolioPoint {
  time: number;
  /** Value of all balances after the transaction. */
  value: number;
  /** Deposits minus withdrawals up to and including the transaction. */
  invested: number;
}

/** Balance of every asset after all operations, summed over accounts. */
export function balances(ops: readonly LedgerOperation[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const op of confirmed(ops)) {
    result.set(op.ticker, (result.get(op.ticker) ?? 0) + balanceChange(op));
  }
  return result;
}

/** Assets whose balance went below zero: the file does not hold the whole history. */
export function negativeBalances(ops: readonly LedgerOperation[]): string[] {
  return [...balances(ops)].filter(([, amount]) => amount < -DUST_AMOUNT).map(([ticker]) => ticker);
}

/**
 * One point per transaction, oldest first. Between the send and the receive of a linked swap
 * the value is in transit; it is counted at the value sent so the line does not dip.
 */
export function portfolioHistory(
  ops: readonly LedgerOperation[],
  flows: readonly Flow[],
  swaps: readonly Swap[],
): PortfolioPoint[] {
  const transits = swaps.filter((swap) => swap.receivedTime > swap.time);
  const sorted = confirmed(ops).sort((a, b) => a.time - b.time);
  const prices = new PriceBook(sorted);
  const flowsByHash = new Map<string, number>();
  for (const flow of flows) {
    flowsByHash.set(flow.hash, (flowsByHash.get(flow.hash) ?? 0) + flow.value);
  }

  const transactions = new Map<string, LedgerOperation[]>();
  for (const op of sorted) {
    const group = transactions.get(op.hash);
    if (group) {
      group.push(op);
    } else {
      transactions.set(op.hash, [op]);
    }
  }

  const held = new Map<string, number>();
  let invested = 0;
  const points: PortfolioPoint[] = [];
  for (const [hash, group] of transactions) {
    for (const op of group) {
      held.set(op.ticker, (held.get(op.ticker) ?? 0) + balanceChange(op));
    }
    invested += flowsByHash.get(hash) ?? 0;
    const time = group[0].time;
    let value = 0;
    for (const transit of transits) {
      if (transit.time <= time && time < transit.receivedTime) {
        value += transit.givenValue;
      }
    }
    for (const [ticker, amount] of held) {
      if (amount > DUST_AMOUNT) {
        value += amount * (prices.priceAt(ticker, time) ?? 0);
      }
    }
    points.push({ time, value, invested });
  }
  return points;
}

/**
 * Current balances valued at market prices, falling back to the price Ledger had when the
 * file was exported. The largest holding first; dust is left out.
 */
export function currentHoldings(
  ops: readonly LedgerOperation[],
  market: ReadonlyMap<string, MarketPrice>,
): Holding[] {
  const exported = exportPrices(ops);
  const holdings: Holding[] = [];
  for (const [ticker, amount] of balances(ops)) {
    if (amount <= DUST_AMOUNT) {
      continue;
    }
    const quote = market.get(ticker.toUpperCase());
    const fallback = exported.get(ticker);
    const price = quote?.price ?? fallback ?? null;
    const holding: Holding = {
      ticker,
      amount,
      price,
      value: price === null ? 0 : amount * price,
      change24h: quote?.change24h ?? null,
      source: quote ? 'market' : fallback !== undefined ? 'export' : null,
    };
    if (holding.value >= DUST_VALUE || price === null) {
      holdings.push(holding);
    }
  }
  return holdings.sort((a, b) => b.value - a.value);
}

/** Tickers with a positive balance, to ask the market for. */
export function heldTickers(ops: readonly LedgerOperation[]): string[] {
  return [...balances(ops)].filter(([, amount]) => amount > DUST_AMOUNT).map(([t]) => t);
}

/** How an operation changes the balance of its asset. */
function balanceChange(op: LedgerOperation): number {
  switch (op.type) {
    case 'IN':
    case 'REWARD':
    case 'REWARD_PAYOUT':
      return op.amount;
    case 'OUT':
    case 'FEES':
      // A coin's OUT amount already includes the fee.
      return -op.amount;
    default:
      // Delegation, NFT and similar operations only cost the sender the fee.
      return op.type.endsWith('IN') ? 0 : -op.fee;
  }
}

/** Price per asset when the file was exported, from its latest operation. */
function exportPrices(ops: readonly LedgerOperation[]): Map<string, number> {
  const prices = new Map<string, { price: number; precise: boolean }>();
  for (const op of [...ops].sort((a, b) => a.time - b.time)) {
    if (op.exportValue === null || op.exportValue <= 0 || op.amount <= 0) {
      continue;
    }
    const precise = op.exportValue >= 1;
    const known = prices.get(op.ticker);
    if (!known || precise || !known.precise) {
      prices.set(op.ticker, { price: op.exportValue / op.amount, precise });
    }
  }
  return new Map([...prices].map(([ticker, { price }]) => [ticker, price]));
}

function confirmed(ops: readonly LedgerOperation[]): LedgerOperation[] {
  return ops.filter((op) => op.status === CONFIRMED);
}
