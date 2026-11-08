import {
  BASELINE_CODE,
  COUNTRIES,
  METRICS,
  REGIONS,
  countriesIn,
  flagOf,
  formatRate,
  getCountry,
  rateBin,
} from './tax-data';

describe('tax map data', () => {
  it('has unique country codes', () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('places every country on its own tile within a region', () => {
    for (const region of REGIONS) {
      const cells = countriesIn(region).map((c) => `${c.col}:${c.row}`);
      expect(new Set(cells).size, region).toBe(cells.length);
    }
  });

  it('keeps rates and grid positions in range', () => {
    for (const c of COUNTRIES) {
      expect(c.col).toBeGreaterThanOrEqual(1);
      expect(c.row).toBeGreaterThanOrEqual(1);
      expect(c.notes.length, c.code).toBeGreaterThan(0);
      for (const metric of METRICS) {
        expect(c.rates[metric], `${c.code} ${metric}`).toBeGreaterThanOrEqual(0);
        expect(c.rates[metric], `${c.code} ${metric}`).toBeLessThanOrEqual(60);
      }
    }
  });

  it('includes Ukraine as the baseline at 18% + 5%', () => {
    expect(getCountry(BASELINE_CODE)?.rates).toEqual({
      dividends: 23,
      capitalGains: 23,
      interest: 23,
    });
  });

  it('bins rates by their upper bound', () => {
    expect(rateBin(0).label).toBe('0%');
    expect(rateBin(5).label).toBe('до 10%');
    expect(rateBin(10).label).toBe('до 10%');
    expect(rateBin(23).label).toBe('20–30%');
    expect(rateBin(52).label).toBe('понад 30%');
  });

  it('formats rates and flags', () => {
    expect(formatRate(26.38)).toBe('26,38%');
    expect(flagOf('UA')).toBe('🇺🇦');
  });
});
