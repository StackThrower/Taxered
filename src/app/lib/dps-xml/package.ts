/**
 * The package for the DPS e-cabinet: declaration F0100215 and, when there is investment profit
 * or loss to report, annex Ф1 F0121215, each a windows-1251 XML named by the standard and linked
 * to the other through LINKED_DOCS. Nothing here talks to the network: the files are built and
 * downloaded in the browser.
 */
import type { FinancialPosition, TaxOptions } from '../../declaration/f0121214/tax-model';
import {
  computeDeclaration,
  renderDeclarationBody,
  type DeclarationCalculation,
  type DeclarationKind,
} from './declaration';
import { encodeWindows1251, unencodableChars } from './encoding';
import { computeF1, renderF1Rows, type F1Calculation } from './f1';
import { computeForeignIncome } from './foreign-income';
import {
  docFileName,
  renderHead,
  schemaName,
  type DocCode,
  type DocContext,
  type LinkedDoc,
} from './header';
import { toKopecks } from './money';
import {
  normalizeTaxOffice,
  normalizeTin,
  validateTaxpayer,
  type FieldError,
  type Taxpayer,
} from './taxpayer';
import { C_DOC_SUB, formVersion } from './versions';
import { el, xmlDocument } from './xml';

export interface PackageInput {
  year: string;
  taxpayer: Taxpayer;
  positions: readonly FinancialPosition[];
  options?: TaxOptions;
  meta?: DeclarationMeta;
  /** Fill date; passed in so the output is deterministic. */
  fillDate: Date;
}

/** Type of the return: "звітна", "звітна нова" or "уточнююча". */
export interface DeclarationMeta {
  kind: DeclarationKind;
  /**
   * C_DOC_TYPE: 0 for the first document of the period, +1 for each next new or clarifying one.
   * Ignored for an original return.
   */
  docNumber?: string;
  /** HNUM_U: registration number of the document being clarified (required by the XSD). */
  clarifiedRegNumber?: string;
}

const DOC_STATE = { original: 1, new: 2, clarifying: 3 } as const;

export interface PackageFile {
  kind: 'declaration' | 'f1';
  name: string;
  xml: string;
  bytes: Uint8Array<ArrayBuffer>;
}

export type PackageResult =
  | {
      ok: true;
      files: PackageFile[];
      warnings: string[];
      f1: F1Calculation | null;
      declaration: DeclarationCalculation;
    }
  | ({ ok: false } & FieldError);

export function buildDeclarationPackage(input: PackageInput): PackageResult {
  const taxpayerError = validateTaxpayer(input.taxpayer);
  if (taxpayerError) {
    return { ok: false, ...taxpayerError };
  }
  const meta = input.meta ?? { kind: 'original' };
  const metaError = validateMeta(meta);
  if (metaError) {
    return { ok: false, ...metaError };
  }
  const docType = meta.kind === 'original' ? 0 : parseInt(meta.docNumber ?? '');
  const year = parseInt(input.year);
  const version = formVersion(year);
  if (!version) {
    return {
      ok: false,
      message: `XML для ${input.year || 'цього'} року не формується: немає затвердженої для нього версії е-форми. Скористайтеся PDF.`,
    };
  }

  const options = input.options ?? {};
  const f1Calc = computeF1(input.positions, year, {
    previousYearsLoss: toKopecks(options.previousYearsLoss),
    withheldPdfo: toKopecks(options.withheldPdfo),
    withheldMilitaryLevy: toKopecks(options.withheldMilitaryLevy),
  });
  const foreign = computeForeignIncome(input.positions, year);
  const f1 = f1Calc.rows.length > 0 && !f1Calc.belowThreshold ? f1Calc : null;
  if (!f1 && foreign.total === 0) {
    return {
      ok: false,
      message: f1Calc.belowThreshold
        ? `${f1Calc.warnings[f1Calc.warnings.length - 1]} Інших доходів для декларування немає.`
        : 'Немає доходів для декларування: додайте закриті позиції, дивіденди або інші іноземні доходи.',
    };
  }
  const declaration = computeDeclaration(f1, foreign, {
    foreignTaxCredit: toKopecks(options.foreignTaxCredit),
  });

  const tin = normalizeTin(input.taxpayer.taxNumber);
  const fullName = input.taxpayer.fullName.trim();
  const ctx: DocContext = {
    tin,
    taxOffice: normalizeTaxOffice(input.taxpayer.taxOfficeCode),
    year,
    fillDate: formatDdMmYyyy(input.fillDate),
  };

  const declarationDoc: DocCode = {
    cDocSub: C_DOC_SUB.declaration,
    cDocVer: version.declaration,
    cDocType: docType,
    cDocCnt: 1,
    cDocStan: DOC_STATE[meta.kind],
  };
  const f1Doc: DocCode = { ...declarationDoc, cDocSub: C_DOC_SUB.f1, cDocVer: version.f1 };

  const declarationLinks: LinkedDoc[] = f1 ? [{ type: 1, doc: f1Doc }] : [];
  const files = [
    toFile(
      'declaration',
      docFileName(ctx, declarationDoc),
      xmlDocument(
        schemaName(declarationDoc),
        renderHead(ctx, declarationDoc, declarationLinks),
        renderDeclarationBody(
          {
            kind: meta.kind,
            clarifiedRegNumber: meta.clarifiedRegNumber,
            year,
            taxpayer: input.taxpayer,
            tin,
            hasF1: !!f1,
            fillDate: ctx.fillDate,
          },
          declaration,
        ),
      ),
    ),
  ];

  if (f1) {
    files.push(
      toFile(
        'f1',
        docFileName(ctx, f1Doc),
        xmlDocument(schemaName(f1Doc), renderHead(ctx, f1Doc, [{ type: 2, doc: declarationDoc }]), [
          el('HTIN', tin),
          el(F1_KIND[meta.kind], 1),
          el('HZY', year),
          // HZYP: period being clarified, the same report year.
          ...(meta.kind === 'clarifying' ? [el('HZYP', year)] : []),
          ...renderF1Rows(f1),
          el('HBOS', fullName),
        ]),
      ),
    );
  }

  return {
    ok: true,
    files,
    warnings: [
      ...f1Calc.warnings,
      ...foreign.warnings,
      ...declaration.warnings,
      ...encodingWarnings(files),
    ],
    f1,
    declaration,
  };
}

/** Choice HZ | HZN | HZU of Ф1. */
const F1_KIND = { original: 'HZ', new: 'HZN', clarifying: 'HZU' } as const;

function validateMeta(meta: DeclarationMeta): FieldError | null {
  if (meta.kind === 'original') {
    return null;
  }
  const docNumber = meta.docNumber?.trim() ?? '';
  if (!/^\d{1,2}$/.test(docNumber) || parseInt(docNumber) < 1) {
    return {
      field: 'docNumber',
      message:
        'Вкажіть порядковий номер документа за цей період: 1 для першої нової звітної чи уточнюючої декларації, 2 — для наступної тощо.',
    };
  }
  const regNumber = meta.clarifiedRegNumber?.trim() ?? '';
  if (meta.kind === 'clarifying' && !/^0*[1-9]\d{0,18}$/.test(regNumber)) {
    return {
      field: 'clarifiedRegNumber',
      message:
        'Для уточнюючої декларації вкажіть реєстраційний номер документа, який уточнюється (є в квитанції з Електронного кабінету).',
    };
  }
  return null;
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
