/**
 * The package for the DPS e-cabinet: windows-1251 XML files named by the standard. Nothing here
 * talks to the network; the files are built and downloaded in the browser.
 */
import type { FinancialPosition, TaxOptions } from '../../declaration/f0121214/tax-model';
import { encodeWindows1251, unencodableChars } from './encoding';
import { computeF1, renderF1Rows, type F1Calculation } from './f1';
import { toKopecks } from './money';
import { docFileName, renderHead, schemaName, type DocCode, type DocContext } from './header';
import {
  normalizeTaxOffice,
  normalizeTin,
  validateIdentity,
  type FieldError,
  type Taxpayer,
} from './taxpayer';
import { C_DOC_SUB, formVersion } from './versions';
import { el, xmlDocument } from './xml';

export interface PackageInput {
  year: string;
  taxpayer: Pick<Taxpayer, 'fullName' | 'taxNumber' | 'taxOfficeCode'>;
  positions: readonly FinancialPosition[];
  options?: TaxOptions;
  /** Fill date; passed in so the output is deterministic. */
  fillDate: Date;
}

export interface PackageFile {
  kind: 'declaration' | 'f1';
  name: string;
  xml: string;
  bytes: Uint8Array<ArrayBuffer>;
}

export type PackageResult =
  | { ok: true; files: PackageFile[]; warnings: string[]; f1: F1Calculation | null }
  | ({ ok: false } & FieldError);

export function buildDeclarationPackage(input: PackageInput): PackageResult {
  const identityError = validateIdentity(input.taxpayer);
  if (identityError) {
    return { ok: false, ...identityError };
  }
  const year = parseInt(input.year);
  const version = formVersion(year);
  if (!version) {
    return {
      ok: false,
      message: `XML для ${input.year || 'цього'} року не формується: немає затвердженої для нього версії е-форми. Скористайтеся PDF.`,
    };
  }

  const tin = normalizeTin(input.taxpayer.taxNumber);
  const fullName = input.taxpayer.fullName.trim();
  const ctx: DocContext = {
    tin,
    taxOffice: normalizeTaxOffice(input.taxpayer.taxOfficeCode),
    year,
    fillDate: formatDdMmYyyy(input.fillDate),
  };

  const options = input.options ?? {};
  const f1 = computeF1(input.positions, year, {
    previousYearsLoss: toKopecks(options.previousYearsLoss),
    withheldPdfo: toKopecks(options.withheldPdfo),
    withheldMilitaryLevy: toKopecks(options.withheldMilitaryLevy),
  });
  if (f1.rows.length === 0 || f1.belowThreshold) {
    return {
      ok: false,
      message: f1.belowThreshold
        ? f1.warnings[f1.warnings.length - 1]
        : 'Немає операцій з інвестиційними активами для додатка Ф1. Дивіденди та нерухомість у Ф1 не включаються.',
    };
  }

  const f1Doc: DocCode = {
    cDocSub: C_DOC_SUB.f1,
    cDocVer: version.f1,
    cDocType: 0,
    cDocCnt: 1,
    cDocStan: 1,
  };
  const xml = xmlDocument(schemaName(f1Doc), renderHead(ctx, f1Doc, []), [
    el('HTIN', tin),
    el('HZ', 1),
    el('HZY', year),
    ...renderF1Rows(f1),
    el('HBOS', fullName),
  ]);

  const files = [toFile('f1', docFileName(ctx, f1Doc), xml)];
  return { ok: true, files, warnings: [...f1.warnings, ...encodingWarnings(files)], f1 };
}

function toFile(kind: PackageFile['kind'], name: string, xml: string): PackageFile {
  return { kind, name, xml, bytes: encodeWindows1251(xml) };
}

function encodingWarnings(files: readonly PackageFile[]): string[] {
  const chars = [...new Set(files.flatMap((f) => unencodableChars(f.xml)))];
  return chars.length > 0
    ? [
        `Символи ${chars.map((c) => `«${c}»`).join(', ')} відсутні в кодуванні windows-1251 і замінені на «?».`,
      ]
    : [];
}

/** DGDate: ddmmyyyy. */
export function formatDdMmYyyy(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}${mm}${date.getFullYear()}`;
}

/** Save each file under its standard name; the names must not change (LINKED_DOCS uses them). */
export async function downloadPackage(files: readonly PackageFile[]): Promise<void> {
  for (const file of files) {
    const blob = new Blob([file.bytes], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    // Browsers drop back-to-back downloads triggered in the same tick.
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}
