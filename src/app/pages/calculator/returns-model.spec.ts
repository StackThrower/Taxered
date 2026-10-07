import { AnalysisOptions, FileIncome, YearInput, analyzeReturns } from './returns-model';

const report = (tradesUsd: number, dividendsUsd = 0, rate = 40, fxUah = 0): FileIncome => ({
  name: 'report.xml',
  source: 'interactive_brokers',
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
