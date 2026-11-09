import { analyzeLedger, parseLedgerCsv } from './ledger-csv';
import {
  balances,
  currentHoldings,
  heldTickers,
  negativeBalances,
  portfolioHistory,
} from './ledger-portfolio';

const HEADER =
  'Operation Date,Status,Currency Ticker,Operation Type,Operation Amount,Operation Fees,Operation Hash,Account Name,Account xpub,Countervalue Ticker,Countervalue at Operation Date,Countervalue at CSV Export';

function row(
  date: string,
  ticker: string,
  type: string,
  amount: string,
  fee: string,
  hash: string,
  account: string,
  value: string,
  exportValue = value,
): string {
  return [
    date,
    'Confirmed',
    ticker,
    type,
    amount,
    fee,
    hash,
    account,
    'x',
    'USD',
    value,
    exportValue,
  ].join(',');
}

function ops(...rows: string[]) {
  return parseLedgerCsv([HEADER, ...rows].join('\n'));
}

describe('balances', () => {
  it('follows receives, sends (fee included) and fee rows', () => {
    const o = ops(
      row('2026-01-01T00:00:00Z', 'ETH', 'IN', '1', '0.001', '0x1', 'E', '2000'),
      row('2026-01-02T00:00:00Z', 'ETH', 'OUT', '0.3', '0.01', '0x2', 'E', '600'),
      row('2026-01-03T00:00:00Z', 'ETH', 'FEES', '0.02', '0.02', '0x3', 'E', '40'),
      row('2026-01-03T00:00:00Z', 'USDC', 'IN', '50', '', '0x3', 'E', '50'),
    );
    const b = balances(o);
    expect(b.get('ETH')).toBeCloseTo(0.68, 12);
    expect(b.get('USDC')).toBe(50);
    expect(negativeBalances(o)).toEqual([]);
    expect(heldTickers(o).sort()).toEqual(['ETH', 'USDC']);
  });

  it('reports assets that go negative when the history is incomplete', () => {
    const o = ops(row('2026-01-01T00:00:00Z', 'BTC', 'OUT', '0.1', '0.0001', 'b1', 'B', '9000'));
    expect(negativeBalances(o)).toEqual(['BTC']);
  });
});

describe('portfolioHistory', () => {
  it('values balances after each transaction and tracks deposits minus withdrawals', () => {
    const o = ops(
      row('2026-01-01T00:00:00Z', 'ETH', 'IN', '1', '0.001', '0x1', 'E', '2000'),
      // ETH → USDC in one transaction: not a deposit.
      row('2026-01-02T00:00:00Z', 'ETH', 'OUT', '0.5', '0.001', '0x2', 'E', '1100'),
      row('2026-01-02T00:00:00Z', 'USDC', 'IN', '1090', '', '0x2', 'E', '1090'),
      // A withdrawal of USDC.
      row('2026-01-03T00:00:00Z', 'ETH', 'FEES', '0.001', '0.001', '0x3', 'E', '2.2'),
      row('2026-01-03T00:00:00Z', 'USDC', 'OUT', '500', '', '0x3', 'E', '500'),
    );
    const a = analyzeLedger(o);
    const history = portfolioHistory(o, a.flows, a.swaps);

    expect(history.map((p) => p.invested)).toEqual([2000, 2000, 1500]);
    // ETH is worth 2000 on day 1 and 2200 from day 2 on.
    expect(history[0].value).toBeCloseTo(2000, 6);
    expect(history[1].value).toBeCloseTo(0.5 * 2200 + 1090, 6);
    expect(history[2].value).toBeCloseTo(0.499 * 2200 + 590, 6);
  });

  it('counts value in transit between the send and the receive of a linked swap', () => {
    const o = ops(
      row('2026-01-01T00:00:00Z', 'USDC', 'IN', '700', '', '0x1', 'E', '700'),
      row('2026-01-01T10:00:00Z', 'ETH', 'FEES', '0.0001', '0.0001', '0x2', 'E', '0.2'),
      row('2026-01-01T10:00:00Z', 'USDC', 'OUT', '700', '', '0x2', 'E', '700'),
      row('2026-01-01T10:05:00Z', 'BTC', 'IN', '0.0001', '0.00001', 'b1', 'B', '5'),
      row('2026-01-01T10:10:00Z', 'BTC', 'IN', '0.0099', '0.00001', 'b2', 'B', '690'),
    );
    const a = analyzeLedger(o);
    expect(a.swaps.map((s) => s.kind)).toEqual(['linked']);
    const history = portfolioHistory(o, a.flows, a.swaps);
    // While USDC is on its way, the portfolio still holds its 700 (plus a small deposit).
    expect(history[1].value).toBeCloseTo(700, 6);
    expect(history[2].value).toBeCloseTo(705, 6);
    expect(history[3].value).toBeCloseTo(0.01 * (690 / 0.0099), 6);
  });
});

describe('currentHoldings', () => {
  it('uses market prices, falls back to the export price and hides dust', () => {
    const o = ops(
      row('2026-01-01T00:00:00Z', 'ETH', 'IN', '1', '0.001', '0x1', 'E', '2000', '2500'),
      row('2026-01-01T00:00:00Z', 'mstkeUSDT', 'IN', '35', '', '0x2', 'E', '35', '34.9'),
      row('2026-01-01T00:00:00Z', 'DUST', 'IN', '0.0001', '', '0x3', 'E', '0.00', '0.001'),
    );
    const holdings = currentHoldings(o, new Map([['ETH', { price: 3000, change24h: -1.5 }]]));
    expect(holdings).toEqual([
      { ticker: 'ETH', amount: 1, price: 3000, value: 3000, change24h: -1.5, source: 'market' },
      {
        ticker: 'mstkeUSDT',
        amount: 35,
        price: 34.9 / 35,
        value: 34.9,
        change24h: null,
        source: 'export',
      },
    ]);
  });
});
