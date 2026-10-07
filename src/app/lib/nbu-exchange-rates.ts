/**
 * NBU (National Bank of Ukraine) Exchange Rates API
 * Documentation: https://bank.gov.ua/ua/open-data/api-dev
 */

export interface NBUExchangeRate {
  r030: number; // Numeric currency code
  txt: string; // Currency name
  rate: number; // Exchange rate
  cc: string; // Currency code (ISO 4217)
  exchangedate: string; // Date
}

export const SUPPORTED_CURRENCIES = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'PLN', name: 'Polish Zloty', symbol: 'zł' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
  { code: 'UAH', name: 'Ukrainian Hryvnia', symbol: '₴' },
];

/**
 * Fetch exchange rate from NBU for a specific date and currency
 * @param date - Date in YYYY-MM-DD format
 * @param currencyCode - ISO 4217 currency code (e.g., USD, EUR)
 * @returns Exchange rate or null if not found
 */
export function fetchNBUExchangeRate(date: string, currencyCode: string): Promise<number | null> {
  if (!date || !currencyCode || currencyCode === 'UAH') {
    return Promise.resolve(1); // UAH to UAH rate is 1
  }

  // Imports request the same date+currency many times; failed lookups are not cached.
  const key = `${currencyCode}:${date}`;
  let rate = rateCache.get(key);
  if (!rate) {
    rate = requestNBUExchangeRate(date, currencyCode);
    rateCache.set(key, rate);
    rate.then((value) => value === null && rateCache.delete(key));
  }
  return rate;
}

/** NBU UAH per USD at the end of `year`, or today's rate for a year that has not ended. */
export function fetchYearEndUSDRate(year: number): Promise<number | null> {
  const today = new Date().toISOString().slice(0, 10);
  const yearEnd = `${year}-12-31`;
  return fetchNBUExchangeRate(yearEnd < today ? yearEnd : today, 'USD');
}

const rateCache = new Map<string, Promise<number | null>>();

async function requestNBUExchangeRate(date: string, currencyCode: string): Promise<number | null> {
  try {
    // Format date as YYYYMMDD for NBU API
    const formattedDate = date.replace(/-/g, '');

    // NBU API endpoint
    const url = `https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=${currencyCode}&date=${formattedDate}&json`;

    const response = await fetch(url);

    if (!response.ok) {
      console.error(`NBU API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data: NBUExchangeRate[] = await response.json();

    if (data && data.length > 0) {
      return data[0].rate;
    }

    return null;
  } catch (error) {
    console.error('Error fetching NBU exchange rate:', error);
    return null;
  }
}

/**
 * Convert amount from foreign currency to UAH
 * @param amount - Amount in foreign currency
 * @param exchangeRate - NBU exchange rate
 * @returns Amount in UAH
 */
export function convertToUAH(amount: number, exchangeRate: number): number {
  return amount * exchangeRate;
}

/**
 * Format exchange rate display
 * @param rate - Exchange rate
 * @param currencyCode - Currency code
 * @returns Formatted string
 */
export function formatExchangeRate(rate: number | null, currencyCode: string): string {
  if (rate === null) {
    return '—';
  }
  if (currencyCode === 'UAH') {
    return '1.00';
  }
  return rate.toFixed(4);
}

/**
 * Get currency symbol by code
 * @param code - Currency code
 * @returns Currency symbol
 */
export function getCurrencySymbol(code: string): string {
  const currency = SUPPORTED_CURRENCIES.find((c) => c.code === code);
  return currency?.symbol || code;
}

/**
 * Get currency name by code
 * @param code - Currency code
 * @param language - Language code (uk, en, etc.)
 * @returns Currency name
 */
export function getCurrencyName(code: string, language: string = 'uk'): string {
  const names: Record<string, Record<string, string>> = {
    USD: { uk: 'Долар США', en: 'US Dollar' },
    EUR: { uk: 'Євро', en: 'Euro' },
    GBP: { uk: 'Фунт стерлінгів', en: 'British Pound' },
    PLN: { uk: 'Польський злотий', en: 'Polish Zloty' },
    CHF: { uk: 'Швейцарський франк', en: 'Swiss Franc' },
    CAD: { uk: 'Канадський долар', en: 'Canadian Dollar' },
    JPY: { uk: 'Японська єна', en: 'Japanese Yen' },
    CNY: { uk: 'Китайський юань', en: 'Chinese Yuan' },
    UAH: { uk: 'Українська гривня', en: 'Ukrainian Hryvnia' },
  };

  return names[code]?.[language] || code;
}
