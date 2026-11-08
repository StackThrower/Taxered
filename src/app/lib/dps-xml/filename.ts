/**
 * File name of an e-report (standard, order No. 729; pattern DGFilename in common_types.xsd):
 *
 *   1–4    C_REG + C_RAJ          24–25  C_DOC_TYPE, 2 chars
 *   5–14   TIN, 10 chars          26–32  C_DOC_CNT, 7 chars
 *   15–17  C_DOC                  33     PERIOD_TYPE
 *   18–20  C_DOC_SUB              34–35  PERIOD_MONTH
 *   21–22  C_DOC_VER              36–39  PERIOD_YEAR
 *   23     C_DOC_STAN             40–43  C_STI_ORIG
 */
export interface FileNameParts {
  taxOffice: string;
  tin: string;
  cDoc: string;
  cDocSub: string;
  cDocVer: string;
  cDocStan: number;
  cDocType: number;
  cDocCnt: number;
  periodType: number;
  periodMonth: number;
  year: number;
}

/** A 10-digit RNOKPP stays, a 9-digit ID-card number gets a leading zero, a passport gets "00". */
export function fileNameTin(tin: string): string {
  return /^\d+$/.test(tin) ? tin.padStart(10, '0') : `00${tin}`;
}

export function buildFileName(p: FileNameParts): string {
  const office = p.taxOffice.padStart(4, '0');
  return (
    office +
    fileNameTin(p.tin) +
    p.cDoc +
    p.cDocSub +
    p.cDocVer.padStart(2, '0') +
    p.cDocStan +
    String(p.cDocType).padStart(2, '0') +
    String(p.cDocCnt).padStart(7, '0') +
    p.periodType +
    String(p.periodMonth).padStart(2, '0') +
    p.year +
    office +
    '.xml'
  );
}
