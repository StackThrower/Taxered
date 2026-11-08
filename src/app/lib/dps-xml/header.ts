/** DECLARHEAD and LINKED_DOCS, shared by the declaration and its annexes. */
import { buildFileName } from './filename';
import { C_DOC, PERIOD_MONTH, PERIOD_TYPE } from './versions';
import { el, group } from './xml';

/** C_DOC_STAN: 1 "звітний", 2 "новий звітний", 3 "уточнюючий". */
export type DocState = 1 | 2 | 3;

/** What identifies one document of the package. */
export interface DocCode {
  cDocSub: string;
  cDocVer: string;
  /** 0 for the first document of the period, +1 for each next new or clarifying one. */
  cDocType: number;
  /** Number of same-type documents in the package: always 1 here. */
  cDocCnt: number;
  cDocStan: DocState;
}

export interface DocContext {
  /** TIN as the DGLong / DGFilename patterns expect (digits, or passport series + number). */
  tin: string;
  /** Four-digit tax office code, e.g. "2650". */
  taxOffice: string;
  year: number;
  /** D_FILL, ddmmyyyy. */
  fillDate: string;
}

/** LINKED_DOCS/DOC TYPE: 1 link to an annex, 2 link to the main document. */
export type LinkType = 1 | 2;

export interface LinkedDoc {
  type: LinkType;
  doc: DocCode;
}

export function schemaName(doc: DocCode): string {
  return `${C_DOC}${doc.cDocSub}${doc.cDocVer}.xsd`;
}

export function docFileName(ctx: DocContext, doc: DocCode): string {
  return buildFileName({
    taxOffice: ctx.taxOffice,
    tin: ctx.tin,
    cDoc: C_DOC,
    cDocSub: doc.cDocSub,
    cDocVer: doc.cDocVer,
    cDocStan: doc.cDocStan,
    cDocType: doc.cDocType,
    cDocCnt: doc.cDocCnt,
    periodType: PERIOD_TYPE,
    periodMonth: PERIOD_MONTH,
    year: ctx.year,
  });
}

/** DECLARHEAD children in F01 xs:sequence order. */
export function renderHead(ctx: DocContext, doc: DocCode, linked: readonly LinkedDoc[]): string[] {
  const cReg = parseInt(ctx.taxOffice.slice(0, 2));
  const cRaj = parseInt(ctx.taxOffice.slice(2, 4));
  return [
    el('TIN', ctx.tin),
    el('C_DOC', C_DOC),
    el('C_DOC_SUB', doc.cDocSub),
    el('C_DOC_VER', doc.cDocVer),
    el('C_DOC_TYPE', doc.cDocType),
    el('C_DOC_CNT', doc.cDocCnt),
    el('C_REG', cReg),
    el('C_RAJ', cRaj),
    el('PERIOD_MONTH', PERIOD_MONTH),
    el('PERIOD_TYPE', PERIOD_TYPE),
    el('PERIOD_YEAR', ctx.year),
    el('C_STI_ORIG', cReg * 100 + cRaj),
    el('C_DOC_STAN', doc.cDocStan),
    ...(linked.length > 0
      ? [
          group(
            'LINKED_DOCS',
            linked.map((link, i) =>
              group(
                'DOC',
                [
                  el('C_DOC', C_DOC),
                  el('C_DOC_SUB', link.doc.cDocSub),
                  el('C_DOC_VER', link.doc.cDocVer),
                  el('C_DOC_TYPE', link.doc.cDocType),
                  el('C_DOC_CNT', link.doc.cDocCnt),
                  el('C_DOC_STAN', link.doc.cDocStan),
                  el('FILENAME', docFileName(ctx, link.doc)),
                ],
                ` NUM="${i + 1}" TYPE="${link.type}"`,
              ),
            ),
          ),
        ]
      : []),
    el('D_FILL', ctx.fillDate),
    el('SOFTWARE', 'Taxered'),
  ];
}
