/**
 * Money arithmetic for tax returns: amounts are integer kopecks, rates are basis points
 * (1800 = 18%). Decimal strings are parsed exactly, so no float multiplication touches an amount.
 */

/** Amount in kopecks (1 UAH = 100). */
export type Kopecks = number;

interface Decimal {
  /** Unscaled value: 12.345 -> 12345n with scale 3. */
  digits: bigint;
  scale: number;
}

const DECIMAL = /^([+-])?(\d*)(?:\.(\d*))?$/;

function parseDecimal(value: string | number | null | undefined): Decimal | null {
  if (value === null || value === undefined) {
    return null;
  }
  const text = (
    typeof value === 'number' ? (Number.isFinite(value) ? value.toFixed(8) : '') : value
  )
    .trim()
    .replace(/\s+/g, '')
    .replace(',', '.');
  const match = DECIMAL.exec(text);
  if (!match || (!match[2] && !match[3])) {
    return null;
  }
  const fraction = match[3] ?? '';
  const digits = BigInt((match[2] || '0') + fraction);
  return { digits: match[1] === '-' ? -digits : digits, scale: fraction.length };
}

/** Round a scaled value to kopecks, half away from zero. */
function roundToKopecks(digits: bigint, scale: number): Kopecks {
  if (scale <= 2) {
    return Number(digits * 10n ** BigInt(2 - scale));
  }
  const divisor = 10n ** BigInt(scale - 2);
  const negative = digits < 0n;
  const magnitude = negative ? -digits : digits;
  const rounded = (magnitude + divisor / 2n) / divisor;
  return Number(negative ? -rounded : rounded);
}

/** "1234.567" -> 123457; empty or invalid input -> 0. */
export function toKopecks(value: string | number | null | undefined): Kopecks {
  const decimal = parseDecimal(value);
  return decimal ? roundToKopecks(decimal.digits, decimal.scale) : 0;
}

/** Whether the value is a number at all (an empty field is not). */
export function isAmount(value: string | number | null | undefined): boolean {
  return parseDecimal(value) !== null;
}

/** Foreign amount × exchange rate, rounded half-up to kopecks: ("1.005", "41.5") -> 4171. */
export function convertToKopecks(
  amount: string | number | null | undefined,
  rate: string | number | null | undefined,
): Kopecks {
  const a = parseDecimal(amount);
  const r = parseDecimal(rate);
  if (!a || !r) {
    return 0;
  }
  return roundToKopecks(a.digits * r.digits, a.scale + r.scale);
}

/** Tax on an amount: round_half_up(kopecks × bp / 10000). */
export function applyRate(kopecks: Kopecks, basisPoints: number): Kopecks {
  // kopecks × bp is hryvnias at scale 2 + 4.
  return roundToKopecks(BigInt(kopecks) * BigInt(basisPoints), 6);
}

/** DGdecimal2: optional minus, digits, dot, exactly two decimals. */
export function formatAmount(kopecks: Kopecks): string {
  const abs = Math.abs(kopecks);
  const sign = kopecks < 0 ? '-' : '';
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Kopecks back to hryvnias for display and the legacy float API. */
export function toHryvnias(kopecks: Kopecks): number {
  return kopecks / 100;
}

export function sumKopecks(values: readonly Kopecks[]): Kopecks {
  return values.reduce((a, b) => a + b, 0);
}
