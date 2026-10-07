/**
 * Interactive Brokers Activity Statement (CSV) parser, for statements in English or Russian.
 *
 * Unlike a Flex report, the statement lists trades without the lots they close, so the
 * purchase dates are found by matching closing trades with earlier opening trades (FIFO)
 * across all statements given. The cost of each closing trade is still the one IB reports.
 */

/** Realized income of one closed position (or part of it) or one dividend, in its currency. */
export interface RealizedAmount {
  kind: 'trade' | 'dividend';
  currency: string;
  /** When the cost was paid; `''` if unknown (then valued on the sale date). */
  purchaseDate: string;
  saleDate: string;
  purchase: number;
  sale: number;
  /** Costs of the sale, valued on the sale date. */
  expenses: number;
}

export interface IbCsvTrade {
  /** Identifies the trade across overlapping statements. */
  key: string;
  /** Account and symbol: trades with the same position share it. */
  position: string;
  /** `YYYY-MM-DD, HH:MM:SS`; sorts chronologically. */
  dateTime: string;
  /** Signed: negative for a sale. */
  quantity: number;
  proceeds: number;
  /** Negative, as in the statement. */
  commission: number;
  /** For a closing trade, minus the cost of the lots it closes. */
  basis: number;
  currency: string;
  codes: readonly string[];
  /** Open dates and bases of the closed lots, when the statement lists them. */
  closedLots: { date: string; quantity: number; basis: number }[];
}

export interface IbCsvDividend {
  date: string;
  currency: string;
  amount: number;
}

export interface IbCsvStatement {
  account: string;
  period: string;
  /** First and last day of the period, `YYYY-MM-DD`; `''` if the period is unreadable. */
  start: string;
  end: string;
  /** Account value at the start and end of the period, in the base currency. */
  startingValue: number;
  endingValue: number;
  /** Deposits minus withdrawals during the period, in the base currency. */
  deposits: number;
  trades: IbCsvTrade[];
  dividends: IbCsvDividend[];
  /** Positions held when the statement starts. */
  priorPositions: { position: string; quantity: number }[];
  /** Currency conversions; they are not investment income here. */
  forexTrades: number;
}

export interface IbCsvYearIncome {
  amounts: RealizedAmount[];
  trades: number;
  dividends: number;
  /** Closing trades with lots that no statement shows being opened. */
  unmatched: number;
}

const SECTIONS = {
  statement: ['Statement'],
  account: ['Account Information', 'Информация о счете'],
  navChange: ['Change in NAV', 'Изменение в NAV'],
  trades: ['Trades', 'Сделки'],
  dividends: ['Dividends', 'Дивиденды', 'Payment In Lieu Of Dividends'],
  markToMarket: [
    'Mark-to-Market Performance Summary',
    'Рыночная переоценка: отчет об эффективности',
  ],
};

const COLUMNS = {
  discriminator: ['DataDiscriminator'],
  assetClass: ['Asset Category', 'Класс актива'],
  currency: ['Currency', 'Валюта'],
  account: ['Account', 'Счет'],
  symbol: ['Symbol', 'Символ'],
  dateTime: ['Date/Time', 'Дата/Время'],
  date: ['Date', 'Дата'],
  quantity: ['Quantity', 'Количество'],
  proceeds: ['Proceeds', 'Выручка'],
  commission: ['Comm/Fee', 'Comm in USD', 'Комиссия/плата'],
  basis: ['Basis', 'Базис'],
  code: ['Code', 'Код'],
  amount: ['Amount', 'Сумма'],
  priorQuantity: ['Prior Quantity', 'Предыд. Количество'],
};

const STARTING_VALUE = ['Starting Value', 'Начальная стоимость'];
const ENDING_VALUE = ['Ending Value', 'Конечная стоимость'];
const DEPOSITS = ['Deposits & Withdrawals', 'Внесение и вывод средств'];
const FOREX = ['Forex', 'Форекс'];
/** Month names of the statement period by their first three letters, January first. */
const MONTHS = [
  ['jan', 'янв'],
  ['feb', 'фев'],
  ['mar', 'мар'],
  ['apr', 'апр'],
  ['may', 'май', 'мая'],
  ['jun', 'июн'],
  ['jul', 'июл'],
  ['aug', 'авг'],
  ['sep', 'сен'],
  ['oct', 'окт'],
  ['nov', 'ноя'],
  ['dec', 'дек'],
];
const TRADE_ROWS = ['Order', 'Trade', 'Execution'];
const EPSILON = 1e-9;

