import { analyzeLedger, isLedgerCsv, parseLedgerCsv, spreadsByPair } from './ledger-csv';

const HEADER =
  'Operation Date,Status,Currency Ticker,Operation Type,Operation Amount,Operation Fees,Operation Hash,Account Name,Account xpub,Countervalue Ticker,Countervalue at Operation Date,Countervalue at CSV Export';

/** One CSV row; `value` is the countervalue at the operation date. */
function row(
  date: string,
  ticker: string,
  type: string,
  amount: string,
  fee: string,
  hash: string,
  account: string,
  value: string,
  status = 'Confirmed',
): string {
  return [date, status, ticker, type, amount, fee, hash, account, 'xpub', 'USD', value, value].join(
    ',',
  );
}

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join('\n');
}

function analyze(...rows: string[]) {
  return analyzeLedger(parseLedgerCsv(csv(...rows)));
}

describe('isLedgerCsv', () => {
  it('recognizes the Ledger Live export header', () => {
    expect(isLedgerCsv(`﻿${HEADER}\n`)).toBe(true);
    expect(isLedgerCsv('Statement,Header,Field Name,Field Value\n')).toBe(false);
  });
});

describe('analyzeLedger', () => {
  it('finds a token swap in one transaction and its fee row', () => {
    const a = analyze(
      row(
        '2026-11-07T18:34:35.000Z',
        'ETH',
        'FEES',
        '0.0001',
        '0.0001',
        '0xa',
        'Ethereum 1',
        '0.25',
      ),
      row(
        '2026-11-07T18:34:35.000Z',
        'USDC',
        'OUT',
        '103.777707',
        '',
        '0xa',
        'Ethereum 1',
        '103.75',
      ),
      row(
        '2026-11-07T18:34:35.000Z',
        'ceUSDC',
        'IN',
        '98.479135',
        '',
        '0xa',
        'Ethereum 1',
        '98.43',
      ),
    );

    expect(a.swaps).toHaveLength(1);
    const [swap] = a.swaps;
    expect(swap.kind).toBe('tx');
    expect(swap.given).toEqual([
      { ticker: 'USDC', account: 'Ethereum 1', amount: 103.777707, value: 103.75 },
    ]);
    expect(swap.received[0].ticker).toBe('ceUSDC');
    expect(swap.spread).toBeCloseTo(5.32, 6);
    expect(swap.spreadPercent).toBeCloseTo((5.32 / 103.75) * 100, 6);
    expect(swap.fee).toBeCloseTo(0.25, 6);
    expect(a.fees).toEqual([
      { account: 'Ethereum 1', ticker: 'ETH', transactions: 1, amount: 0.0001, value: 0.25 },
    ]);
  });

  it('takes the fee out of an outgoing coin row before measuring the spread', () => {
    // 1.001 ETH out at $2000, of which 0.001 ETH is the fee.
    const a = analyze(
      row('2026-11-05T15:43:35.000Z', 'ETH', 'OUT', '1.001', '0.001', '0xb', 'Ethereum 1', '2002'),
      row('2026-11-05T15:43:35.000Z', 'stETH', 'IN', '0.999', '', '0xb', 'Ethereum 1', '1998'),
    );

    const [swap] = a.swaps;
    expect(swap.given[0].amount).toBeCloseTo(1, 9);
    expect(swap.givenValue).toBeCloseTo(2000, 6);
    expect(swap.spread).toBeCloseTo(2, 6);
    expect(swap.fee).toBeCloseTo(2, 6);
    expect(a.feeValue).toBeCloseTo(2, 6);
  });

  it('does not count fees of incoming transfers, which the sender paid', () => {
    const a = analyze(
      row('2026-11-05T13:52:00.000Z', 'ETH', 'IN', '0.5', '0.0002', '0xc', 'Ethereum 1', '1000'),
    );
    expect(a.fees).toEqual([]);
    expect(a.swaps).toEqual([]);
  });

  it('counts a fee once when a transaction has both a FEES row and an IN row', () => {
    const a = analyze(
      row('2026-11-09T16:14:35.000Z', 'ETH', 'FEES', '0.0005', '0.0005', '0xd', 'Ethereum 1', '1'),
      row(
        '2026-11-09T16:14:35.000Z',
        'ETH',
        'IN',
        '0.00001',
        '0.0005',
        '0xd',
        'Ethereum 1',
        '0.02',
      ),
    );
    expect(a.fees).toHaveLength(1);
    expect(a.fees[0].amount).toBe(0.0005);
  });

  it('values tiny fees with a price from larger operations, not the rounded 0.00', () => {
    const a = analyze(
      row('2026-09-12T13:11:00.000Z', 'BNB', 'IN', '1', '0.0000021', '0xe', 'BNB 1', '700'),
      row('2026-09-12T15:05:00.000Z', 'BNB', 'FEES', '0.00001', '0.00001', '0xf', 'BNB 1', '0.00'),
    );
    expect(a.feeValue).toBeCloseTo(0.007, 9);
  });

  it('links a send and a later receive of another asset with a similar value', () => {
    const a = analyze(
      row('2026-11-03T14:53:00.000Z', 'BTC', 'OUT', '0.008', '0.00001', 'b1', 'Bitcoin 1', '640'),
      row('2026-11-03T15:27:00.000Z', 'BTC', 'OUT', '0.006', '0.00001', 'b2', 'Bitcoin 1', '480'),
      // LBTC arrives with a small deduction under the same hash.
      row('2026-11-03T16:00:00.000Z', 'LBTC', 'IN', '0.00795', '', '0x1', 'Ethereum 1', '636'),
      row('2026-11-03T16:00:00.000Z', 'LBTC', 'OUT', '0.00001', '', '0x1', 'Ethereum 1', '0.8'),
      row('2026-11-03T16:10:00.000Z', 'LBTC', 'IN', '0.00595', '', '0x2', 'Ethereum 1', '476'),
    );

    expect(a.swaps.map((s) => [s.kind, s.hashes])).toEqual([
      ['linked', ['b2', '0x2']],
      ['linked', ['b1', '0x1']],
    ]);
    const first = a.swaps[1];
    expect(first.givenValue).toBeCloseTo(639.2, 6);
    expect(first.receivedValue).toBeCloseTo(635.2, 6);
    expect(first.spread).toBeCloseTo(4, 6);
  });

  it('does not link a receive that is too late, too different, or the same asset back', () => {
    const a = analyze(
      row('2026-09-12T15:45:00.000Z', 'USDT', 'OUT', '5.12', '', '0x1', 'BNB 1', '5.12'),
      row('2026-09-12T15:47:00.000Z', 'USDT', 'IN', '5.11', '', '0x2', 'BNB 1', '5.11'),
      row('2026-11-05T09:27:00.000Z', 'LBTC', 'OUT', '0.0157', '', '0x3', 'Ethereum 1', '1263'),
      row('2026-11-05T13:52:00.000Z', 'ETH', 'IN', '0.4', '0.0001', '0x4', 'Ethereum 1', '1000'),
      row('2026-11-06T10:00:00.000Z', 'BTC', 'OUT', '0.01', '0.00001', 'b5', 'Bitcoin 1', '800'),
      row('2026-11-06T10:30:00.000Z', 'ETH', 'IN', '0.1', '0.0001', '0x6', 'Ethereum 1', '250'),
    );
    expect(a.swaps).toEqual([]);
  });

  it('leaves out operations that are not confirmed', () => {
    const a = analyze(
      row('2026-11-01T00:00:00.000Z', 'ETH', 'OUT', '1', '0.001', '0x1', 'E', '2000', 'Failed'),
    );
    expect(a.operations).toBe(1);
    expect(a.skipped).toBe(1);
    expect(a.fees).toEqual([]);
  });
});

