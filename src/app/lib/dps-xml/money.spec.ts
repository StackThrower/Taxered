import { applyRate, convertToKopecks, formatAmount, isAmount, toKopecks } from './money';

describe('money', () => {
  it('parses decimal strings exactly, rounding half up at kopecks', () => {
    expect(toKopecks('1234.56')).toBe(123456);
    expect(toKopecks('0.005')).toBe(1);
    expect(toKopecks('0.0049')).toBe(0);
    expect(toKopecks('-10.125')).toBe(-1013);
    expect(toKopecks('1 000,5')).toBe(100050);
    expect(toKopecks(41.5)).toBe(4150);
    expect(toKopecks('')).toBe(0);
    expect(toKopecks('abc')).toBe(0);
    expect(toKopecks(undefined)).toBe(0);
  });

  it('tells empty fields from zero', () => {
    expect(isAmount('0')).toBe(true);
    expect(isAmount('')).toBe(false);
    expect(isAmount('.')).toBe(false);
  });

  it('converts foreign amounts without float error', () => {
    expect(convertToKopecks('2000', '41.50')).toBe(8300000);
    expect(convertToKopecks('0.1', '0.3')).toBe(3);
    expect(convertToKopecks('1.005', '1')).toBe(101);
    expect(convertToKopecks('1', '41.2345')).toBe(4123);
  });

  it('applies rates in basis points with half-up rounding', () => {
    expect(applyRate(992340, 1800)).toBe(178621);
    expect(applyRate(992340, 500)).toBe(49617);
    expect(applyRate(418000, 900)).toBe(37620);
    expect(applyRate(5, 1000)).toBe(1); // 0.5 kopeck -> 1
    expect(applyRate(4, 1000)).toBe(0);
    // Above Number.MAX_SAFE_INTEGER / 1800 the product still stays exact.
    expect(applyRate(10_000_000_000_000, 1800)).toBe(1_800_000_000_000);
  });

  it('formats amounts as DGdecimal2', () => {
    expect(formatAmount(0)).toBe('0.00');
    expect(formatAmount(5)).toBe('0.05');
    expect(formatAmount(-699310)).toBe('-6993.10');
  });
});
