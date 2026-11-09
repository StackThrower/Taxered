/**
 * What the chat server and the browser exchange. Artifacts carry the inputs of a calculation,
 * not its rendered result: the browser runs the same pure functions (`calculateTaxes`,
 * `analyzeReturns`, `spreadsByPair`, ...) the agent's tools ran, so a form or chart in the
 * chat always matches the figures the agent reported.
 */
import type { FinancialPosition, TaxOptions } from '../declaration/f0121214/tax-model';
import type { LedgerAnalysis, LedgerOperation } from '../lib/ledger-csv';
import type { DisplayCurrency, YearInput } from '../lib/returns-model';
import type { Metric, Region } from '../lib/tax-data';

/** The sub-agents the supervisor delegates to. */
export type AgentName = 'f1' | 'returns' | 'tax_map' | 'spreads' | 'ledger';

/** What an uploaded file was recognised as. */
export type FileKind = 'ib_xml' | 'ff_xml' | 'ib_csv' | 'ledger_csv' | 'unknown';

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  kind: FileKind;
}

/** Ф1 annex: the positions and options of the calculation; the browser recomputes it. */
export interface F1Artifact {
  kind: 'f1';
  id: string;
  year: string;
  positions: FinancialPosition[];
  options: TaxOptions;
}

/** Year-by-year returns: the inputs of `analyzeReturns`. */
export interface ReturnsArtifact {
  kind: 'returns';
  id: string;
  currency: DisplayCurrency;
  years: YearInput[];
  initialCapital: number;
  includeTaxes: boolean;
  taxesPaidSeparately: boolean;
  usdRates: Record<number, number | null>;
}

export interface TaxMapArtifact {
  kind: 'tax-map';
  id: string;
  metric: Metric;
  view: Region | 'world';
  /** Country (ISO alpha-2) whose card is open, if any. */
  selected: string | null;
  /** Countries listed in the table under the map, in order. */
  highlight: string[];
}

/** Swap spreads and network fees of a Ledger Live history. */
export interface SpreadsArtifact {
  kind: 'spreads';
  id: string;
  fileName: string;
  includeLinked: boolean;
  analysis: LedgerAnalysis;
}

/** Ledger Live portfolio: balances, value over time and current holdings. */
export interface LedgerArtifact {
  kind: 'ledger';
  id: string;
  fileName: string;
  operations: LedgerOperation[];
  analysis: LedgerAnalysis;
}

/** A chart the agent composed from its own figures. */
export interface ChartArtifact {
  kind: 'chart';
  id: string;
  title: string;
  chart: 'bar' | 'line';
  categories: string[];
  series: { label: string; values: number[] }[];
  /** `money` values are in `currency`. */
  unit: 'money' | 'percent' | 'number';
  currency?: string;
}

/** A generated file (PDF, Excel, XML package, CSV) to download. */
export interface FileArtifact {
  kind: 'file';
  id: string;
  name: string;
  mime: string;
  size: number;
  /** Same-origin download URL. */
  url: string;
  description: string;
}

export type ChatArtifact =
  | F1Artifact
  | ReturnsArtifact
  | TaxMapArtifact
  | SpreadsArtifact
  | LedgerArtifact
  | ChartArtifact
  | FileArtifact;

/** Server-sent events of one answer, in order; `done` or `error` ends the stream. */
export type ChatStreamEvent =
  | { type: 'status'; agent: AgentName | null; text: string }
  | { type: 'token'; text: string }
  | { type: 'artifact'; artifact: ChatArtifact }
  | { type: 'error'; message: string }
  | { type: 'done' };

export interface ChatRequest {
  threadId: string;
  text: string;
  /** Files uploaded for this message. */
  fileIds: string[];
}

export const CHAT_API = '/api/chat';

/** Upload limits, enforced by the server and checked by the browser first. */
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_FILES_PER_THREAD = 30;
export const MAX_MESSAGE_CHARS = 8000;

export const AGENT_LABELS: Record<AgentName, string> = {
  f1: 'Декларація Ф1',
  returns: 'Дохідність інвестицій',
  tax_map: 'Карта податків',
  spreads: 'Спреди та комісії',
  ledger: 'Портфель Ledger',
};
