/**
 * XML for annex Ф1 (investment profit) to the annual property and income declaration, in the
 * format the DPS e-cabinet imports: schema F0121215.xsd (C_DOC F01, C_DOC_SUB 212, C_DOC_VER 15),
 * Ministry of Finance order No. 859 of 02.10.2015 as amended by order No. 119 of 26.02.2025.
 *
 * Elements follow the schema's xs:sequence order, which the e-cabinet validates.
 */
import type { FinancialPosition } from '../declaration/f0121214/tax-model';
import { militaryTaxRate } from '../declaration/f0121214/tax-model';

const C_DOC = 'F01';
const C_DOC_SUB = '212';
const C_DOC_VER = '15';
/** First (original) report: C_DOC_TYPE 0, C_DOC_STAN 1 ("звітна"), one document in the period. */
const C_DOC_TYPE = 0;
const C_DOC_STAN = 1;
const C_DOC_CNT = 1;
/** Annual report: PERIOD_TYPE 5, last month 12. */
const PERIOD_TYPE = 5;
const PERIOD_MONTH = 12;

const PDFO_RATE = 0.18;

/** Column 2 "код виду інвестиційного активу". */
export const F1_ASSET_CODE = {
  /** Securities or derivatives traded on a stock exchange. */
  exchangeTraded: 2,
  /** Investment assets with a source outside Ukraine. */
  foreign: 4,
} as const;

/** Taxpayer number: 10-digit RNOKPP, 9-digit ID-card number, or passport series + number. */
const TIN_PATTERN = /^(\d{10}|\d{9}|[АБВГДЕЄЖЗИІКЛМНОПРСТУФХЦЧШЩЮЯ]{2}\d{6})$/;
/** DGc_dpi from common_types.xsd: code of the tax office the report is filed with. */
const TAX_OFFICE_PATTERN =
  /^((3070)|(3[1-5]00)|(9001)|(9191)|(9393)|(9494)|(9900)|(9911)|(9970)|(999[1-9])|(2[0-8][0-9]{2})|(1[0-9]{3})|([1-9][0-9]{2}))$/;

export interface F1XmlInput {
  fullName: string;
  taxNumber: string;
  taxOfficeCode: string;
  year: string;
  positions: readonly FinancialPosition[];
  /** Fill date; passed in so the output is deterministic. */
  fillDate: Date;
}

export interface F1Row {
  code: number;
  description: string;
  /** Amounts in kopecks. */
  income: number;
  costs: number;
  result: number;
}

export type F1XmlResult =
  | { ok: true; xml: string; fileName: string; rows: F1Row[]; skipped: number }
  | { ok: false; field?: 'fullName' | 'taxNumber' | 'taxOfficeCode'; message: string };

