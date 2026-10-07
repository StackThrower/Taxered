/**
 * Annual consumer price inflation, December to December, in percent.
 *  - UAH: State Statistics Service of Ukraine (Держстат).
 *  - USD: US Bureau of Labor Statistics, CPI-U, not seasonally adjusted.
 * The current year is not finished yet, so it holds the latest 12-month figure
 * (August 2026) and is flagged as preliminary.
 */
const INFLATION: Record<'UAH' | 'USD', Record<number, number>> = {
  UAH: {
    2010: 9.1,
    2011: 4.6,
    2012: -0.2,
    2013: 0.5,
    2014: 24.9,
    2015: 43.3,
    2016: 12.4,
    2017: 13.7,
    2018: 9.8,
    2019: 4.1,
    2020: 5.0,
    2021: 10.0,
    2022: 26.6,
    2023: 5.1,
    2024: 12.0,
    2025: 8.0,
    2026: 8.1,
  },
  USD: {
    2010: 1.5,
    2011: 3.0,
    2012: 1.7,
    2013: 1.5,
    2014: 0.8,
    2015: 0.7,
    2016: 2.1,
    2017: 2.1,
    2018: 1.9,
    2019: 2.3,
    2020: 1.4,
    2021: 7.0,
    2022: 6.5,
    2023: 3.4,
    2024: 2.9,
    2025: 2.7,
    2026: 3.4,
  },
};

export const FIRST_INFLATION_YEAR = 2010;
export const PRELIMINARY_INFLATION_YEAR = 2026;

/** Inflation for a year in percent; years outside the table fall back to the latest known value. */
export function inflationFor(currency: 'UAH' | 'USD', year: number): number {
  const table = INFLATION[currency];
  const latest = Math.max(...Object.keys(table).map(Number));
  return table[Math.min(Math.max(year, FIRST_INFLATION_YEAR), latest)];
}
