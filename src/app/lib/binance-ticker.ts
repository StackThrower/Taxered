/**
 * Live prices from Binance's public market-data WebSocket: the 24-hour mini ticker of each
 * `<TICKER>USDT` pair, pushed about once a second. No key, no polling, so no rate limits.
 * Pairs Binance does not list are silently ignored, so every held ticker can be asked for.
 * USDT stands in for the US dollar.
 */

import type { MarketPrice } from './crypto-prices';

const STREAM = 'wss://stream.binance.com:443/stream?streams=';
const QUOTE = 'USDT';
/** Countervalue currencies the USDT pairs can stand in for. */
const SUPPORTED_FIATS = ['USD'];
/** Updates are collected and handed over at most this often. */
const FLUSH_MS = 1000;
/** Delay before reconnecting after the connection drops. */
const RECONNECT_MS = 5000;

interface MiniTicker {
  /** Symbol, e.g. `BTCUSDT`. */
  s: string;
  /** Last price. */
  c: string;
  /** Price 24 hours ago. */
  o: string;
}

export function supportsLivePrices(fiat: string): boolean {
  return SUPPORTED_FIATS.includes(fiat.toUpperCase());
}

/**
 * Streams prices of `tickers` to `onPrices`, keyed by the upper-case ticker. Reconnects when
 * the connection drops. Returns a function that stops the stream.
 */
export function watchLivePrices(
  tickers: readonly string[],
  onPrices: (prices: ReadonlyMap<string, MarketPrice>) => void,
): () => void {
  const symbols = [...new Set(tickers.map((t) => t.toUpperCase()))].filter((t) => t !== QUOTE);
  if (symbols.length === 0 || typeof WebSocket === 'undefined') {
    return () => undefined;
  }
  const url =
    STREAM + symbols.map((t) => `${t.toLowerCase()}${QUOTE.toLowerCase()}@miniTicker`).join('/');

  let socket: WebSocket | null = null;
  let stopped = false;
  let reconnect: ReturnType<typeof setTimeout> | undefined;
  let flush: ReturnType<typeof setTimeout> | undefined;
  const pending = new Map<string, MarketPrice>();

  const connect = () => {
    socket = new WebSocket(url);
    socket.onmessage = (event: MessageEvent<string>) => {
      const ticker = parseMessage(event.data);
      if (!ticker) {
        return;
      }
      const price = parseFloat(ticker.c);
      const open = parseFloat(ticker.o);
      if (!(price > 0)) {
        return;
      }
      pending.set(ticker.s.slice(0, -QUOTE.length), {
        price,
        change24h: open > 0 ? (price / open - 1) * 100 : null,
      });
      flush ??= setTimeout(() => {
        flush = undefined;
        onPrices(new Map(pending));
        pending.clear();
      }, FLUSH_MS);
    };
    socket.onclose = () => {
      if (!stopped) {
        reconnect = setTimeout(connect, RECONNECT_MS);
      }
    };
  };
  connect();

  return () => {
    stopped = true;
    clearTimeout(reconnect);
    clearTimeout(flush);
    socket?.close();
  };
}

function parseMessage(data: string): MiniTicker | null {
  try {
    const message = JSON.parse(data) as { data?: Partial<MiniTicker> };
    const ticker = message.data;
    return ticker?.s?.endsWith(QUOTE) && ticker.c && ticker.o ? (ticker as MiniTicker) : null;
  } catch {
    return null;
  }
}
