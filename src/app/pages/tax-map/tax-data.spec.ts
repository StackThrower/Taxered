import {
  COUNTRIES,
  METRICS,
  REGIONS,
  countriesIn,
  flagOf,
  formatRate,
  getCountry,
  rateBin,
} from './tax-data';
import { COUNTRY_SHAPES } from './world-shapes';

describe('tax map data', () => {
  it('has unique country codes', () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('has a map shape for every country', () => {
    const shapes = new Set(COUNTRY_SHAPES.map((s) => s.code));
    for (const c of COUNTRIES) {
      expect(shapes.has(c.code), c.code).toBe(true);
    }
    expect(REGIONS.flatMap((r) => countriesIn(r)).length).toBe(COUNTRIES.length);
  });

  it('keeps rates in range', () => {
    for (const c of COUNTRIES) {
      expect(c.notes.length, c.code).toBeGreaterThan(0);
      for (const metric of METRICS) {
        expect(c.rates[metric], `${c.code} ${metric}`).toBeGreaterThanOrEqual(0);
        expect(c.rates[metric], `${c.code} ${metric}`).toBeLessThanOrEqual(60);
      }
    }
  });

  it('taxes Ukrainian investment income at 18% + 5%', () => {
    expect(getCountry('UA')?.rates).toEqual({
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
