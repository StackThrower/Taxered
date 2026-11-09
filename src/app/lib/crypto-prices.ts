/**
 * Current crypto prices from the public CoinGecko API (no key, CORS enabled). Assets are
 * looked up by ticker; for a ticker shared by several coins CoinGecko answers with the one of
 * the largest market cap.
 */

const API = 'https://api.coingecko.com/api/v3/simple/price';
/** Keeps the URL short; CoinGecko accepts long symbol lists, but proxies may not. */
const BATCH = 50;

export interface MarketPrice {
  price: number;
  /** Change over the last 24 hours, in percent; `null` if CoinGecko does not report it. */
  change24h: number | null;
}

/**
 * Prices of `tickers` in `currency` (e.g. `USD`), keyed by the upper-case ticker. Tickers
 * CoinGecko does not know are missing from the result.
 */
export async function fetchMarketPrices(
  tickers: readonly string[],
  currency: string,
): Promise<Map<string, MarketPrice>> {
  const vs = currency.toLowerCase();
  const symbols = [...new Set(tickers.map((t) => t.toLowerCase()))];
  const prices = new Map<string, MarketPrice>();

  for (let i = 0; i < symbols.length; i += BATCH) {
    const params = new URLSearchParams({
      symbols: symbols.slice(i, i + BATCH).join(','),
      vs_currencies: vs,
      include_24hr_change: 'true',
    });
    const response = await fetch(`${API}?${params}`);
    if (!response.ok) {
      throw new Error(`CoinGecko: HTTP ${response.status}`);
    }
    const body = (await response.json()) as Record<string, Record<string, number | undefined>>;
    for (const [symbol, quote] of Object.entries(body)) {
      const price = quote[vs];
      if (typeof price === 'number' && price > 0) {
        const change = quote[`${vs}_24h_change`];
        prices.set(symbol.toUpperCase(), {
          price,
          change24h: typeof change === 'number' ? change : null,
        });
      }
    }
  }
  return prices;
}
