/**
 * Spreads-and-fees sub-agent: what swaps and network fees cost, from a Ledger Live CSV history.
 */
import { tool } from '@langchain/core/tools';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import { spreadsByPair, type Swap } from '../../app/lib/ledger-csv';
import { artifactId, emitArtifact, emitFile, result, sessionOf } from '../context';
import { isoDate, loadLedgerFile } from './ledger-file';

export const SPREADS_PROMPT = `You are the spreads-and-fees sub-agent of Taxered. From a Ledger Live operation history (CSV) you find what the user lost on swap spreads (value given minus value received, at Ledger's prices at the time) and on network fees.

How to work:
- Call analyze_spreads_and_fees; never compute spreads yourself.
- Swaps are matched two ways: both sides in one transaction ("tx"), or a send and a later receive through a provider or bridge matched by value ("linked"). Linked matches are heuristic — mention it when they make a big share of the total, and offer to recompute without them (includeLinked: false).
- The chat shows the totals, the table by pair and the fees automatically; in your answer name the most expensive pairs and swaps and give one or two practical takeaways.
- export_spreads_report makes an Excel workbook with every swap, pair and fee.
- Reply in the user's language (Ukrainian by default). Amounts are in the file's fiat currency.`;

function totals(swaps: readonly Swap[]) {
  const given = swaps.reduce((sum, s) => sum + s.givenValue, 0);
  const received = swaps.reduce((sum, s) => sum + s.receivedValue, 0);
  const spread = given - received;
  return {
    swaps: swaps.length,
    given,
    received,
    spread,
    spreadPercent: given > 0 ? (spread / given) * 100 : 0,
    swapFees: swaps.reduce((sum, s) => sum + s.fee, 0),
  };
}

function selectSwaps(swaps: readonly Swap[], includeLinked: boolean): Swap[] {
  return includeLinked ? [...swaps] : swaps.filter((s) => s.kind === 'tx');
}

function legs(swap: Swap, side: 'given' | 'received'): string {
  return swap[side].map((l) => `${l.amount} ${l.ticker}`).join(' + ');
}

const analyzeSpreads = tool(
  async ({ fileId, includeLinked }, config) => {
    const session = sessionOf(config);
    const ledger = await loadLedgerFile(session, fileId);
    const { analysis } = ledger;
    const linked = includeLinked ?? true;
    const swaps = selectSwaps(analysis.swaps, linked);

    await emitArtifact(
      {
        kind: 'spreads',
        id: artifactId(),
        fileName: ledger.file.name,
        includeLinked: linked,
        analysis,
      },
      config,
    );

    return result({
      file: ledger.file.name,
      note: ledger.note,
      fiat: analysis.fiat,
      period: { from: isoDate(analysis.from), to: isoDate(analysis.to) },
      operations: analysis.operations,
      unconfirmedSkipped: analysis.skipped,
      swaps: totals(swaps),
      linkedSwaps: analysis.swaps.filter((s) => s.kind === 'linked').length,
      networkFees: {
        total: analysis.feeValue,
        byAccount: analysis.fees
          .slice()
          .sort((a, b) => b.value - a.value)
          .slice(0, 10)
          .map((f) => ({
            account: f.account,
            ticker: f.ticker,
            transactions: f.transactions,
            amount: f.amount,
            value: f.value,
          })),
      },
      topPairs: spreadsByPair(swaps)
        .slice()
        .sort((a, b) => b.spread - a.spread)
        .slice(0, 10),
      costliestSwaps: swaps
        .slice()
        .sort((a, b) => b.spread - a.spread)
        .slice(0, 5)
        .map((s) => ({
          date: isoDate(s.time),
          kind: s.kind,
          given: legs(s, 'given'),
          received: legs(s, 'received'),
          spread: s.spread,
          spreadPercent: s.spreadPercent,
          fee: s.fee,
        })),
    });
  },
  {
    name: 'analyze_spreads_and_fees',
    description:
      'Swap spreads and network fees of an uploaded Ledger Live CSV; shows the summary, the table by pair and the fees in the chat.',
    schema: z.object({
      fileId: z.string().optional().describe('Ledger CSV id; the latest one if omitted.'),
      includeLinked: z
        .boolean()
        .optional()
        .describe('Count send/receive pairs matched by value (default true).'),
    }),
  },
);

const exportSpreads = tool(
  async ({ fileId, includeLinked }, config) => {
    const session = sessionOf(config);
    const { file, analysis } = await loadLedgerFile(session, fileId);
    const swaps = selectSwaps(analysis.swaps, includeLinked ?? true);
    const fiat = analysis.fiat;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        [
          'Дата',
          'Тип',
          'Віддано',
          'Отримано',
          `Віддано, ${fiat}`,
          `Отримано, ${fiat}`,
          `Спред, ${fiat}`,
          'Спред, %',
          `Комісія, ${fiat}`,
          'Хеші',
        ],
        ...swaps.map((s) => [
          new Date(s.time).toISOString().replace('T', ' ').slice(0, 19),
          s.kind === 'tx' ? 'в одній транзакції' : 'зіставлено',
          legs(s, 'given'),
          legs(s, 'received'),
          s.givenValue,
          s.receivedValue,
          s.spread,
          s.spreadPercent,
          s.fee,
          s.hashes.join(' '),
        ]),
      ]),
      'Обміни',
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        [
          'Пара',
          'Обмінів',
          `Віддано, ${fiat}`,
          `Отримано, ${fiat}`,
          `Спред, ${fiat}`,
          'Спред, %',
          `Комісія, ${fiat}`,
        ],
        ...spreadsByPair(swaps).map((p) => [
          p.pair,
          p.swaps,
          p.givenValue,
          p.receivedValue,
          p.spread,
          p.spreadPercent,
          p.fee,
        ]),
      ]),
      'Пари',
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['Рахунок', 'Монета', 'Транзакцій', 'Кількість', `Вартість, ${fiat}`],
        ...analysis.fees.map((f) => [f.account, f.ticker, f.transactions, f.amount, f.value]),
      ]),
      'Комісії мережі',
    );
    const bytes = new Uint8Array(
      XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer,
    );
    const name = `Taxered_spredy_komisii_${isoDate(analysis.from)}_${isoDate(analysis.to)}.xlsx`;
    await emitFile(
      config,
      name,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      bytes,
      `Спреди та комісії з «${file.name}» (Excel)`,
    );
    return result({ file: name, swaps: swaps.length });
  },
  {
    name: 'export_spreads_report',
    description: 'Excel workbook with every swap, the spreads by pair and the network fees.',
    schema: z.object({
      fileId: z.string().optional(),
      includeLinked: z.boolean().optional(),
    }),
  },
);

export const spreadsTools = [analyzeSpreads, exportSpreads];
