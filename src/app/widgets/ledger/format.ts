const LOCALE = 'uk-UA';

export interface LedgerFormatters {
  money: (value: number) => string;
  /** Short money for chart axes, e.g. `1,2 тис. $`. */
  compactMoney: (value: number) => string;
  amount: (value: number) => string;
  percent: (value: number) => string;
  /** Percent with a sign, for changes. */
  signedPercent: (value: number) => string;
  dateTime: (time: number) => string;
  date: (time: number) => string;
  shortDate: (time: number) => string;
  time: (time: number) => string;
}

/** Number and date formats for amounts in `fiat` (Ledger's countervalue currency). */
export function ledgerFormatters(fiat: string): LedgerFormatters {
  const money = currencyFormat(fiat, {});
  const compact = currencyFormat(fiat, { notation: 'compact', maximumFractionDigits: 1 });
  const amount = new Intl.NumberFormat(LOCALE, { maximumSignificantDigits: 6 });
  const percent = new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const signed = new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: 'exceptZero',
  });
  const dateTime = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'short', timeStyle: 'short' });
  const date = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium' });
  const shortDate = new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: '2-digit' });
  const time = new Intl.DateTimeFormat(LOCALE, { timeStyle: 'short' });
  return {
    money: (value) => money.format(value),
    compactMoney: (value) => compact.format(value),
    amount: (value) => amount.format(value),
    percent: (value) => `${percent.format(value)}%`,
    signedPercent: (value) => `${signed.format(value)}%`,
    dateTime: (value) => dateTime.format(value),
    date: (value) => date.format(value),
    shortDate: (value) => shortDate.format(value),
    time: (value) => time.format(value),
  };
}

function currencyFormat(code: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  try {
    return new Intl.NumberFormat(LOCALE, { ...options, style: 'currency', currency: code });
  } catch {
    // Not an ISO 4217 code (Ledger also offers BTC or ETH as the countervalue).
    return new Intl.NumberFormat(LOCALE, { ...options, maximumSignificantDigits: 6 });
  }
}