export function isIbCsvStatement(content: string): boolean {
  return /^﻿?"?Statement"?,"?Header"?,/.test(content);
}

export function parseIbCsvStatement(content: string): IbCsvStatement {
  const statement: IbCsvStatement = {
    account: '',
    period: '',
    start: '',
    end: '',
    startingValue: 0,
    endingValue: 0,
    deposits: 0,
    trades: [],
    dividends: [],
    priorPositions: [],
    forexTrades: 0,
  };
  const headers = new Map<string, string[]>();
  const occurrences = new Map<string, number>();
  let lastTrade: IbCsvTrade | undefined;

  for (const [section, kind, ...fields] of parseCsv(content.replace(/^﻿/, ''))) {
    if (kind === 'Header') {
      headers.set(section, fields);
      continue;
    }
    if (kind !== 'Data') {
      continue;
    }
    const header = headers.get(section) ?? [];
    const text = (names: string[]) => {
      const i = header.findIndex((h) => names.includes(h));
      return i === -1 ? '' : (fields[i] ?? '').trim();
    };
    const number = (names: string[]) => parseNumber(text(names));

    if (SECTIONS.statement.includes(section) && fields[0] === 'Period') {
      statement.period = fields[1] ?? '';
      const dates = parsePeriod(statement.period);
      statement.start = dates[0] ?? '';
      statement.end = dates.at(-1) ?? '';
    } else if (SECTIONS.navChange.includes(section)) {
      if (STARTING_VALUE.includes(fields[0])) {
        statement.startingValue = parseNumber(fields[1] ?? '');
      } else if (ENDING_VALUE.includes(fields[0])) {
        statement.endingValue = parseNumber(fields[1] ?? '');
      } else if (DEPOSITS.includes(fields[0])) {
        statement.deposits = parseNumber(fields[1] ?? '');
      }
    } else if (SECTIONS.account.includes(section) && COLUMNS.account.includes(fields[0])) {
      statement.account = fields[1] ?? '';
    } else if (SECTIONS.markToMarket.includes(section)) {
      const quantity = number(COLUMNS.priorQuantity);
      if (quantity !== 0 && !FOREX.includes(text(COLUMNS.assetClass))) {
        statement.priorPositions.push({
          position: positionKey(statement.account, text(COLUMNS.symbol)),
          quantity,
        });
      }
    } else if (SECTIONS.dividends.includes(section)) {
      const date = text(COLUMNS.date);
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        statement.dividends.push({
          date,
          currency: text(COLUMNS.currency),
          amount: number(COLUMNS.amount),
        });
      }
    } else if (SECTIONS.trades.includes(section)) {
      const discriminator = text(COLUMNS.discriminator);
      if (discriminator === 'ClosedLot') {
        lastTrade?.closedLots.push({
          date: text(COLUMNS.dateTime).slice(0, 10),
          quantity: Math.abs(number(COLUMNS.quantity)),
          basis: Math.abs(number(COLUMNS.basis)),
        });
        continue;
      }
      if (!TRADE_ROWS.includes(discriminator)) {
        continue;
      }
      if (FOREX.includes(text(COLUMNS.assetClass))) {
        statement.forexTrades++;
        continue;
      }
      const position = positionKey(statement.account, text(COLUMNS.symbol));
      const dateTime = text(COLUMNS.dateTime);
      const quantity = number(COLUMNS.quantity);
      const proceeds = number(COLUMNS.proceeds);
      // Identical fills in one statement stay distinct; the same fill in two statements does not.
      const id = `${position}|${dateTime}|${quantity}|${proceeds}`;
      const n = occurrences.get(id) ?? 0;
      occurrences.set(id, n + 1);

      lastTrade = {
        key: `${id}#${n}`,
        position,
        dateTime,
        quantity,
        proceeds,
        commission: number(COLUMNS.commission),
        basis: number(COLUMNS.basis),
        currency: text(COLUMNS.currency),
        codes: text(COLUMNS.code).split(';'),
        closedLots: [],
      };
      statement.trades.push(lastTrade);
    }
  }
  return statement;
}

