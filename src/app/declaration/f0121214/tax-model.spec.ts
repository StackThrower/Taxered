import { calculateTaxes, militaryTaxRateLabel, positionFxDifference } from './tax-model';

const trade = (purchasePrice: string, salePrice: string, expenses = '') => ({
  assetType: 'stocks',
  purchasePrice,
  salePrice,
  expenses,
});

describe('calculateTaxes', () => {
  it('taxes trade profit at 18% PDFO + 5% military levy from 2025', () => {
    const result = calculateTaxes([trade('10000', '15000', '500')], '2025');

    expect(result.profitFromTrades).toBe(4500);
    expect(result.pdfo).toBeCloseTo(810);
    expect(result.militaryTax).toBeCloseTo(225);
    expect(result.total).toBeCloseTo(1035);
  });

  it('uses the 1.5% military levy for 2024 and earlier', () => {
    const result = calculateTaxes([trade('0', '10000')], '2024');

    expect(result.militaryTax).toBeCloseTo(150);
    expect(militaryTaxRateLabel('2024')).toBe('1.5');
    expect(militaryTaxRateLabel('2025')).toBe('5');
  });

  it('offsets losses against gains and does not tax a net loss', () => {
    const result = calculateTaxes([trade('10000', '15000'), trade('20000', '10000')], '2026');

    expect(result.profitFromTrades).toBe(-5000);
    expect(result.pdfo).toBe(0);
    expect(result.total).toBe(0);
  });

  it('taxes dividends at the reduced 9% rate', () => {
    const result = calculateTaxes(
      [{ assetType: 'dividends', purchasePrice: '0', salePrice: '1000', expenses: '' }],
      '2026',
    );

    expect(result.dividends).toBe(1000);
    expect(result.pdfoFromDividends).toBeCloseTo(90);
    expect(result.militaryTaxFromDividends).toBeCloseTo(50);
    expect(result.profit).toBe(1000);
  });

  it('treats empty and invalid amounts as zero', () => {
    expect(calculateTaxes([trade('', 'abc')], '2026').total).toBe(0);
  });

  it('reports the exchange-rate part of trade profit and the tax it adds', () => {
    // Bought for $1000 at 37, sold for $1000 at 41: no gain in dollars, 4000 UAH taxable.
    const usdTrade = {
      ...trade('37000', '41000'),
      currency: 'USD',
      purchasePriceForeign: '1000',
      purchaseRate: '37',
      saleRate: '41',
    };
    const result = calculateTaxes([usdTrade], '2025');

    expect(result.fxDifference).toBe(4000);
    expect(result.taxOnFx).toBeCloseTo(4000 * 0.23);
    expect(result.taxOnFx).toBeCloseTo(result.total);
  });

  it('caps the tax on the exchange-rate difference by the taxable profit', () => {
    // 3000 UAH of rate gain against a 2000 UAH net profit: only 2000 is taxed.
    const result = calculateTaxes(
      [
        {
          ...trade('30000', '33000'),
          currency: 'USD',
          purchasePriceForeign: '1000',
          purchaseRate: '30',
          saleRate: '33',
        },
        trade('1000', '0'),
      ],
      '2026',
    );

    expect(result.fxDifference).toBe(3000);
    expect(result.taxOnFx).toBeCloseTo(2000 * 0.23);
  });

  it('reduces the trade result by the loss of previous years', () => {
    const result = calculateTaxes([trade('10000', '15000')], '2025', { previousYearsLoss: '3000' });

    expect(result.profitFromTrades).toBe(2000);
    expect(result.pdfo).toBe(360);
    expect(result.militaryTax).toBe(100);
  });

  it('does not tax sales within the pp. "а" 170.2.8 threshold', () => {
    const result = calculateTaxes([trade('1000', '4240')], '2025');

    expect(result.f1.belowThreshold).toBe(true);
    expect(result.total).toBe(0);
  });

  it('leaves virtual assets out of the trade result', () => {
    const result = calculateTaxes(
      [trade('10000', '15000'), { ...trade('0', '50000'), assetType: 'crypto' }],
      '2025',
    );

    expect(result.profitFromTrades).toBe(5000);
    expect(result.f1.warnings.join()).toContain('Віртуальні активи (1)');
  });

  it('has no exchange-rate difference for UAH trades, dividends or missing rates', () => {
    const base = { ...trade('100', '200'), purchasePriceForeign: '10', purchaseRate: '40' };

    expect(positionFxDifference({ ...base, currency: 'UAH', saleRate: '41' })).toBe(0);
    expect(
      positionFxDifference({ ...base, assetType: 'dividends', currency: 'USD', saleRate: '41' }),
    ).toBe(0);
    expect(positionFxDifference({ ...base, currency: 'USD', saleRate: '' })).toBe(0);
    expect(positionFxDifference({ ...base, currency: 'EUR', saleRate: '39' })).toBe(-10);
  });
});