describe('spreadsByPair', () => {
  it('sums swaps of the same pair, the costliest first', () => {
    const a = analyze(
      row('2026-09-19T14:27:00.000Z', 'USDC', 'OUT', '100', '', '0x1', 'E', '100'),
      row('2026-09-19T14:27:00.000Z', 'ceUSDC', 'IN', '95', '', '0x1', 'E', '95'),
      row('2026-09-19T15:27:00.000Z', 'USDC', 'OUT', '50', '', '0x2', 'E', '50'),
      row('2026-09-19T15:27:00.000Z', 'ceUSDC', 'IN', '48', '', '0x2', 'E', '48'),
      row('2026-09-19T16:27:00.000Z', 'ceUSDC', 'OUT', '143', '', '0x3', 'E', '143'),
      row('2026-09-19T16:27:00.000Z', 'USDC', 'IN', '150', '', '0x3', 'E', '150'),
    );
    const pairs = spreadsByPair(a.swaps);
    expect(pairs.map((p) => [p.pair, p.swaps])).toEqual([
      ['USDC → ceUSDC', 2],
      ['ceUSDC → USDC', 1],
    ]);
    expect(pairs[0].spread).toBeCloseTo(7, 9);
    expect(pairs[0].spreadPercent).toBeCloseTo((7 / 150) * 100, 9);
    expect(pairs[1].spread).toBeCloseTo(-7, 9);
  });
});
