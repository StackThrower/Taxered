import { calculateTaxes, militaryTaxRateLabel } from './tax-model';

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
    const result = calculateTaxes([trade('0', '1000')], '2024');

    expect(result.militaryTax).toBeCloseTo(15);
    expect(militaryTaxRateLabel('2024')).toBe('1.5');
    expect(militaryTaxRateLabel('2025')).toBe('5');
  });

  it('offsets losses against gains and does not tax a net loss', () => {
    const result = calculateTaxes([trade('1000', '1500'), trade('2000', '1000')], '2026');

    expect(result.profitFromTrades).toBe(-500);
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
});
