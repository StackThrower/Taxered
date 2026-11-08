/**
 * Form versions, tax rates and thresholds by income year. Each value is one entry here, so a new
 * form version or rate is a one-line change.
 */
import type { Kopecks } from './money';

/** Document codes from the DPS e-forms register: F01 002 (declaration), F01 212 (annex Ф1). */
export const C_DOC = 'F01';
export const C_DOC_SUB = { declaration: '002', f1: '212' } as const;

/** Annual report: PERIOD_TYPE 5, last month 12. */
export const PERIOD_TYPE = 5;
export const PERIOD_MONTH = 12;

export interface FormVersion {
  /** C_DOC_VER of the declaration F01002xx. */
  declaration: string;
  /** C_DOC_VER of annex Ф1 F01212xx. */
  f1: string;
}

/**
 * C_DOC_VER by income year (the year the return is for, not the year it is filed). Years without
 * an entry get PDF/Excel only. Schemas for every version are in schemas/dps/2026/.
 */
export const FORM_VERSIONS: Readonly<Record<number, FormVersion>> = {
  // FREDO 01.03.084, MoF order No. 143.
  2022: { declaration: '13', f1: '13' },
  // M.E.Doc 11.02.131, MoF order No. 467. For 2024 income: check the register archive.
  2023: { declaration: '14', f1: '14' },
  2024: { declaration: '14', f1: '14' },
  // "Єдине вікно" 1.34.0.0, MoF order No. 119.
  2025: { declaration: '15', f1: '15' },
  // Open question 7: MoF order No. 2 of 05.01.2026 may bring F0100216/F0121216 for the 2027
  // campaign. Check the DPS e-forms register in December 2026 – January 2027.
  2026: { declaration: '15', f1: '15' },
};

export function formVersion(year: number): FormVersion | null {
  return FORM_VERSIONS[year] ?? null;
}

/** Rates in basis points. */
export const RATE_BP = {
  /** PDFO on investment profit and other foreign income (pp. 167.1, 170.11.1). */
  pdfo: 1800,
  /** PDFO on dividends from non-residents (pp. 167.5.4). */
  pdfoDividends: 900,
} as const;

/** Military levy: 1.5% on income up to 31.12.2024, 5% from 01.01.2025. */
export function militaryLevyBp(year: number): number {
  return year >= 2025 ? 500 : 150;
}

/**
 * Pp. "а" 170.2.8: if the year's income from selling investment assets does not exceed
 * 1.4 × the subsistence minimum for able-bodied persons on 1 January (rounded to 10 UAH),
 * the income and costs are left out of the calculation.
 *
 * Open question 3: the DPS calls 4 240 UAH a monthly amount, the Code speaks of income for the
 * year; Taxered applies it to the annual sale income.
 */
export const INVESTMENT_THRESHOLD: Readonly<Record<number, Kopecks>> = {
  2019: 269_000, // 1.4 × 1 921
  2020: 294_000, // 1.4 × 2 102
  2021: 318_000, // 1.4 × 2 270
  2022: 347_000, // 1.4 × 2 481
  2023: 376_000, // 1.4 × 2 684
  2024: 424_000, // 1.4 × 3 028
  2025: 424_000, // 1.4 × 3 028 (DPS)
  // 1.4 × 3 328 per the Taxered article; check the subsistence minimum on 01.01.2026.
  2026: 466_000,
};

export function investmentThreshold(year: number): Kopecks | null {
  return INVESTMENT_THRESHOLD[year] ?? null;
}
