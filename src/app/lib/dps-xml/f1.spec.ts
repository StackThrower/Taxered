import { computeF1, renderF1Rows, type F1Position } from './f1';

const lot = (salePrice: string, purchasePrice: string, overrides: Partial<F1Position> = {}) => ({
  assetType: 'stocks',
  currency: 'USD',
  salePrice,
  purchasePrice,
  expenses: '',
  ...overrides,
});

describe('computeF1', () => {
  it('computes the reference example of the spec', () => {
    // AAPL and MSFT lots of the spec, already in UAH; loss of previous years 3 000.00.
    const f1 = computeF1(
      [
        lot('83000.00', '63000.00', { expenses: '83.50' }),
        lot('79610.00', '86520.00', { expenses: '83.10' }),
      ],
      2025,
      { previousYearsLoss: 300000 },
    );

    expect(f1.rows.map((r) => [r.income, r.costs, r.result])).toEqual([
      [8300000, 6308350, 1991650],
      [7961000, 8660310, -699310],
    ]);
    expect([f1.totalIncome, f1.totalCosts, f1.totalResult]).toEqual([16261000, 14968660, 1292340]);
    expect(f1.previousYearsLoss).toBe(300000);
    expect(f1.financialResult).toBe(992340);
    expect(f1.profit).toBe(992340);
    expect([f1.pdfo, f1.pdfoPayable]).toEqual([178621, 178621]);
    expect([f1.militaryLevy, f1.militaryLevyPayable]).toEqual([49617, 49617]);

    const xml = renderF1Rows(f1).join('');
    expect(xml).toContain(
      '<R002G6>3000.00</R002G6><R003G6>9923.40</R003G6><R031G6>9923.40</R031G6>',
    );
    expect(xml).toContain('<R004G6>1786.21</R004G6><R042G6>1786.21</R042G6>');
    expect(xml).toContain('<R005G6>496.17</R005G6><R052G6>496.17</R052G6>');
  });

  it('fills row 3.2 and no tax rows for a net loss', () => {
    const f1 = computeF1([lot('10000', '16000')], 2025);
    const xml = renderF1Rows(f1).join('');

    expect(f1.financialResult).toBe(-600000);
    expect(xml).toContain('<R032G6>6000.00</R032G6>');
    expect(xml).not.toMatch(/R00[45]G6|R04|R05/);
  });

  it('carries the rest of a larger loss of previous years to row 3.2', () => {
    const f1 = computeF1([lot('15000', '10000')], 2025, { previousYearsLoss: 800000 });

    expect(f1.financialResult).toBe(-300000);
    expect(f1.loss).toBe(300000);
    expect(f1.profit).toBe(0);
    expect(f1.pdfo).toBe(0);
    expect(renderF1Rows(f1).join('')).not.toContain('R004G6');
  });

  it('skips the calculation when 2025 sale income does not exceed 4 240 UAH', () => {
    const at = computeF1([lot('4240.00', '1000')], 2025);
    const above = computeF1([lot('4240.01', '1000')], 2025);

    expect(at.belowThreshold).toBe(true);
    expect(at.pdfo).toBe(0);
    expect(at.warnings.join()).toContain('170.2.8');
    expect(above.belowThreshold).toBe(false);
    expect(above.pdfo).toBe(applyPdfo(324001));
  });

  it('chooses column 2 by broker jurisdiction and keeps manual codes', () => {
    const f1 = computeF1(
      [
        lot('10000', '1', { currency: 'UAH', brokerJurisdiction: 'ua', source: 'freedom_finance' }),
        lot('10000', '1', { source: 'interactive_brokers' }),
        lot('10000', '1', { source: 'freedom_finance', brokerJurisdiction: 'foreign' }),
        lot('10000', '1', { currency: 'UAH' }),
        lot('10000', '1', { source: 'interactive_brokers', assetCode: '3' }),
        lot('10000', '1', { assetCode: '1', brokerJurisdiction: 'ua' }),
      ],
      2025,
    );

    expect(f1.rows.map((r) => r.code)).toEqual([2, 4, 4, 2, 3, 1]);
  });

  it('subtracts tax withheld by a Ukrainian broker in rows 4.1 / 5.1, never below zero', () => {
    const f1 = computeF1([lot('20000', '10000', { brokerJurisdiction: 'ua' })], 2025, {
      withheldPdfo: 100000,
      withheldMilitaryLevy: 100000,
    });
    const xml = renderF1Rows(f1).join('');

    expect(f1.pdfo).toBe(180000);
    expect(f1.pdfoPayable).toBe(80000);
    expect(f1.militaryLevy).toBe(50000);
    expect(f1.militaryLevyPayable).toBe(0);
    expect(xml).toContain('<R041G6>1000.00</R041G6><R042G6>800.00</R042G6>');
    expect(xml).toContain('<R051G6>1000.00</R051G6><R052G6>0.00</R052G6>');
  });

  it('leaves out virtual assets and government bonds with a warning', () => {
    const f1 = computeF1(
      [
        lot('10000', '5000'),
        lot('9000', '1000', { assetType: 'crypto' }),
        lot('9000', '1000', { assetType: 'bonds', isin: 'UA4000227045' }),
        lot('9000', '1000', { assetType: 'bonds', assetDescription: 'ОВДП 2026' }),
        lot('9000', '1000', { assetType: 'bonds', isin: 'US912828XX00' }),
      ],
      2025,
    );

    expect(f1.rows).toHaveLength(2);
    expect(f1.warnings.join(' ')).toContain('Віртуальні активи (1)');
    expect(f1.warnings.join(' ')).toContain('ОВДП та облігації НБУ (2)');
  });

  it('describes the lot with ISIN, dates, currency amounts, rates and broker', () => {
    const [row] = computeF1(
      [
        lot('83000', '63000', {
          symbol: 'AAPL',
          isin: 'US0378331005',
          quantity: '10',
          purchaseDate: '2025-01-10',
          saleDate: '2025-06-20',
          purchasePriceForeign: '1500.00',
          purchaseRate: '42.0000',
          salePriceForeign: '2000.00',
          saleRate: '41.5000',
          broker: 'Interactive Brokers',
        }),
      ],
      2025,
    ).rows;

    expect(row.description).toBe(
      'Акції: AAPL, ISIN US0378331005, 10 шт., купівля 10.01.2025 1500.00 USD за курсом 42.0000, продаж 20.06.2025 2000.00 USD за курсом 41.5000, Interactive Brokers',
    );
  });
});

function applyPdfo(kopecks: number): number {
  return Math.floor((kopecks * 1800 + 5000) / 10000);
}
