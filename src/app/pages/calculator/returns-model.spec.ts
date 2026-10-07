import {
  AnalysisOptions,
  FileIncome,
  StatementAccount,
  YearInput,
  analyzeReturns,
  startingCapital,
  statementYear,
} from './returns-model';

const report = (tradesUsd: number, dividendsUsd = 0, rate = 40, fxUah = 0): FileIncome => ({
  name: 'report.csv',
  account: { id: 'U1', start: '', end: '', startingValue: 0, endingValue: 0, deposits: 0 },
  trades: 1,
  dividends: dividendsUsd ? 1 : 0,
  tradesUah: tradesUsd * rate + fxUah,
  fxUah,
  dividendsUah: dividendsUsd * rate,
  tradesUsd,
  dividendsUsd,
  warnings: [],
});

const year = (y: number, files: FileIncome[], inflation: number, deposits = 0): YearInput => ({
  year: y,
  files,
  deposits,
  inflation,
});

/** NBU rate 40 UAH/USD at every year end. */
const flatRates = Object.fromEntries(
  Array.from({ length: 20 }, (_, i) => [2010 + i, 40]),
) as AnalysisOptions['usdRates'];

describe('analyzeReturns', () => {
  it('computes nominal and real returns and compounds capital against the inflation threshold', () => {
    const a = analyzeReturns([year(2024, [report(1000)], 3), year(2025, [report(550)], 2)], {
      currency: 'USD',
      initialCapital: 10000,
      includeTaxes: false,
      usdRates: flatRates,
    });

    expect(a.rows.map((r) => r.returnPct)).toEqual([10, 5]);
    expect(a.rows[0].realReturnPct).toBeCloseTo((1.1 / 1.03 - 1) * 100);
    expect(a.finalCapital).toBeCloseTo(11550);
    expect(a.finalThreshold).toBeCloseTo(10000 * 1.03 * 1.02);
    expect(a.realGain).toBeCloseTo(11550 - 10506);
    // The yearly "above inflation" amounts add up to the final gap.
    expect(a.rows.reduce((t, r) => t + r.aboveInflation, 0)).toBeCloseTo(a.realGain);
    expect(a.realGainInStartPrices).toBeCloseTo(a.realGain / (1.03 * 1.02));
  });

  it('deducts Ukrainian taxes computed in UAH and converted at the year-end rate', () => {
    const a = analyzeReturns([year(2025, [report(1000, 100)], 0)], {
      currency: 'USD',
      initialCapital: 10000,
      includeTaxes: true,
      usdRates: flatRates,
    });

    // Trades: 18% + 5%; dividends: 9% + 5%.
    expect(a.rows[0].tax).toBeCloseTo(1000 * 0.23 + 100 * 0.14);
    expect(a.net).toBeCloseTo(1100 - 244);
  });

  it('fills gaps between uploaded years so inflation still applies', () => {
    const a = analyzeReturns([year(2022, [report(100)], 10), year(2024, [report(100)], 10)], {
      currency: 'UAH',
      initialCapital: 1000,
      includeTaxes: false,
      usdRates: flatRates,
    });

    expect(a.rows.map((r) => [r.year, r.missing])).toEqual([
      [2022, false],
      [2023, true],
      [2024, false],
    ]);
    expect(a.rows[1].net).toBe(0);
    expect(a.rows[1].inflation).toBe(5.1);
  });

  it('treats deposits as invested money for both the return base and the threshold', () => {
    const a = analyzeReturns([year(2025, [report(1100)], 10, 1000)], {
      currency: 'USD',
      initialCapital: 10000,
      includeTaxes: false,
      usdRates: flatRates,
    });

    expect(a.rows[0].returnPct).toBeCloseTo(10);
    expect(a.finalThreshold).toBeCloseTo(12100);
    expect(a.realGain).toBeCloseTo(0);
  });

  it('reports no percentages without capital', () => {
    const a = analyzeReturns([year(2025, [report(500)], 3)], {
      currency: 'USD',
      initialCapital: 0,
      includeTaxes: false,
      usdRates: flatRates,
    });

    expect(a.hasCapital).toBe(false);
    expect(a.rows[0].returnPct).toBeNull();
    expect(a.avgRealReturnPct).toBeNull();
    expect(a.net).toBe(500);
  });

  it('revalues the dollar capital and income at the year-end rate in UAH', () => {
    // 10 000 $ at 36.57 → 41.0 UAH/USD; 1 000 $ trade profit sold at 40 with 2 000 UAH
    // of it being the realized exchange-rate difference.
    const a = analyzeReturns([year(2024, [report(1000, 0, 40, 2000)], 12)], {
      currency: 'UAH',
      initialCapital: 365700,
      includeTaxes: false,
      usdRates: { 2023: 36.57, 2024: 41 },
    });
    const row = a.rows[0];

    expect(row.trades).toBeCloseTo(40000);
    expect(a.finalCapital).toBeCloseTo(11000 * 41);
    expect(row.fx).toBeCloseTo(11000 * 41 - 365700 - 40000);
    expect(row.net).toBeCloseTo(row.trades + row.fx);
    expect(row.returnPct).toBeCloseTo(((11000 * 41) / 365700 - 1) * 100);
  });

  it('separates the tax paid on the realized exchange-rate difference', () => {
    const a = analyzeReturns([year(2025, [report(1000, 0, 40, 4000)], 0)], {
      currency: 'UAH',
      initialCapital: 400000,
      includeTaxes: true,
      usdRates: flatRates,
    });

    expect(a.rows[0].tax).toBeCloseTo(44000 * 0.23);
    expect(a.taxOnFx).toBeCloseTo(4000 * 0.23);
    // With a flat rate the hryvnia did not move this year: the realized difference was
    // earned (and revalued) in earlier years, so it adds nothing now — but is still taxed.
    expect(a.fx).toBeCloseTo(0);
  });

  it('keeps the realized difference when year-end rates are unknown', () => {
    const a = analyzeReturns([year(2025, [report(1000, 0, 40, 4000)], 0)], {
      currency: 'UAH',
      initialCapital: 400000,
      includeTaxes: false,
      usdRates: {},
    });

    expect(a.fx).toBeCloseTo(4000);
    expect(a.net).toBeCloseTo(44000);
  });

  it('has no exchange-rate difference in USD', () => {
    const a = analyzeReturns([year(2024, [report(1000, 0, 40, 2000)], 3)], {
      currency: 'USD',
      initialCapital: 10000,
      includeTaxes: false,
      usdRates: { 2023: 36.57, 2024: 41 },
    });

    expect(a.fx).toBe(0);
    expect(a.net).toBe(1000);
  });
});

