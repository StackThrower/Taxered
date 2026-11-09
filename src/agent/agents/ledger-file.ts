/** Reads an uploaded Ledger Live CSV for the spreads and portfolio sub-agents. */
import {
  analyzeLedger,
  parseLedgerCsv,
  type LedgerAnalysis,
  type LedgerOperation,
} from '../../app/lib/ledger-csv';
import { pickFiles } from '../context';
import type { Session, StoredFile } from '../session';

export interface LedgerFile {
  file: StoredFile;
  operations: LedgerOperation[];
  analysis: LedgerAnalysis;
  /** Set when several Ledger files were uploaded and none was named. */
  note?: string;
}

export async function loadLedgerFile(
  session: Session,
  fileId: string | undefined,
): Promise<LedgerFile> {
  const files = await pickFiles(session, fileId ? [fileId] : undefined, ['ledger_csv']);
  const file = files[files.length - 1];
  const operations = parseLedgerCsv(file.content);
  const analysis = analyzeLedger(operations);
  if (analysis.operations === 0) {
    throw new Error(`У «${file.name}» немає підтверджених операцій.`);
  }
  return {
    file,
    operations,
    analysis,
    note:
      files.length > 1
        ? `Завантажено ${files.length} файлів Ledger; використано останній — «${file.name}». Вкажіть fileId, щоб узяти інший.`
        : undefined,
  };
}

export function isoDate(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}
