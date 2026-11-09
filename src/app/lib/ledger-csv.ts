/**
 * Ledger Live operation history (CSV): network fees and the spreads of swaps.
 *
 * Ledger exports one row per asset movement. A swap made in one transaction shows up as an
 * OUT row and an IN row of different assets under the same hash; a swap through a provider
 * (Changelly, a bridge, ...) is a send and, minutes later, a receive under different hashes.
 * The spread is what the swap cost: the value of what was given minus the value of what was
 * received, both at Ledger's price at the time of the operation.
 *
 * Fees are paid in the network's coin. Ledger writes them as a FEES row (contract calls, token
 * transfers) or inside an OUT row of the coin, whose amount then includes the fee. Incoming
 * rows also list the fee, but the sender paid it.
 */

import { parseCsv } from './csv';

const COLUMNS = {
  date: 'Operation Date',
  status: 'Status',
  ticker: 'Currency Ticker',
  type: 'Operation Type',
  amount: 'Operation Amount',
  fee: 'Operation Fees',
  hash: 'Operation Hash',
  account: 'Account Name',
  fiat: 'Countervalue Ticker',
  value: 'Countervalue at Operation Date',
} as const;

const CONFIRMED = 'Confirmed';

/** A receive matched to a send may come this long after it (providers, bridges). */
const LINK_AFTER_MS = 3 * 60 * 60 * 1000;
/** ...or slightly before it: block times of two chains are not in step. */
const LINK_BEFORE_MS = 5 * 60 * 1000;
/** Received/given value range of a matched send and receive. */
const LINK_MIN_RATIO = 0.5;
const LINK_MAX_RATIO = 1.05;
/** Values below this are mostly rounding (Ledger rounds to cents), so they are not matched. */
const LINK_MIN_VALUE = 0.1;

/** Fiat values from this amount up are precise enough to derive a price from. */
const PRICE_MIN_VALUE = 1;
/** A derived price is used for operations at most this far from it. */
const PRICE_MAX_DISTANCE_MS = 7 * 24 * 60 * 60 * 1000;

export interface LedgerOperation {
  /** Milliseconds since the epoch. */
  time: number;
  status: string;
  ticker: string;
  /** IN, OUT, FEES, or another Ledger type (DELEGATE, REWARD, NFT_IN, ...). */
  type: string;
  amount: number;
  fee: number;
  hash: string;
  account: string;
  fiat: string;
  /** Fiat value at the operation date; `null` if Ledger has no price. */
  value: number | null;
}

/** Network fees of one account in its coin. */
export interface FeeTotal {
  account: string;
  ticker: string;
  transactions: number;
  amount: number;
  value: number;
}

export interface SwapLeg {
  ticker: string;
  account: string;
  amount: number;
  value: number;
}

export interface Swap {
  /** `tx`: both sides in one transaction; `linked`: a send and a later receive matched by value. */
  kind: 'tx' | 'linked';
  /** Time of the send. */
  time: number;
  hashes: string[];
  given: SwapLeg[];
  received: SwapLeg[];
  givenValue: number;
  receivedValue: number;
  /** `givenValue − receivedValue`; negative if more value was received than given. */
  spread: number;
  /** Spread as a percentage of the given value. */
  spreadPercent: number;
  /** Network fees of the swap's transactions, in fiat. */
  fee: number;
}

export interface PairSpread {
  /** E.g. `USDC → ceUSDC`. */
  pair: string;
  swaps: number;
  givenValue: number;
  receivedValue: number;
  spread: number;
  spreadPercent: number;
  fee: number;
}

export interface LedgerAnalysis {
  fiat: string;
  /** Time of the earliest and the latest operation. */
  from: number;
  to: number;
  operations: number;
  /** Operations that are not confirmed and were left out. */
  skipped: number;
  fees: FeeTotal[];
  /** All network fees, in fiat. */
  feeValue: number;
  /** Newest first. */
  swaps: Swap[];
}

export function isLedgerCsv(content: string): boolean {
  const header = stripBom(content).split(/\r?\n/, 1)[0];
  return [COLUMNS.date, COLUMNS.type, COLUMNS.hash, COLUMNS.amount].every((name) =>
    header.includes(name),
  );
}

export function parseLedgerCsv(content: string): LedgerOperation[] {
  const [header = [], ...rows] = parseCsv(stripBom(content));
  const column = (name: string): number => {
    const index = header.indexOf(name);
    if (index < 0) {
      throw new Error(`у файлі немає колонки «${name}»`);
    }
    return index;
  };
  const c = {
    date: column(COLUMNS.date),
    status: column(COLUMNS.status),
    ticker: column(COLUMNS.ticker),
    type: column(COLUMNS.type),
    amount: column(COLUMNS.amount),
    fee: column(COLUMNS.fee),
    hash: column(COLUMNS.hash),
    account: column(COLUMNS.account),
    fiat: column(COLUMNS.fiat),
    value: column(COLUMNS.value),
  };

  return rows
    .filter((row) => row.length > 1)
    .map((row) => {
      const value = row[c.value]?.trim() ?? '';
      return {
        time: Date.parse(row[c.date]),
        status: row[c.status] ?? '',
        ticker: row[c.ticker] ?? '',
        type: row[c.type] ?? '',
        amount: parseNumber(row[c.amount]),
        fee: parseNumber(row[c.fee]),
        hash: row[c.hash] ?? '',
        account: row[c.account] ?? '',
        fiat: row[c.fiat] ?? '',
        value: value === '' ? null : parseNumber(value),
      };
    })
    .filter((op) => !Number.isNaN(op.time));
}