/**
 * Realized income of `statement` in `year`: trades closed and dividends paid that year.
 * `history` holds every statement of the account (it may include `statement` itself);
 * their trades supply the purchase dates.
 */
export function ibCsvYearIncome(
  statement: IbCsvStatement,
  history: readonly IbCsvStatement[],
  year: number,
): IbCsvYearIncome {
  const closings = matchLots(history.includes(statement) ? history : [...history, statement]);
  const prefix = `${year}-`;
  const income: IbCsvYearIncome = { amounts: [], trades: 0, dividends: 0, unmatched: 0 };

  for (const trade of statement.trades) {
    const pieces = closings.get(trade.key);
    if (!pieces || !trade.dateTime.startsWith(prefix)) {
      continue;
    }
    income.trades++;
    if (pieces.some((p) => !p.date)) {
      income.unmatched++;
    }
    income.amounts.push(...closingAmounts(trade, pieces));
  }

  for (const dividend of statement.dividends) {
    if (dividend.date.startsWith(prefix)) {
      income.dividends++;
      income.amounts.push({
        kind: 'dividend',
        currency: dividend.currency,
        purchaseDate: '',
        saleDate: dividend.date,
        purchase: 0,
        sale: dividend.amount,
        expenses: 0,
      });
    }
  }
  return income;
}

/** Part of a closing trade that closes one lot; `date` is `''` for a lot never seen opened. */
interface LotPiece {
  date: string;
  quantity: number;
  /** Share of the trade's basis (same sign). */
  basis: number;
}

interface Lot {
  date: string;
  /** Signed: negative for a short position. */
  quantity: number;
  /** Cost of the lot: positive for a long one, minus the premium received for a short one. */
  cost: number;
}

/**
 * Splits every closing trade of `history` into the lots it closes, by trade key. Positions
 * a statement starts with that no earlier statement explains become lots of unknown date.
 */
function matchLots(history: readonly IbCsvStatement[]): Map<string, LotPiece[]> {
  const events: { time: string; trade?: IbCsvTrade; prior?: IbCsvStatement['priorPositions'] }[] =
    [];
  const seen = new Set<string>();
  for (const statement of history) {
    const times = statement.trades.map((t) => t.dateTime).sort();
    if (times.length > 0) {
      // A bare date sorts before every trade of that day.
      events.push({ time: times[0].slice(0, 10), prior: statement.priorPositions });
    }
    for (const trade of statement.trades) {
      if (!seen.has(trade.key)) {
        seen.add(trade.key);
        events.push({ time: trade.dateTime, trade });
      }
    }
  }
  // Stable sort: trades at the same second keep the statement's order.
  events.sort((a, b) => a.time.localeCompare(b.time));

  const positions = new Map<string, Lot[]>();
  const lotsOf = (position: string) => {
    const lots = positions.get(position) ?? [];
    positions.set(position, lots);
    return lots;
  };
  const closings = new Map<string, LotPiece[]>();

  for (const { trade, prior } of events) {
    for (const { position, quantity } of prior ?? []) {
      const lots = lotsOf(position);
      const held = lots.reduce((sum, lot) => sum + lot.quantity, 0);
      const missing = quantity - held;
      if (Math.sign(missing) === Math.sign(quantity) && Math.abs(missing) > EPSILON) {
        lots.unshift({ date: '', quantity: missing, cost: 0 });
      }
    }
    if (!trade) {
      continue;
    }
    const lots = lotsOf(trade.position);
    const direction = Math.sign(trade.quantity);
    const opens = trade.codes.includes('O');
    const closes =
      trade.codes.includes('C') ||
      (!opens && lots.length > 0 && Math.sign(lots[0].quantity) === -direction);

    let rest = Math.abs(trade.quantity);
    if (closes) {
      const pieces: LotPiece[] = [];
      while (rest > EPSILON && lots.length > 0 && Math.sign(lots[0].quantity) === -direction) {
        const lot = lots[0];
        const quantity = Math.min(rest, Math.abs(lot.quantity));
        const cost = (lot.cost * quantity) / Math.abs(lot.quantity);
        pieces.push({ date: lot.date, quantity, basis: -cost });
        lot.cost -= cost;
        lot.quantity += direction * quantity;
        rest -= quantity;
        if (Math.abs(lot.quantity) < EPSILON) {
          lots.shift();
        }
      }
      if (!opens && rest > EPSILON) {
        pieces.push({ date: '', quantity: rest, basis: 0 });
        rest = 0;
      }
      closings.set(trade.key, fitToBasis(trade, pieces));
    }
    if (rest > EPSILON) {
      // The cost of an opening trade is what was paid for it, commission included.
      const share = rest / Math.abs(trade.quantity);
      lots.push({
        date: trade.dateTime.slice(0, 10),
        quantity: direction * rest,
        cost: -(trade.proceeds + trade.commission) * share,
      });
    }
  }
  return closings;
}