/** Build the Ф1 XML, or explain which input the e-cabinet would reject. */
export function buildF1Xml(input: F1XmlInput): F1XmlResult {
  const fullName = input.fullName.trim();
  const tin = input.taxNumber.replace(/\s+/g, '').toUpperCase();
  const taxOffice = input.taxOfficeCode.trim();
  const year = parseInt(input.year);

  if (!fullName) {
    return { ok: false, field: 'fullName', message: "Вкажіть прізвище, ім'я та по батькові." };
  }
  if (!TIN_PATTERN.test(tin)) {
    return {
      ok: false,
      field: 'taxNumber',
      message: 'ІПН має містити 10 цифр (або 9 цифр ID-картки чи серію та номер паспорта).',
    };
  }
  if (!TAX_OFFICE_PATTERN.test(taxOffice)) {
    return {
      ok: false,
      field: 'taxOfficeCode',
      message: 'Вкажіть код ДПІ, до якої подається декларація (3–4 цифри, наприклад 2650).',
    };
  }
  if (!(year >= 1981 && year <= 2099)) {
    return { ok: false, message: 'Оберіть рік звіту.' };
  }

  const included = input.positions.filter(isF1Position);
  const rows = included.map(toRow);
  if (rows.length === 0) {
    return {
      ok: false,
      message:
        'Немає операцій з інвестиційними активами для додатка Ф1. Дивіденди та нерухомість у Ф1 не включаються.',
    };
  }

  const totalIncome = sum(rows.map((r) => r.income));
  const totalCosts = sum(rows.map((r) => r.costs));
  const totalResult = sum(rows.map((r) => r.result));
  // Row 2 (loss carried over from the previous year) is not collected by the form yet.
  const financialResult = totalResult;
  const profit = Math.max(0, financialResult);
  const loss = Math.max(0, -financialResult);
  const pdfo = Math.round(profit * PDFO_RATE);
  const militaryTax = Math.round(profit * militaryTaxRate(input.year));

  const officeCode = taxOffice.padStart(4, '0');
  const cReg = parseInt(officeCode.slice(0, 2));
  const cRaj = parseInt(officeCode.slice(2, 4));
  const fillDate = formatFillDate(input.fillDate);

  const head = [
    el('TIN', tin),
    el('C_DOC', C_DOC),
    el('C_DOC_SUB', C_DOC_SUB),
    el('C_DOC_VER', C_DOC_VER),
    el('C_DOC_TYPE', C_DOC_TYPE),
    el('C_DOC_CNT', C_DOC_CNT),
    el('C_REG', cReg),
    el('C_RAJ', cRaj),
    el('PERIOD_MONTH', PERIOD_MONTH),
    el('PERIOD_TYPE', PERIOD_TYPE),
    el('PERIOD_YEAR', year),
    el('C_STI_ORIG', parseInt(taxOffice)),
    el('C_DOC_STAN', C_DOC_STAN),
    el('D_FILL', fillDate),
    el('SOFTWARE', 'Taxered'),
  ];

  const column = (name: string, value: (r: F1Row) => string | number) =>
    rows.map((r, i) => el(name, value(r), i + 1));

  const body = [
    el('HTIN', tin),
    el('HZ', 1),
    el('HZY', year),
    ...column('T1RXXXXG2', (r) => r.code),
    ...column('T1RXXXXG3S', (r) => r.description),
    ...column('T1RXXXXG4', (r) => money(r.income)),
    ...column('T1RXXXXG5', (r) => money(r.costs)),
    ...column('T1RXXXXG6', (r) => money(r.result)),
    el('R001G4', money(totalIncome)),
    el('R001G5', money(totalCosts)),
    el('R001G6', money(totalResult)),
    el('R003G6', money(financialResult)),
    // 3.1 investment profit or 3.2 loss (carried to row 2 of next year's Ф1).
    ...(profit > 0 ? [el('R031G6', money(profit))] : []),
    ...(loss > 0 ? [el('R032G6', money(loss))] : []),
    // 4 / 5: PDFO and military levy on row 3.1; 4.2 / 5.2: payable by the taxpayer, since a
    // foreign broker withholds nothing (4.1 / 5.1 stay empty).
    ...(profit > 0
      ? [
          el('R004G6', money(pdfo)),
          el('R042G6', money(pdfo)),
          el('R005G6', money(militaryTax)),
          el('R052G6', money(militaryTax)),
        ]
      : []),
    el('HBOS', fullName),
  ];

  const xml =
    '<?xml version="1.0" encoding="windows-1251"?>\r\n' +
    '<DECLAR xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="F0121215.xsd">\r\n' +
    '<DECLARHEAD>\r\n' +
    head.join('\r\n') +
    '\r\n</DECLARHEAD>\r\n' +
    '<DECLARBODY>\r\n' +
    body.join('\r\n') +
    '\r\n</DECLARBODY>\r\n' +
    '</DECLAR>\r\n';

  // DPS file-name convention (DGFilename): region+district, TIN, document code, state,
  // type, counter, period and tax office code.
  const fileName =
    officeCode +
    (/^\d+$/.test(tin) ? tin.padStart(10, '0') : `00${tin}`) +
    C_DOC +
    C_DOC_SUB +
    C_DOC_VER +
    C_DOC_STAN +
    String(C_DOC_TYPE).padStart(2, '0') +
    String(C_DOC_CNT).padStart(7, '0') +
    PERIOD_TYPE +
    String(PERIOD_MONTH).padStart(2, '0') +
    year +
    officeCode +
    '.xml';

  return { ok: true, xml, fileName, rows, skipped: input.positions.length - included.length };
}

