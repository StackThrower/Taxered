/**
 * Declaration F0100215 (property and income, annual): only what an investor with a foreign
 * broker needs. Element names and order follow F0100215.xsd; row formulas follow the Instruction
 * (MoF order No. 859 as amended by No. 119) and the field codes of the official blank.
 */
import type { F1Calculation } from './f1';
import type { ForeignIncome } from './foreign-income';
import { formatAmount, sumKopecks, type Kopecks } from './money';
import type { Taxpayer } from './taxpayer';
import { el, optional } from './xml';

/** One column set of a "row 10.x": income and tax amounts, kopecks. */
export interface IncomeRow {
  /** Column 3: income. */
  income: Kopecks;
  /** Columns 4 / 5: PDFO / military levy withheld by a tax agent. */
  pdfoWithheld: Kopecks;
  militaryLevyWithheld: Kopecks;
  /** Columns 6 / 7: PDFO / military levy payable by the taxpayer. */
  pdfo: Kopecks;
  militaryLevy: Kopecks;
}

export interface DeclarationCalculation {
  /** Row 10.8 from Ф1: rows 3.1 / 4.1 / 5.1 / 4.2 / 5.2. */
  row108: IncomeRow | null;
  /** Row 10.10: income from sources outside Ukraine. */
  row1010: (IncomeRow & { sources: string }) | null;
  /** Row 10: totals of rows 10.x. */
  row10: IncomeRow;
  /** Row 12: total annual income (row 10 + row 11; row 11 is not filled). */
  row12: Kopecks;
  /** Row 13: total PDFO liability, column 6 of row 10. */
  row13: Kopecks;
  /** Row 18: foreign tax credited, not more than row 13. */
  row18: Kopecks;
  /** Row 20.1: PDFO payable, positive (13 − 16 − 17 − 18 − 19). */
  row201: Kopecks;
  /** Row 21.1: military levy payable, column 7 of row 10. */
  row211: Kopecks;
  warnings: string[];
}

export interface DeclarationOptions {
  /**
   * Foreign tax to credit (row 18). Only with a certificate of the foreign tax authority,
   * legalised; a broker's form is not one. The military levy is not reduced.
   */
  foreignTaxCredit?: Kopecks;
}

export function computeDeclaration(
  f1: F1Calculation | null,
  foreign: ForeignIncome,
  options: DeclarationOptions = {},
): DeclarationCalculation {
  const row108: IncomeRow | null =
    f1 && f1.profit > 0
      ? {
          income: f1.profit,
          pdfoWithheld: f1.pdfoWithheld,
          militaryLevyWithheld: f1.militaryLevyWithheld,
          pdfo: f1.pdfoPayable,
          militaryLevy: f1.militaryLevyPayable,
        }
      : null;
  const row1010 =
    foreign.total > 0
      ? {
          income: foreign.total,
          pdfoWithheld: 0,
          militaryLevyWithheld: 0,
          pdfo: foreign.pdfo,
          militaryLevy: foreign.militaryLevy,
          sources: foreign.sourcesText,
        }
      : null;

  const rows = [row108, row1010].filter((r): r is IncomeRow => r !== null);
  const total = (pick: (r: IncomeRow) => Kopecks) => sumKopecks(rows.map(pick));
  const row10: IncomeRow = {
    income: total((r) => r.income),
    pdfoWithheld: total((r) => r.pdfoWithheld),
    militaryLevyWithheld: total((r) => r.militaryLevyWithheld),
    pdfo: total((r) => r.pdfo),
    militaryLevy: total((r) => r.militaryLevy),
  };

  const warnings: string[] = [];
  const credit = Math.max(0, options.foreignTaxCredit ?? 0);
  const row13 = row10.pdfo;
  const row18 = Math.min(credit, row13);
  if (credit > row13) {
    warnings.push(
      `Зарахування іноземного податку обмежено сумою рядка 13 (${formatAmount(row13)} грн).`,
    );
  }

  return {
    row108,
    row1010,
    row10,
    row12: row10.income,
    row13,
    row18,
    row201: Math.max(0, row13 - row18),
    row211: row10.militaryLevy,
    warnings,
  };
}