/**
 * Makes the pieces add up to the basis IB reports, so the profit matches the statement:
 * lots listed in the statement replace the matched ones, lots of unknown date take the
 * rest of the basis, and otherwise the matched costs are scaled.
 */
function fitToBasis(trade: IbCsvTrade, matched: LotPiece[]): LotPiece[] {
  const sign = Math.sign(trade.basis) || Math.sign(trade.quantity);
  const pieces =
    trade.closedLots.length > 0
      ? trade.closedLots.map((lot) => ({ ...lot, basis: sign * lot.basis }))
      : matched;
  const knownBasis = pieces.reduce((sum, p) => sum + (p.date ? p.basis : 0), 0);
  const unknown = pieces.filter((p) => !p.date);

  if (unknown.length > 0) {
    const quantity = unknown.reduce((sum, p) => sum + p.quantity, 0);
    for (const piece of unknown) {
      piece.basis = ((trade.basis - knownBasis) * piece.quantity) / quantity;
    }
  } else if (knownBasis !== 0 && trade.basis / knownBasis > 0) {
    const scale = trade.basis / knownBasis;
    for (const piece of pieces) {
      piece.basis *= scale;
    }
  }
  return pieces;
}

/**
 * Amounts of a closing trade, one per closed lot. Closing a long position sells at the
 * trade date what the lot bought; closing a short one buys back what the lot sold.
 */
function closingAmounts(trade: IbCsvTrade, pieces: readonly LotPiece[]): RealizedAmount[] {
  const date = trade.dateTime.slice(0, 10);
  const total = pieces.reduce((sum, p) => sum + p.quantity, 0) || 1;
  return pieces.map((piece) => {
    const share = piece.quantity / total;
    const proceeds = trade.proceeds * share;
    const commission = trade.commission * share;
    return trade.quantity < 0
      ? {
          kind: 'trade',
          currency: trade.currency,
          purchaseDate: piece.date,
          saleDate: date,
          purchase: -piece.basis,
          sale: proceeds,
          expenses: -commission,
        }
      : {
          kind: 'trade',
          currency: trade.currency,
          purchaseDate: date,
          saleDate: piece.date || date,
          purchase: -(proceeds + commission),
          sale: piece.basis,
          expenses: 0,
        };
  });
}

function positionKey(account: string, symbol: string): string {
  // Bond symbols end with the yield of the trade, which differs between trades.
  return `${account}|${symbol.replace(/\s+[\d.]+%$/, '')}`;
}

/** Dates of a period like `January 1, 2026 - October 5, 2026`, as `YYYY-MM-DD`. */
function parsePeriod(period: string): string[] {
  return [...period.matchAll(/(\p{L}+)\s+(\d{1,2}),\s*(\d{4})/gu)].flatMap(
    ([, month, day, year]) => {
      const m = MONTHS.findIndex((names) => names.includes(month.slice(0, 3).toLowerCase())) + 1;
      return m > 0 ? [`${year}-${String(m).padStart(2, '0')}-${day.padStart(2, '0')}`] : [];
    },
  );
}

/** Numbers use a dot for decimals and may group thousands with commas. */
function parseNumber(value: string): number {
  return parseFloat(value.replace(/,/g, '')) || 0;
}

/** RFC 4180 rows: quoted fields may hold commas, quotes (doubled) and line breaks. */
function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (quoted) {
      if (char === '"' && content[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && content[i + 1] === '\n') {
        i++;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
