import { supportsLivePrices, watchLivePrices } from './binance-ticker';
import type { MarketPrice } from './crypto-prices';

class FakeSocket {
  static instances: FakeSocket[] = [];
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }

  send(symbol: string, last: string, open: string): void {
    this.onmessage?.({
      data: JSON.stringify({ stream: '', data: { s: symbol, c: last, o: open } }),
    });
  }

  close(): void {
    this.closed = true;
  }
}

describe('watchLivePrices', () => {
  beforeEach(() => {
    FakeSocket.instances = [];
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('subscribes to the USDT pair of each ticker and batches updates once a second', () => {
    const updates: ReadonlyMap<string, MarketPrice>[] = [];
    const stop = watchLivePrices(['BTC', 'stETH', 'USDT', 'BTC'], (p) => updates.push(p));

    const [socket] = FakeSocket.instances;
    expect(socket.url).toBe(
      'wss://stream.binance.com:443/stream?streams=btcusdt@miniTicker/stethusdt@miniTicker',
    );

    socket.send('BTCUSDT', '74000', '75000');
    socket.send('BTCUSDT', '76000', '75000');
    socket.onmessage?.({ data: 'not json' });
    expect(updates).toEqual([]);

    vi.advanceTimersByTime(1000);
    expect(updates).toHaveLength(1);
    const btc = updates[0].get('BTC');
    expect(btc?.price).toBe(76000);
    expect(btc?.change24h).toBeCloseTo((76000 / 75000 - 1) * 100, 9);

    stop();
    expect(socket.closed).toBe(true);
  });

  it('reconnects when the connection drops, but not after it is stopped', () => {
    const stop = watchLivePrices(['ETH'], () => undefined);
    FakeSocket.instances[0].onclose?.();
    vi.advanceTimersByTime(5000);
    expect(FakeSocket.instances).toHaveLength(2);

    stop();
    FakeSocket.instances[1].onclose?.();
    vi.advanceTimersByTime(5000);
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it('streams only for dollar countervalues', () => {
    expect(supportsLivePrices('USD')).toBe(true);
    expect(supportsLivePrices('EUR')).toBe(false);
  });
});