export type DeclarationKind = 'original' | 'new' | 'clarifying';

export interface DeclarationHeader {
  kind: DeclarationKind;
  year: number;
  /** HNUM_U: registration number of the document being clarified. */
  clarifiedRegNumber?: string;
  taxpayer: Taxpayer;
  tin: string;
  hasF1: boolean;
  /** HFILL, ddmmyyyy. */
  fillDate: string;
}

/** DECLARBODY of F0100215 in xs:sequence order. */
export function renderDeclarationBody(h: DeclarationHeader, d: DeclarationCalculation): string[] {
  const t = h.taxpayer;
  const a = t.address;
  const text = (value: string | undefined) => value?.trim() || undefined;
  const amount = (name: string, kopecks: Kopecks) =>
    kopecks !== 0 ? [el(name, formatAmount(kopecks))] : [];
  const row = (code: string, r: IncomeRow | null, columns: readonly (3 | 4 | 5 | 6 | 7)[]) =>
    r ? columns.flatMap((g) => amount(`R${code}G${g}`, incomeColumn(r, g))) : [];

  return [
    ...kindElements(h),
    el('HZY', h.year),
    // Row 2 "period being clarified" (year): the clarified period is the same report year.
    ...(h.kind === 'clarifying' ? [el('HZYP', h.year)] : []),
    el('HNAME', t.fullName.trim()),
    el('HTIN', h.tin),
    ...optional('HREG', text(a.region)),
    ...optional('HRAJ', text(a.district)),
    el('HCITY', a.city.trim()),
    el('HSTREET', a.street.trim()),
    ...optional('HBUILD', text(a.building)),
    ...optional('HCORP', text(a.corpus)),
    ...optional('HAPT', text(a.apartment)),
    ...optional('HZIP', text(a.zip)),
    ...optional('HTEL', text(t.phone)),
    ...optional('HEMAIL', text(t.email)),
    el('HSTI', t.taxOfficeName.trim()),
    // Resident (H01), filled by the taxpayer (H03), category "громадянин" (H05).
    el('H01', 1),
    el('H03', 1),
    el('H05', 1),
    ...row('010', d.row10, [3, 4, 5, 6, 7]),
    ...row('0108', d.row108, [3, 4, 5, 6, 7]),
    ...(d.row1010 && d.row1010.sources ? [el('R01010G2S', d.row1010.sources)] : []),
    ...row('01010', d.row1010, [3, 6, 7]),
    ...amount('R012G3', d.row12),
    ...amount('R013G3', d.row13),
    ...amount('R018G3', d.row18),
    ...amount('R0201G3', d.row201),
    ...amount('R0211G3', d.row211),
    ...(h.hasF1 ? [el('HD1', 1)] : []),
    el('HFILL', h.fillDate),
    el('HBOS', t.fullName.trim()),
  ];
}

function incomeColumn(r: IncomeRow, column: 3 | 4 | 5 | 6 | 7): Kopecks {
  switch (column) {
    case 3:
      return r.income;
    case 4:
      return r.pdfoWithheld;
    case 5:
      return r.militaryLevyWithheld;
    case 6:
      return r.pdfo;
    case 7:
      return r.militaryLevy;
  }
}

/** Choice HZ | HZN | (HZU, HNUM_U). */
function kindElements(h: DeclarationHeader): string[] {
  switch (h.kind) {
    case 'new':
      return [el('HZN', 1)];
    case 'clarifying':
      return [el('HZU', 1), el('HNUM_U', h.clarifiedRegNumber?.trim() ?? '')];
    default:
      return [el('HZ', 1)];
  }
}