export function analyzeLedger(all: readonly LedgerOperation[]): LedgerAnalysis {
  const operations = all.filter((op) => op.status === CONFIRMED);
  const prices = new PriceBook(operations);
  const byHash = groupBy(operations, (op) => op.hash);

  const fees = new Map<string, FeeTotal>();
  const feeByHash = new Map<string, number>();
  const swaps: Swap[] = [];
  const sends: Movement[] = [];
  const receives: Movement[] = [];

  for (const [hash, group] of byHash) {
    const feeOps = new Set<LedgerOperation>();
    for (const accountOps of groupBy(group, (op) => op.account).values()) {
      const feeOp = paidFee(accountOps);
      if (!feeOp) {
        continue;
      }
      feeOps.add(feeOp);
      const amount = feeOp.type === 'FEES' ? feeOp.amount : feeOp.fee;
      const value = prices.value(feeOp, amount);
      const key = `${feeOp.account}\u0000${feeOp.ticker}`;
      const total = fees.get(key) ?? {
        account: feeOp.account,
        ticker: feeOp.ticker,
        transactions: 0,
        amount: 0,
        value: 0,
      };
      total.transactions++;
      total.amount += amount;
      total.value += value;
      fees.set(key, total);
      feeByHash.set(hash, (feeByHash.get(hash) ?? 0) + value);
    }

    const { given, received } = netMovements(group, feeOps, prices);
    const time = Math.min(...group.map((op) => op.time));
    if (given.length > 0 && received.length > 0) {
      swaps.push(makeSwap('tx', time, [hash], given, received, feeByHash.get(hash) ?? 0));
    } else {
      sends.push(...given.map((leg) => ({ ...leg, time, hash })));
      receives.push(...received.map((leg) => ({ ...leg, time, hash })));
    }
  }

  for (const [send, receive] of linkMovements(sends, receives)) {
    const hashes = [send.hash, receive.hash];
    const fee = hashes.reduce((sum, hash) => sum + (feeByHash.get(hash) ?? 0), 0);
    swaps.push(makeSwap('linked', send.time, hashes, [leg(send)], [leg(receive)], fee));
  }
  swaps.sort((a, b) => b.time - a.time);

  const feeTotals = [...fees.values()].sort((a, b) => b.value - a.value);
  const times = all.map((op) => op.time);
  return {
    fiat: operations[0]?.fiat ?? all[0]?.fiat ?? '',
    from: times.length ? Math.min(...times) : 0,
    to: times.length ? Math.max(...times) : 0,
    operations: all.length,
    skipped: all.length - operations.length,
    fees: feeTotals,
    feeValue: feeTotals.reduce((sum, fee) => sum + fee.value, 0),
    swaps,
  };
}

/** Swaps grouped by the assets exchanged, the costliest pair first. */
export function spreadsByPair(swaps: readonly Swap[]): PairSpread[] {
  const pairs = new Map<string, PairSpread>();
  for (const swap of swaps) {
    const pair = `${tickers(swap.given)} → ${tickers(swap.received)}`;
    const total = pairs.get(pair) ?? {
      pair,
      swaps: 0,
      givenValue: 0,
      receivedValue: 0,
      spread: 0,
      spreadPercent: 0,
      fee: 0,
    };
    total.swaps++;
    total.givenValue += swap.givenValue;
    total.receivedValue += swap.receivedValue;
    total.spread += swap.spread;
    total.fee += swap.fee;
    pairs.set(pair, total);
  }
  return [...pairs.values()]
    .map((p) => ({ ...p, spreadPercent: percent(p.spread, p.givenValue) }))
    .sort((a, b) => b.spread - a.spread);
}

interface Movement extends SwapLeg {
  time: number;
  hash: string;
}

/**
 * The operation through which `ops` (one account, one transaction) paid the network fee:
 * its FEES row, otherwise an outgoing row of the coin, whose amount includes the fee.
 */
function paidFee(ops: readonly LedgerOperation[]): LedgerOperation | undefined {
  return (
    ops.find((op) => op.type === 'FEES' && op.amount > 0) ??
    ops.find((op) => op.type === 'OUT' && op.fee > 0)
  );
}

/**
 * What one transaction sent and received, netted per asset. The fee is taken out of the
 * OUT row that carries it, so a swap of the coin does not count its fee as given.
 */