/** Trades with investment assets; dividends and real estate are declared elsewhere. */
function isF1Position(p: FinancialPosition): boolean {
  if (p.assetType === 'dividends' || p.assetType === 'real_estate') {
    return false;
  }
  return toKopecks(p.salePrice) !== 0 || toKopecks(p.purchasePrice) !== 0;
}

function toRow(p: FinancialPosition): F1Row {
  const income = toKopecks(p.salePrice);
  const costs = toKopecks(p.purchasePrice) + toKopecks(p.expenses);
  const foreign =
    (!!p.currency && p.currency !== 'UAH') ||
    p.source === 'interactive_brokers' ||
    p.source === 'freedom_finance';
  return {
    code: foreign ? F1_ASSET_CODE.foreign : F1_ASSET_CODE.exchangeTraded,
    description: describe(p),
    income,
    costs,
    result: income - costs,
  };
}

const ASSET_LABELS: Record<string, string> = {
  stocks: 'Акції',
  bonds: 'Облігації',
  options: 'Опціони',
  crypto: 'Віртуальні активи',
  other: 'Інвестиційний актив',
};

function describe(p: FinancialPosition): string {
  const name = p.assetDescription?.trim() || p.symbol?.trim() || '';
  const label = ASSET_LABELS[p.assetType] ?? ASSET_LABELS['other'];
  const quantity = parseFloat(p.quantity ?? '');
  const parts = [name ? `${label}: ${name}` : label];
  if (quantity) {
    parts.push(`${Math.abs(quantity)} шт.`);
  }
  if (p.saleDate) {
    parts.push(`продаж ${formatIsoDate(p.saleDate)}`);
  }
  return parts.join(', ');
}

function toKopecks(value: string | undefined): number {
  const amount = Number.parseFloat(value ?? '');
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/** DGdecimal2: optional minus, digits, dot, exactly two decimals. */
function money(kopecks: number): string {
  const abs = Math.abs(kopecks);
  const sign = kopecks < 0 ? '-' : '';
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** DGDate: ddmmyyyy. */
function formatFillDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}${mm}${date.getFullYear()}`;
}

/** "2025-03-14" -> "14.03.2025"; other formats pass through. */
function formatIsoDate(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : value;
}

function el(name: string, value: string | number, rowNum?: number): string {
  const attr = rowNum === undefined ? '' : ` ROWNUM="${rowNum}"`;
  return `<${name}${attr}>${escapeXml(String(value))}</${name}>`;
}

function escapeXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

let win1251: Map<number, number> | null = null;

/**
 * Encode text as windows-1251, the encoding the DPS e-cabinet expects. Characters the code page
 * lacks become "?".
 */
export function encodeWindows1251(text: string): Uint8Array<ArrayBuffer> {
  if (!win1251) {
    win1251 = new Map();
    const decoder = new TextDecoder('windows-1251');
    for (let byte = 0x80; byte <= 0xff; byte++) {
      const char = decoder.decode(new Uint8Array([byte]));
      if (char !== '�') {
        win1251.set(char.charCodeAt(0), byte);
      }
    }
  }
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    bytes[i] = code < 0x80 ? code : (win1251.get(code) ?? 0x3f);
  }
  return bytes;
}

export function downloadF1Xml(xml: string, fileName: string): void {
  const blob = new Blob([encodeWindows1251(xml)], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