describe('statement capital', () => {
  const statement = (account: Partial<StatementAccount>): FileIncome => ({
    ...report(0),
    account: {
      id: 'U1',
      start: '',
      end: '',
      startingValue: 0,
      endingValue: 0,
      deposits: 0,
      ...account,
    },
  });
  const files = [
    statement({
      start: '2024-01-01',
      end: '2024-12-31',
      startingValue: 0,
      endingValue: 54000,
      deposits: 50000,
    }),
    statement({
      start: '2025-01-01',
      end: '2025-12-31',
      startingValue: 54000,
      endingValue: 60000,
      deposits: 2000,
    }),
    // The same account's statement for part of the year, uploaded again elsewhere.
    statement({ start: '2025-01-01', end: '2025-06-30', startingValue: 54000, deposits: 1000 }),
    statement({
      id: 'U2',
      start: '2025-03-01',
      end: '2025-12-31',
      startingValue: 100,
      endingValue: 100,
    }),
    statement({ start: '2025-01-01', end: '2026-10-05', startingValue: 54000, deposits: 9000 }),
  ];

  it('sums the starting value of each account from its earliest statement of the year', () => {
    expect(startingCapital(files, 2025)).toEqual({ value: 54100, date: '2025-01-01' });
    expect(startingCapital(files, 2024)).toEqual({ value: 0, date: '2024-01-01' });
    expect(startingCapital(files, 2023)).toBeNull();
  });

  it('takes the deposits and the gain of the statements within the year', () => {
    expect(statementYear(files, 2024)).toEqual({ deposits: 50000, gain: 4000 });
    expect(statementYear(files, 2025)).toEqual({ deposits: 2000, gain: 4000 });
    expect(statementYear(files, 2026)).toBeNull();
  });
});

describe('account value from statements', () => {
  const options: AnalysisOptions = {
    currency: 'USD',
    initialCapital: 10000,
    includeTaxes: false,
    usdRates: { 2024: 40, 2025: 42 },
  };

  it('follows the account value, splitting the gain into realized and the rest', () => {
    const a = analyzeReturns(
      [
        {
          year: 2025,
          files: [report(300, 100, 40)],
          deposits: 2000,
          inflation: 0,
          accountGainUsd: 1500,
        },
      ],
      options,
    );
    expect(a.rows[0].trades).toBe(300);
    expect(a.rows[0].dividends).toBe(100);
    expect(a.rows[0].unrealized).toBe(1100);
    expect(a.finalCapital).toBe(13500);
    expect(a.unrealized).toBe(1100);
  });

  it('takes the tax on realized income out of the account value', () => {
    const a = analyzeReturns(
      [
        {
          year: 2025,
          files: [report(300, 100, 40)],
          deposits: 0,
          inflation: 0,
          accountGainUsd: 1500,
        },
      ],
      { ...options, includeTaxes: true },
    );
    expect(a.rows[0].tax).toBeGreaterThan(0);
    expect(a.finalCapital).toBeCloseTo(11500 - a.rows[0].tax);
  });

  it('values the unrealized gain at the year-end rate in UAH, with no rate difference', () => {
    const usd = analyzeReturns(
      [{ year: 2025, files: [], deposits: 0, inflation: 0, accountGainUsd: 1000 }],
      options,
    );
    const uah = analyzeReturns(
      [{ year: 2025, files: [], deposits: 0, inflation: 0, accountGainUsd: 1000 }],
      { ...options, currency: 'UAH', initialCapital: 400000 },
    );
    expect(usd.rows[0].unrealized).toBe(1000);
    expect(uah.rows[0].unrealized).toBe(42000);
    // 10 000 $ bought at 40 and valued at 42.
    expect(uah.rows[0].fx).toBeCloseTo(20000);
    expect(uah.finalCapital).toBeCloseTo(11000 * 42);
  });
});