function netMovements(
  ops: readonly LedgerOperation[],
  feeOps: ReadonlySet<LedgerOperation>,
  prices: PriceBook,
): { given: SwapLeg[]; received: SwapLeg[] } {
  const net = new Map<string, SwapLeg>();
  for (const op of ops) {
    if ((op.type !== 'IN' && op.type !== 'OUT') || op.amount <= 0) {
      continue;
    }
    const sign = op.type === 'IN' ? 1 : -1;
    const amount = op.type === 'OUT' && feeOps.has(op) ? op.amount - op.fee : op.amount;
    const value = prices.value(op, amount);
    const total = net.get(op.ticker) ?? {
      ticker: op.ticker,
      account: op.account,
      amount: 0,
      value: 0,
    };
    total.amount += sign * amount;
    total.value += sign * value;
    net.set(op.ticker, total);
  }

  const given: SwapLeg[] = [];
  const received: SwapLeg[] = [];
  for (const total of net.values()) {
    if (total.amount > 0) {
      received.push(total);
    } else if (total.amount < 0) {
      given.push({ ...total, amount: -total.amount, value: -total.value });
    }
  }
  return { given, received };
}

/**
 * Pairs sends with later receives of another asset (or on another account) of a similar
 * value, closest values first. Each send and receive is used once.
 */
function linkMovements(
  sends: readonly Movement[],
  receives: readonly Movement[],
): [Movement, Movement][] {
  const candidates: { send: Movement; receive: Movement; score: number }[] = [];
  for (const send of sends) {
    if (send.value < LINK_MIN_VALUE) {
      continue;
    }
    for (const receive of receives) {
      const delay = receive.time - send.time;
      if (delay < -LINK_BEFORE_MS || delay > LINK_AFTER_MS) {
        continue;
      }
      if (receive.ticker === send.ticker && receive.account === send.account) {
        continue;
      }
      const ratio = receive.value / send.value;
      if (receive.value < LINK_MIN_VALUE || ratio < LINK_MIN_RATIO || ratio > LINK_MAX_RATIO) {
        continue;
      }
      // Closeness of value decides; the delay only breaks near-ties.
      const score = Math.abs(1 - ratio) + (Math.abs(delay) / LINK_AFTER_MS) * 0.01;
      candidates.push({ send, receive, score });
    }
  }
  candidates.sort((a, b) => a.score - b.score);

  const used = new Set<Movement>();
  const links: [Movement, Movement][] = [];
  for (const { send, receive } of candidates) {
    if (!used.has(send) && !used.has(receive)) {
      used.add(send);
      used.add(receive);
      links.push([send, receive]);
    }
  }
  return links;
}

function makeSwap(
  kind: Swap['kind'],
  time: number,
  hashes: string[],
  given: SwapLeg[],
  received: SwapLeg[],
  fee: number,
): Swap {
  const givenValue = given.reduce((sum, l) => sum + l.value, 0);
  const receivedValue = received.reduce((sum, l) => sum + l.value, 0);
  const spread = givenValue - receivedValue;
  return {
    kind,
    time,
    hashes,
    given,
    received,
    givenValue,
    receivedValue,
    spread,
    spreadPercent: percent(spread, givenValue),
    fee,
  };
}

/**
 * Prices per asset, from operations whose fiat value is large enough not to be distorted by
 * Ledger's rounding to cents. Small fees (often shown as 0.00) are valued with them.
 */
class PriceBook {
  private readonly points = new Map<string, { time: number; price: number }[]>();

  constructor(ops: readonly LedgerOperation[]) {
    for (const op of ops) {
      if (op.value !== null && op.value >= PRICE_MIN_VALUE && op.amount > 0) {
        const list = this.points.get(op.ticker) ?? [];
        list.push({ time: op.time, price: op.value / op.amount });
        this.points.set(op.ticker, list);
      }
    }
  }

  /** Fiat value of `amount` of the operation's asset at the operation's time. */
  value(op: LedgerOperation, amount: number): number {
    if (op.value !== null && op.value >= PRICE_MIN_VALUE && op.amount > 0) {
      return amount === op.amount ? op.value : (op.value * amount) / op.amount;
    }
    const price = this.nearest(op.ticker, op.time);
    if (price !== null) {
      return price * amount;
    }
    return op.value !== null && op.amount > 0 ? (op.value * amount) / op.amount : 0;
  }

  private nearest(ticker: string, time: number): number | null {
    let best: { distance: number; price: number } | null = null;
    for (const point of this.points.get(ticker) ?? []) {
      const distance = Math.abs(point.time - time);
      if (distance <= PRICE_MAX_DISTANCE_MS && (!best || distance < best.distance)) {
        best = { distance, price: point.price };
      }
    }
    return best?.price ?? null;
  }
}

function leg({ ticker, account, amount, value }: SwapLeg): SwapLeg {
  return { ticker, account, amount, value };
}

function tickers(legs: readonly SwapLeg[]): string {
  return legs.map((l) => l.ticker).join(' + ');
}

function percent(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const group = groups.get(k);
    if (group) {
      group.push(item);
    } else {
      groups.set(k, [item]);
    }
  }
  return groups;
}

function parseNumber(value: string | undefined): number {
  return parseFloat((value ?? '').replace(/,/g, '')) || 0;
}

function stripBom(content: string): string {
  return content.replace(/^﻿/, '');
}
